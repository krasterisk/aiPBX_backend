"""Ticket timeline, threading and operator lifecycle, separate from SMTP state."""
import json
SCHEMA='''
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS case_status text NOT NULL DEFAULT 'open';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS executor_id bigint REFERENCES hd_users(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS processing_version integer NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS next_attempt timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE revisions ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE revisions ALTER COLUMN created_at SET DEFAULT now();
CREATE TABLE IF NOT EXISTS hd_messages (id bigserial PRIMARY KEY,ticket_id bigint NOT NULL REFERENCES tickets(id),mail_key text NOT NULL UNIQUE,direction text NOT NULL,subject text NOT NULL,body text NOT NULL,message_id text NOT NULL DEFAULT '',refs text NOT NULL DEFAULT '',pending boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hd_messages_thread ON hd_messages(message_id);
CREATE TABLE IF NOT EXISTS hd_ticket_events (id bigserial PRIMARY KEY,ticket_id bigint NOT NULL REFERENCES tickets(id),event text NOT NULL,actor text NOT NULL DEFAULT 'executor:model',data jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO hd_messages(ticket_id,mail_key,direction,subject,body,message_id,refs,created_at) SELECT id,mail_key,'inbound',subject,body,message_id,refs,created_at FROM tickets ON CONFLICT(mail_key) DO NOTHING;
INSERT INTO hd_messages(ticket_id,mail_key,direction,subject,body,message_id,created_at) SELECT id,outgoing_id,'outbound',subject,draft,outgoing_id,updated_at FROM tickets WHERE status='sent' AND outgoing_id IS NOT NULL ON CONFLICT(mail_key) DO NOTHING;
'''
CASES={'open','in_progress','waiting_client','resolved','closed'}
def event(c,tid,name,data=None,actor='executor:model'):
    c.execute('INSERT INTO hd_ticket_events(ticket_id,event,actor,data) VALUES(%s,%s,%s,%s::jsonb)',(tid,name,actor,json.dumps(data or {},default=str,ensure_ascii=False)))

def ingest(c,key,sender,subject,mid,refs,body,status):
    if c.execute('SELECT id FROM hd_messages WHERE mail_key=%s',(key,)).fetchone():return None
    reference_ids=refs.split()
    prior=None
    if status!='ignored' and reference_ids:
        prior=c.execute('''SELECT t.id FROM tickets t JOIN hd_messages m ON m.ticket_id=t.id WHERE t.sender=%s AND m.message_id=ANY(%s) ORDER BY t.id DESC LIMIT 1''',(sender,reference_ids)).fetchone()
    if prior:
        tid=prior['id'];pending=True
    else:
        row=c.execute('''INSERT INTO tickets(mail_key,sender,subject,message_id,refs,body,status) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(mail_key) DO NOTHING RETURNING id''',(key,sender,subject,mid,refs,body,status)).fetchone()
        if not row:return None
        tid=row['id'];pending=False
    c.execute('INSERT INTO hd_messages(ticket_id,mail_key,direction,subject,body,message_id,refs,pending) VALUES(%s,%s,\'inbound\',%s,%s,%s,%s,%s)',(tid,key,subject,body,mid,refs,pending))
    event(c,tid,'email_received',{'messageId':mid,'threadReply':bool(prior)},'mail')
    return tid

def promote(c):
    rows=c.execute('''SELECT DISTINCT ticket_id FROM hd_messages WHERE pending ORDER BY ticket_id LIMIT 20''').fetchall()
    for row in rows:
        tid=row['ticket_id'];t=c.execute('SELECT status FROM tickets WHERE id=%s FOR UPDATE',(tid,)).fetchone()
        if t['status'] in ['sending','send_uncertain']:continue
        m=c.execute('SELECT * FROM hd_messages WHERE ticket_id=%s AND pending ORDER BY id DESC LIMIT 1',(tid,)).fetchone()
        c.execute('''UPDATE tickets SET subject=%s,body=%s,message_id=%s,refs=%s,status='received',processing_version=processing_version+1,case_status='open',draft=NULL,draft_hash=NULL,mapping_notified=false,next_attempt=NULL,last_error=NULL,updated_at=now() WHERE id=%s''',(m['subject'],m['body'],m['message_id'],m['refs'],tid))
        c.execute('UPDATE hd_messages SET pending=false WHERE ticket_id=%s',(tid,))
        event(c,tid,'thread_reopened',{'messageId':m['message_id']},'mail')

def resume_configured(c):
    rows=c.execute("""SELECT t.id,co.client_id FROM tickets t JOIN hd_contacts co ON co.email=t.sender JOIN hd_clients cl ON cl.id=co.client_id WHERE t.status='needs_mapping' AND t.case_status NOT IN ('closed','resolved') AND cl.active AND EXISTS(SELECT 1 FROM hd_bindings b JOIN hd_sources s ON s.id=b.source_id WHERE b.client_id=cl.id AND b.active AND s.active AND jsonb_array_length(b.operations)>0) ORDER BY t.id LIMIT 20 FOR UPDATE OF t""").fetchall()
    for row in rows:
        c.execute("UPDATE tickets SET status='received',registry_client_id=%s,next_attempt=NULL,last_error=NULL,updated_at=now() WHERE id=%s",(row['client_id'],row['id']))
        event(c,row['id'],'registry_configuration_ready',{'clientId':row['client_id']},'registry')

