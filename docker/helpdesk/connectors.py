"""Configured, bounded read operations. Credentials never enter model inputs."""
import os,json,re,hashlib,base64,shlex,ssl,time,tempfile,threading
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime,timezone
from urllib.parse import urlsplit,quote
import requests,psycopg
from psycopg.rows import dict_row
KINDS={'aipbx','http','postgres','mysql','ssh','knowledge','mcp'}
PRIVATE=Path(os.getenv('PRIVATE_DIR','/private'))
_secret_lock=threading.RLock()
SENSITIVE=re.compile(r'password|passwd|secret|token|bearer|credential|cookie|authorization|private.?key|api.?key',re.I)

def validate_public(value):
    if isinstance(value,dict):
        for k,v in value.items():
            if SENSITIVE.search(k):raise ValueError('Секреты вводятся в отдельные поля доступа')
            validate_public(v)
    elif isinstance(value,list):
        for v in value:validate_public(v)

def validate_params(v):
    if not isinstance(v,dict) or len(v)>30 or any(not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*',k) or not isinstance(x,(str,int,float,bool)) or len(str(x))>1000 for k,x in v.items()):raise ValueError('Параметры должны быть объектом простых значений')

def url(value):
    p=urlsplit(value)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment:raise ValueError('Требуется HTTPS-адрес без секретов и query string')
    return value.rstrip('/')

def validate_config(kind,cfg):
    if kind not in KINDS or not isinstance(cfg,dict):raise ValueError('Неизвестный тип источника')
    validate_public(cfg)
    if kind in {'http','aipbx','mcp'}:url(cfg.get('url',''))
    if kind in {'postgres','mysql','ssh'}:
        if not re.fullmatch(r'[a-zA-Z0-9_.:-]+',cfg.get('host','')):raise ValueError('Укажите hostname/IP')
        if not 0<int(cfg.get('port',22 if kind=='ssh' else 5432 if kind=='postgres' else 3306))<65536:raise ValueError('Некорректный порт')
    if kind=='ssh' and not re.fullmatch(r'SHA256:[a-zA-Z0-9+/]+',cfg.get('host_fingerprint','')):raise ValueError('Для SSH нужен проверенный SHA256 fingerprint сервера')
    ops=cfg.get('operations')
    if not isinstance(ops,list) or not 1<=len(ops)<=20:raise ValueError('Нужны 1–20 операций чтения')
    ids=set()
    for op in ops:
        if not isinstance(op,dict) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,50}',op.get('id','')) or op['id'] in ids:raise ValueError('ID операций должны быть уникальными')
        ids.add(op['id'])
        if not op.get('description'):raise ValueError('Опишите назначение каждой операции')
        if kind in {'postgres','mysql'}:
            query=op.get('query','').strip()
            if not re.match(r'^SELECT\s',query,re.I) or ';' in query or re.search(r'\b(INTO|FOR\s+UPDATE|COPY|pg_sleep|dblink)\b',query,re.I):raise ValueError('Разрешён один SELECT без INTO/FOR UPDATE')
        if kind=='http':
            path=op.get('path','')
            if not path.startswith('/') or path.startswith('//') or '..' in path or '?' in path:raise ValueError('Путь API должен быть относительным без query string')
            if op.get('method','GET') not in ['GET','POST']:raise ValueError('Разрешены GET/POST операции чтения')
        field=op.get('query_param') if kind=='http' else op.get('query_argument') if kind=='mcp' else None
        fixed=op.get('params',{}) if kind=='http' else op.get('arguments',{}) if kind=='mcp' else {}
        if field and (not isinstance(field,str) or field in fixed):raise ValueError('Поисковое поле не должно заменять фиксированные параметры клиента')
        if kind=='aipbx' and op.get('scope') not in ['cabinet','analytics']:raise ValueError('aiPBX scope: cabinet или analytics')
        if kind=='ssh':
            argv=op.get('argv',[])
            valid=isinstance(argv,list) and argv and all(isinstance(a,str) for a in argv)
            if not valid or argv[0] not in ['cat','head','tail','ls','grep','journalctl','systemctl','docker']:raise ValueError('SSH: нужен argv разрешённой команды чтения')
            if argv[0]=='systemctl' and (len(argv)<2 or argv[1] not in ['status','show','is-active']):raise ValueError('systemctl: только status/show/is-active')
            if argv[0]=='docker' and (len(argv)<2 or argv[1] not in ['logs','inspect','ps']):raise ValueError('docker: только logs/inspect/ps')
            if argv[0]=='journalctl' and any(re.match(r'--(rotate|vacuum|flush|sync|relinquish|rebuild|setup|update)',a) for a in argv[1:]):raise ValueError('journalctl: только чтение')
            if any('\n' in a or '\r' in a for a in argv):raise ValueError('SSH argv без переносов строк')
        if kind=='mcp' and not op.get('tool'):raise ValueError('Укажите имя разрешённого read-only MCP tool')
    if kind=='knowledge':
        docs=cfg.get('documents',[])
        if not isinstance(docs,list) or len(docs)>500 or len(json.dumps(docs))>400000:raise ValueError('База знаний: до 500 документов / 400 КБ')
        if any(not isinstance(d,dict) or not isinstance(d.get('text'),str) or not isinstance(d.get('title'),str) for d in docs):raise ValueError('Документы: title и text')

