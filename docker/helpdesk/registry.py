"""Operator-owned identities and source bindings. Never infer clients from aiPBX."""
import json,re
SCHEMA='''
CREATE TABLE IF NOT EXISTS hd_clients (id bigserial PRIMARY KEY,name text NOT NULL,notes text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hd_contacts (email text PRIMARY KEY,client_id bigint NOT NULL REFERENCES hd_clients(id));
CREATE TABLE IF NOT EXISTS hd_sources (id bigserial PRIMARY KEY,name text NOT NULL,kind text NOT NULL,config jsonb NOT NULL,active boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hd_bindings (client_id bigint REFERENCES hd_clients(id),source_id bigint REFERENCES hd_sources(id),params jsonb NOT NULL DEFAULT '{}',instructions text NOT NULL DEFAULT '',operations jsonb NOT NULL DEFAULT '[]',active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(client_id,source_id));
CREATE TABLE IF NOT EXISTS hd_source_versions (source_id bigint REFERENCES hd_sources(id),revision integer,kind text,name text,config jsonb,actor text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_id,revision));
CREATE TABLE IF NOT EXISTS hd_binding_versions (client_id bigint REFERENCES hd_clients(id),source_id bigint REFERENCES hd_sources(id),revision integer,params jsonb,instructions text,operations jsonb,actor text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(client_id,source_id,revision));
INSERT INTO hd_source_versions(source_id,revision,kind,name,config,actor) SELECT id,revision,kind,name,config,'migration' FROM hd_sources ON CONFLICT DO NOTHING;
INSERT INTO hd_binding_versions(client_id,source_id,revision,params,instructions,operations,actor) SELECT client_id,source_id,revision,params,instructions,operations,'migration' FROM hd_bindings ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS registry_client_id bigint REFERENCES hd_clients(id);
'''
def email_address(v):
    v=str(v).strip().lower()
    if len(v)>254 or not re.fullmatch(r'[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+',v):raise ValueError('Некорректный email')
    return v

def resolve(c,sender):
    return c.execute('SELECT cl.* FROM hd_clients cl JOIN hd_contacts co ON co.client_id=cl.id WHERE co.email=%s AND cl.active',(email_address(sender),)).fetchone()

def bindings(c,cid,include_inactive=False):
    return c.execute('''SELECT s.*,b.params,b.instructions,b.operations AS allowed_operations,b.revision AS binding_revision FROM hd_sources s JOIN hd_bindings b ON b.source_id=s.id WHERE b.client_id=%s AND ((b.active AND s.active) OR %s) ORDER BY s.id''',(cid,include_inactive)).fetchall()

def bind_ticket(c,tid,cid,actor):
    t=c.execute('SELECT * FROM tickets WHERE id=%s FOR UPDATE',(tid,)).fetchone()
    client=c.execute('SELECT * FROM hd_clients WHERE id=%s AND active',(cid,)).fetchone()
    if not t or not client:raise ValueError('Письмо или активный клиент не найден')
    resume=t['status'] in ['needs_mapping','received']
    if not resume and t['status'] not in ['sent','rejected','ignored']:raise ValueError('Нельзя менять клиента во время подготовки/согласования/отправки')
    contact=c.execute('SELECT client_id FROM hd_contacts WHERE email=%s',(t['sender'],)).fetchone()
    if contact and contact['client_id']!=cid:raise ValueError('Email уже принадлежит другому клиенту; исправьте в веб-кабинете')
    c.execute('INSERT INTO hd_contacts(email,client_id) VALUES(%s,%s) ON CONFLICT(email) DO NOTHING',(t['sender'],cid))
    if resume:
        c.execute("UPDATE tickets SET registry_client_id=%s,client_id=%s,project_id='registry',context=NULL,processing_version=processing_version+1,status='received',mapping_notified=false,next_attempt=NULL,last_error=NULL,updated_at=now() WHERE id=%s",(cid,'registry:'+str(cid),tid))
    else:
        c.execute("UPDATE tickets SET registry_client_id=%s,client_id=%s,project_id='registry',updated_at=now() WHERE id=%s",(cid,'registry:'+str(cid),tid))
    c.execute("UPDATE agreements SET client_id=%s,project_id='registry' WHERE source_ticket_id=%s",('registry:'+str(cid),tid))
    c.execute("INSERT INTO audit(ticket_id,event,actor) VALUES(%s,'registry_client_bound',%s)",(tid,str(actor)))
    return client['name']