def can_view(c,user,tid):
    return bool(c.execute('''SELECT t.id FROM tickets t LEFT JOIN hd_clients cl ON cl.id=t.registry_client_id WHERE t.id=%s AND (%s OR t.executor_id=%s OR (t.executor_id IS NULL AND cl.executor_id=%s))''',(tid,user['role']=='admin',user['id'],user['id'])).fetchone())

def listing(c,user,query):
    search=str(query.get('search',''))[:200];case=query.get('case','');offset=max(0,min(100000,int(query.get('offset','0'))))
    filters=['(%s OR t.executor_id=%s OR (t.executor_id IS NULL AND cl.executor_id=%s))'];args=[user['role']=='admin',user['id'],user['id']]
    if case:
        if case not in CASES:raise ValueError('Неизвестный статус')
        filters.append('t.case_status=%s');args.append(case)
    if search:filters.append('(t.subject ILIKE %s OR t.sender ILIKE %s OR cl.name ILIKE %s OR CAST(t.id AS text)=%s)');args.extend(['%'+search+'%']*3+[search.lstrip('#')])
    where=' AND '.join(filters)
    count=c.execute('SELECT count(*) AS n FROM tickets t LEFT JOIN hd_clients cl ON cl.id=t.registry_client_id WHERE '+where,args).fetchone()['n']
    rows=c.execute('''SELECT t.id,t.sender,t.subject,t.status,t.case_status,t.registry_client_id,t.executor_id,t.revision,t.created_at,t.updated_at,t.last_error,cl.name AS client_name,u.name AS executor_name FROM tickets t LEFT JOIN hd_clients cl ON cl.id=t.registry_client_id LEFT JOIN hd_users u ON u.id=COALESCE(t.executor_id,cl.executor_id) WHERE '''+where+' ORDER BY t.updated_at DESC,t.id DESC LIMIT 50 OFFSET %s',args+[offset]).fetchall()
    return {'tickets':rows,'total':count,'offset':offset}

def detail(c,user,tid):
    if not can_view(c,user,tid):raise PermissionError()
    t=c.execute('SELECT * FROM tickets WHERE id=%s',(tid,)).fetchone()
    t['messages']=c.execute('SELECT * FROM hd_messages WHERE ticket_id=%s ORDER BY id',(tid,)).fetchall()
    t['revisions']=c.execute('SELECT revision,body,hash,created_at FROM revisions WHERE ticket_id=%s ORDER BY revision',(tid,)).fetchall()
    timeline=c.execute('SELECT id,event,actor,created_at,data FROM hd_ticket_events WHERE ticket_id=%s ORDER BY id',(tid,)).fetchall()
    audit=c.execute("SELECT id,event,actor,created_at,'{}'::jsonb AS data FROM audit WHERE ticket_id=%s ORDER BY id",(tid,)).fetchall()
    t['timeline']=sorted(timeline+audit,key=lambda x:x['created_at'])
    t['previous']=c.execute('SELECT id,subject,status,case_status,created_at FROM tickets WHERE registry_client_id=%s AND id<>%s ORDER BY id DESC LIMIT 20',(t['registry_client_id'],tid)).fetchall() if t['registry_client_id'] else []
    t['previous']=[p for p in t['previous'] if can_view(c,user,p['id'])]
    return t

def action(c,user,value):
    tid=int(value['ticket_id'])
    if not can_view(c,user,tid):raise PermissionError()
    t=c.execute('SELECT * FROM tickets WHERE id=%s FOR UPDATE',(tid,)).fetchone();kind=value['action'];actor='user:'+str(user['id'])
    if kind=='comment':
        text=str(value.get('text','')).strip()
        if not text or len(text)>10000:raise ValueError('Комментарий: 1–10000 символов')
        event(c,tid,'operator_comment',{'text':text},actor)
    elif kind=='case':
        case=value['case_status']
        if case not in CASES:raise ValueError('Неизвестный статус обращения')
        c.execute('UPDATE tickets SET case_status=%s,updated_at=now() WHERE id=%s',(case,tid));event(c,tid,'case_status_changed',{'from':t['case_status'],'to':case},actor)
    elif kind=='assign':
        if user['role']!='admin':raise PermissionError()
        uid=value.get('executor_id') or None
        if uid and not c.execute('SELECT id FROM hd_users WHERE id=%s AND active',(int(uid),)).fetchone():raise ValueError('Исполнитель не найден')
        c.execute('UPDATE tickets SET executor_id=%s,updated_at=now() WHERE id=%s',(uid,tid));event(c,tid,'executor_assigned',{'executorId':uid},actor)
    elif kind=='retry':
        if t['status'] not in ['received','needs_mapping','rejected','pending_approval']:raise ValueError('Повтор подготовки запрещён при отправке или после её завершения')
        c.execute("UPDATE tickets SET status='received',processing_version=processing_version+1,draft=NULL,draft_hash=NULL,case_status='open',next_attempt=NULL,last_error=NULL,mapping_notified=false,updated_at=now() WHERE id=%s",(tid,));event(c,tid,'preparation_retried',{},actor)
    else:raise ValueError('Неизвестное действие')