def secret_path(sid):return PRIVATE/('source-'+str(int(sid))+'.json')
def vault_key():return bytes.fromhex(json.loads((PRIVATE/'auth.json').read_text())['vault_key'])
def secrets(sid):
    p=secret_path(sid)
    if not p.exists():return {}
    envelope=json.loads(p.read_text())
    if envelope.get('version')==1:
        value=AESGCM(vault_key()).decrypt(base64.b64decode(envelope['nonce']),base64.b64decode(envelope['ciphertext']),str(int(sid)).encode())
        return json.loads(value)
    # Only for additive migration of earlier protected plaintext files.
    return envelope

@contextmanager
def vault_lock(sid):
    import fcntl
    with _secret_lock, (PRIVATE/('source-'+str(int(sid))+'.lock')).open('a') as lock:
        os.chmod(lock.name,0o600);fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
        try:yield
        finally:fcntl.flock(lock.fileno(),fcntl.LOCK_UN)

def save_secrets(sid,updates,clear=False):
    allowed={'username','password','bearer','private_key','passphrase','headers'}
    if not isinstance(updates,dict) or set(updates)-allowed:raise ValueError('Некорректные поля секрета')
    with vault_lock(sid):
        data={} if clear else secrets(sid)
        for k,v in updates.items():
            if v:data[k]=v
        if not data:
            secret_path(sid).unlink(missing_ok=True);return
        nonce=os.urandom(12)
        encrypted=AESGCM(vault_key()).encrypt(nonce,json.dumps(data).encode(),str(int(sid)).encode())
        envelope={'version':1,'nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(encrypted).decode()}
        p=secret_path(sid)
        with tempfile.NamedTemporaryFile('w',dir=PRIVATE,prefix='vault-',delete=False) as f:
            os.chmod(f.name,0o600);json.dump(envelope,f);temp=Path(f.name)
        try:temp.replace(p)
        finally:temp.unlink(missing_ok=True)

def scrub(value,secret):
    literals=[]
    def collect(v):
        if isinstance(v,dict):
            for x in v.values():collect(x)
        elif isinstance(v,str) and len(v)>=4:literals.append(v)
    collect(secret)
    def walk(v):
        if isinstance(v,dict):return {str(k):('[скрыто]' if SENSITIVE.search(str(k)) else walk(x)) for k,x in v.items()}
        if isinstance(v,list):return [walk(x) for x in v[:100]]
        if isinstance(v,str):
            for literal in literals:v=v.replace(literal,'[скрыто]')
            v=re.sub(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----','[скрыто]',v,flags=re.S)
            v=re.sub(r'(?i)Bearer\s+[a-zA-Z0-9._~+/-]+=*','Bearer [скрыто]',v)
            return re.sub(r'(?i)((?:password|token|secret|api_key)\s*[:=]\s*)[^\s,;]+',r'\1[скрыто]',v)[:18000]
        return v
    return walk(value)

def template(v,params,path=False):
    if isinstance(v,dict):return {k:template(x,params) for k,x in v.items()}
    if isinstance(v,list):return [template(x,params) for x in v]
    if not isinstance(v,str):return v
    exact=re.fullmatch(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}',v)
    if exact and not path:
        if exact[1] not in params:raise ValueError('В привязке не хватает параметра '+exact[1])
        return params[exact[1]]
    def replace(m):
        if m[1] not in params:raise ValueError('В привязке не хватает параметра '+m[1])
        return quote(str(params[m[1]]),safe='') if path else str(params[m[1]])
    return re.sub(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}',replace,v)

def http(session,address,method='GET',data=None,headers=None,rpc_id=None):
    # No redirects: configured endpoints cannot forward credentials elsewhere.
    with session.request(method,address,json=data if method=='POST' else None,params=data if method=='GET' else None,headers=headers or {},timeout=(10,20),allow_redirects=False,stream=True) as r:
        if not 200<=r.status_code<300:raise RuntimeError('Source HTTP '+str(r.status_code))
        collected=bytearray();deadline=time.monotonic()+25
        for chunk in r.iter_content(4096):
            collected.extend(chunk)
            if len(collected)>250000 or time.monotonic()>deadline:raise RuntimeError('Source response limit')
            if rpc_id is not None and 'text/event-stream' in r.headers.get('Content-Type',''):
                for line in collected.decode('utf-8',errors='replace').splitlines():
                    if line.startswith('data:'):
                        try:v=json.loads(line[5:])
                        except ValueError:continue
                        if v.get('id')==rpc_id:return v,dict(r.headers)
        if r.status_code==202 and not collected:return {},dict(r.headers)
        if 'text/event-stream' in r.headers.get('Content-Type',''):raise RuntimeError('MCP result missing')
        try:result=json.loads(collected)
        except ValueError:result={'text':collected.decode('utf-8',errors='replace')}
        return result,dict(r.headers)

def fetch(source,op,question=''):
    cfg=source['config'];kind=source['kind'];params=source['params'];secret=secrets(source['id'])
    if kind=='knowledge':
        words=set(re.findall(r'\w+',question.lower()))
        docs=cfg.get('documents',[])
        if any(d.get('group') for d in docs):
            group=params.get('knowledge_group')
            if not group:raise ValueError('knowledge_group required for grouped knowledge')
            docs=[d for d in docs if not d.get('group') or d['group']==str(group)]
        ranked=sorted(docs,key=lambda d:len(words&set(re.findall(r'\w+',(d['title']+' '+d['text']).lower()))),reverse=True)
        return scrub({'documents':[{'title':d['title'],'text':d['text'][:6000]} for d in ranked[:3]]},secret)
    if kind in {'postgres','mysql'}:
        query=op['query'];values={k:params[k] for k in re.findall(r'%\((\w+)\)s',query)}
        if kind=='postgres':
            with psycopg.connect(host=cfg['host'],port=int(cfg.get('port',5432)),dbname=cfg['database'],user=secret['username'],password=secret['password'],sslmode=cfg.get('sslmode','require'),connect_timeout=10,row_factory=dict_row) as conn:
                conn.read_only=True
                with conn.cursor() as cur:
                    cur.execute("SET LOCAL statement_timeout='10s'");cur.execute(query,values);result=cur.fetchmany(51)
        else:
            import pymysql
            conn=pymysql.connect(host=cfg['host'],port=int(cfg.get('port',3306)),database=cfg['database'],user=secret['username'],password=secret['password'],ssl=ssl.create_default_context() if cfg.get('tls',True) else None,connect_timeout=10,read_timeout=12,write_timeout=12,cursorclass=pymysql.cursors.DictCursor,autocommit=False)
            try:
                if cfg.get('tls',True) and not isinstance(conn._sock,ssl.SSLSocket):raise RuntimeError('MySQL TLS required')
                with conn.cursor() as cur:
                    cur.execute('SET TRANSACTION READ ONLY');cur.execute('START TRANSACTION READ ONLY');cur.execute(query,values);result=cur.fetchmany(51)
                conn.rollback()
            finally:conn.close()
        return scrub({'rows':result[:50],'truncated':len(result)>50},secret)
    if kind=='ssh':
        import paramiko
        expected=cfg['host_fingerprint']
        class PinnedHost(paramiko.MissingHostKeyPolicy):
            def missing_host_key(self,client,hostname,key):
                actual='SHA256:'+base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
                if actual!=expected:raise paramiko.SSHException('Host fingerprint mismatch')
        argv=[str(template(a,params)) for a in op['argv']]
        with tempfile.NamedTemporaryFile('w',delete=True) as keyfile:
            keyfile.write(secret['private_key']);keyfile.flush()
            key=paramiko.PKey.from_path(keyfile.name,password=secret.get('passphrase') or None)
            with paramiko.SSHClient() as client:
                client.set_missing_host_key_policy(PinnedHost())
                client.connect(cfg['host'],port=int(cfg.get('port',22)),username=secret['username'],pkey=key,allow_agent=False,look_for_keys=False,timeout=10,banner_timeout=10,auth_timeout=10)
                _,out,err=client.exec_command(' '.join(shlex.quote(a) for a in argv),timeout=15)
                text=out.read(18000).decode(errors='replace');error=err.read(2000).decode(errors='replace')
                return scrub({'stdout':text,'stderr':error},secret)
    dynamic=op.get('query_param') if kind=='http' else op.get('query_argument') if kind=='mcp' else None
    if dynamic and dynamic in params:raise ValueError('Search cannot override client binding parameters')
    headers=dict(secret.get('headers',{}))
    if secret.get('bearer'):headers['Authorization']='Bearer '+secret['bearer']
    with requests.Session() as session:
        session.trust_env=False
        if secret.get('username') and secret.get('password') and not secret.get('bearer') and 'Authorization' not in headers:
            session.auth=(secret['username'],secret['password'])
        if kind=='aipbx':
            payload={'email':params['account_email'],'scope':op['scope']}
            if op['scope']=='analytics' and params.get('project_id'):payload['projectId']=int(params['project_id'])
            result,_=http(session,cfg['url'].rstrip('/')+'/helpdesk/tools/email-project-context','POST',payload,headers)
            if params.get('cabinet_id') and str(result.get('clientId'))!=str(params['cabinet_id']):raise RuntimeError('Configured cabinet mismatch')
        elif kind=='http':
            payload=template(op.get('params',{}),params)
            if op.get('query_param'):payload[op['query_param']]=question[:500]
            result,_=http(session,cfg['url'].rstrip('/')+template(op['path'],params,path=True),op.get('method','GET'),payload,headers)
        elif kind=='mcp':
            headers.update({'Accept':'application/json, text/event-stream'})
            init,returned=http(session,cfg['url'],'POST',{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'aipbx-helpdesk','version':'1'}}},headers,1)
            version=init.get('result',{}).get('protocolVersion')
            if version not in ['2025-11-25','2025-06-18','2025-03-26']:raise RuntimeError('Unsupported MCP version')
            headers['MCP-Protocol-Version']=version
            session_id=next((v for k,v in returned.items() if k.lower()=='mcp-session-id'),None)
            if session_id:headers['MCP-Session-Id']=session_id
            http(session,cfg['url'],'POST',{'jsonrpc':'2.0','method':'notifications/initialized'},headers)
            args=template(op.get('arguments',{}),params)
            if op.get('query_argument'):args[op['query_argument']]=question[:500]
            response,_=http(session,cfg['url'],'POST',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':op['tool'],'arguments':args}},headers,2)
            if 'error' in response or response.get('result',{}).get('isError'):raise RuntimeError('MCP tool error')
            result=response['result']
            if session_id:
                try:session.delete(cfg['url'],headers=headers,timeout=5)
                except requests.RequestException:pass
        else:raise ValueError('Unsupported connector')
    return scrub(result,secret)

def catalog(sources):
    result={}
    for source in sources:
        for op in source['config']['operations']:
            if op['id'] in source['allowed_operations']:
                key=str(source['id'])+':'+op['id'];result[key]=(source,op)
    return result

def read(item,question=''):
    source,op=item;stamp=datetime.now(timezone.utc).isoformat()
    try:
        value=fetch(source,op,question)
        # Bound the full result even when nested structures are large.
        encoded=json.dumps(value,default=str,ensure_ascii=False)
        if len(encoded)>22000:value={'excerpt':encoded[:22000],'truncated':True}
        return {'sourceId':source['id'],'source':source['name'],'operation':op['id'],'revision':source['revision'],'bindingRevision':source['binding_revision'],'asOf':stamp,'status':'ok','data':value}
    except Exception as e:
        return {'sourceId':source['id'],'operation':op['id'],'asOf':stamp,'status':'unavailable','errorType':type(e).__name__}

def model_data(value,sources):
    known={}
    for source in sources:
        try:known[str(source['id'])]=secrets(source['id'])
        except Exception:continue
    known['runtime']={k:os.environ.get(k,'') for k in ['AIPBX_API_KEY','DEEPSEEK_API_KEY','TELEGRAM_BOT_TOKEN','YANDEX_APP_PASSWORD','BRIDGE_TOKEN']}
    return scrub(value,known)