def snapshot(c):
    clients=c.execute('SELECT * FROM hd_clients ORDER BY id').fetchall()
    for cl in clients:
        cl['emails']=[r['email'] for r in c.execute('SELECT email FROM hd_contacts WHERE client_id=%s ORDER BY email',(cl['id'],))]
        cl['bindings']=c.execute('SELECT * FROM hd_bindings WHERE client_id=%s ORDER BY source_id',(cl['id'],)).fetchall()
    return {'clients':clients,'sources':c.execute('SELECT * FROM hd_sources ORDER BY id').fetchall()}

def save_client(c,v):
    name=str(v.get('name','')).strip();notes=str(v.get('notes',''))
    if not name or len(name)>200 or len(notes)>10000:raise ValueError('Укажите имя клиента (до 200 символов)')
    emails=list(dict.fromkeys(email_address(e) for e in v.get('emails',[])))
    if len(emails)>100:raise ValueError('Не более 100 email')
    cid=v.get('id')
    if cid:
        if not c.execute('UPDATE hd_clients SET name=%s,notes=%s,active=%s,updated_at=now() WHERE id=%s RETURNING id',(name,notes,bool(v.get('active',True)),cid)).fetchone():raise ValueError('Клиент не найден')
    else:cid=c.execute('INSERT INTO hd_clients(name,notes) VALUES(%s,%s) RETURNING id',(name,notes)).fetchone()['id']
    for address in emails:
        existing=c.execute('SELECT client_id FROM hd_contacts WHERE email=%s',(address,)).fetchone()
        if existing and existing['client_id']!=cid:raise ValueError('Email уже принадлежит другому клиенту')
    c.execute('DELETE FROM hd_contacts WHERE client_id=%s',(cid,))
    for address in emails:c.execute('INSERT INTO hd_contacts(email,client_id) VALUES(%s,%s)',(address,cid))
    return cid

def save_binding(c,v,actor="operator"):
    from connectors import validate_public,validate_params
    cid=int(v['client_id']);sid=int(v['source_id']);params=v.get('params',{});ops=v.get('operations',[])
    validate_public(params);validate_params(params)
    source=c.execute('SELECT config FROM hd_sources WHERE id=%s',(sid,)).fetchone()
    if not source:raise ValueError('Источник не найден')
    catalog={o['id'] for o in source['config']['operations']}
    if not ops or not isinstance(ops,list) or any(o not in catalog for o in ops):raise ValueError('Выберите разрешённые операции')
    c.execute('''INSERT INTO hd_bindings(client_id,source_id,params,instructions,operations,active) VALUES(%s,%s,%s::jsonb,%s,%s::jsonb,%s) ON CONFLICT(client_id,source_id) DO UPDATE SET params=excluded.params,instructions=excluded.instructions,operations=excluded.operations,active=excluded.active,revision=hd_bindings.revision+1''',(cid,sid,json.dumps(params),str(v.get('instructions',''))[:10000],json.dumps(ops),bool(v.get('active',True))))
    c.execute("INSERT INTO hd_binding_versions(client_id,source_id,revision,params,instructions,operations,actor) SELECT client_id,source_id,revision,params,instructions,operations,%s FROM hd_bindings WHERE client_id=%s AND source_id=%s ON CONFLICT DO NOTHING",(actor,cid,sid))
