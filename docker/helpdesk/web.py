"""Password/JWT console and Telegram Mini App, no public registration."""
import os,json,time,secrets,hashlib,hmac,base64,threading
from pathlib import Path
from http.cookies import SimpleCookie
from urllib.parse import parse_qsl
import jwt
import registry,connectors,ticketing
UI=Path(__file__).parent/'ui'
PREFIX='/helpdesk-clients/'
ORIGIN='https://ipbx.krasterisk.ru'
AUTH_SCHEMA='''
CREATE TABLE IF NOT EXISTS hd_users (id bigserial PRIMARY KEY,login text NOT NULL UNIQUE,name text NOT NULL,role text NOT NULL DEFAULT 'operator',salt text NOT NULL,password_hash text NOT NULL,active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,telegram_id text);
ALTER TABLE hd_clients ADD COLUMN IF NOT EXISTS executor_id bigint REFERENCES hd_users(id);
'''
ATTEMPTS={}
LOGIN_SLOTS=threading.BoundedSemaphore(2)

def password_hash(password,salt):return hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def auth_config():return json.loads((connectors.PRIVATE/'auth.json').read_text())

def bootstrap(c):
    config=auth_config()
    if not c.execute("SELECT id FROM hd_users WHERE role='admin'").fetchone():
        c.execute("INSERT INTO hd_users(login,name,role,salt,password_hash,telegram_id) VALUES(%s,'Владелец','admin',%s,%s,%s)",(config['login'],config['salt'],config['password_hash'],os.getenv('TELEGRAM_APPROVER_USER_ID')))

def issue(user,key):
    now=int(time.time())
    return jwt.encode({'sub':str(user['id']),'ver':user['version'],'iat':now,'exp':now+8*3600,'jti':secrets.token_hex(16),'iss':'helpdesk','aud':'helpdesk-console'},key,algorithm='HS256')

def decode(token,key):return jwt.decode(token,key,algorithms=['HS256'],audience='helpdesk-console',issuer='helpdesk',options={'require':['exp','iat','sub','ver','jti']})

def authenticate(handler,db):
    try:
        authorization=handler.headers.get('Authorization','')
        if authorization:
            if not authorization.startswith('Bearer '):return None
            token=authorization[7:]
        else:
            cookie=SimpleCookie();cookie.load(handler.headers.get('Cookie',''));token=cookie['hd_session'].value
        claims=decode(token,auth_config()['jwt_key'])
        with db() as c:user=c.execute('SELECT id,login,name,role,active,version FROM hd_users WHERE id=%s',(int(claims['sub']),)).fetchone()
        if not user or not user['active'] or user['version']!=claims['ver']:return None
        return user
    except (KeyError,ValueError,OSError,jwt.PyJWTError):return None

def telegram_identity(init_data):
    if not init_data:return None
    fields=dict(parse_qsl(init_data,keep_blank_values=True));given=fields.pop('hash','')
    payload='\n'.join(k+'='+v for k,v in sorted(fields.items()))
    key=hmac.new(b'WebAppData',os.environ['TELEGRAM_BOT_TOKEN'].encode(),hashlib.sha256).digest()
    if not hmac.compare_digest(hmac.new(key,payload.encode(),hashlib.sha256).hexdigest(),given):raise ValueError('Telegram identity invalid')
    age=time.time()-int(fields.get('auth_date','0'))
    if not -30<=age<=3600:raise ValueError('Telegram login expired')
    return str(json.loads(fields['user'])['id'])

def permitted(c,user,cid):
    return bool(c.execute('SELECT id FROM hd_clients WHERE id=%s AND (executor_id=%s OR %s)',(cid,user['id'],user['role']=='admin')).fetchone())

def handle(h,db):
    path=h.path.split('?',1)[0]
    if path not in ['/','/app.js','/style.css'] and not path.startswith('/api/'):return False
    if h.command=='GET' and path in ['/','/app.js','/style.css']:
        file=UI/({'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[path])
        mime={'/':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8'}[path]
        respond(h,200,file.read_bytes(),mime);return True
    if h.command=='POST' and h.headers.get('Origin')!=ORIGIN:
        respond(h,403,{'error':'Недопустимый источник запроса'});return True
    value={}
    if h.command=='POST':
        try:
            size=int(h.headers.get('Content-Length','0'))
            if not 0<size<=600000 or (path=='/api/login' and size>8192):raise ValueError()
            value=json.loads(h.rfile.read(size))
            if not isinstance(value,dict):raise ValueError()
        except (ValueError,TypeError):respond(h,400,{'error':'Некорректный запрос'});return True
    if path=='/api/login' and h.command=='POST':
        address=h.headers.get('X-Real-IP',h.client_address[0]);now=time.monotonic()
        attempts=[t for t in ATTEMPTS.get(address,[]) if now-t<300]
        if len(attempts)>=8:respond(h,429,{'error':'Слишком много попыток. Подождите 5 минут.'});return True
        ATTEMPTS[address]=attempts+[now]
        if not LOGIN_SLOTS.acquire(blocking=False):
            respond(h,429,{'error':'Вход занят. Повторите через несколько секунд.'});return True
        try:
            with db() as c:user=c.execute('SELECT * FROM hd_users WHERE login=%s',(str(value.get('login','')).strip().lower(),)).fetchone()
            salt=user['salt'] if user else '0'*32
            actual=password_hash(str(value.get('password',''))[:1000],salt)
            valid=user and user['active'] and hmac.compare_digest(actual,user['password_hash'])
            tg=telegram_identity(value.get('initData',''))
            if tg and (not user or user.get('telegram_id')!=tg):valid=False
            if not valid:raise ValueError()
            ATTEMPTS.pop(address,None)
            token=issue(user,auth_config()['jwt_key'])
            # Mini Apps may run inside a cross-site iframe with third-party cookies blocked.
            # A validated Telegram login gets a short-lived JWT for memory-only bearer use.
            result={'ok':True}
            if tg:result['token']=token
            policy='None; Partitioned' if tg else 'Strict'
            respond(h,200,result,cookie='hd_session='+token+'; Path='+PREFIX+'; HttpOnly; Secure; SameSite='+policy+'; Max-Age=28800')
        except (ValueError,KeyError,TypeError):respond(h,401,{'error':'Неверный логин, пароль или Telegram-профиль'})
        except Exception:respond(h,503,{'error':'Вход временно недоступен'})
        finally:LOGIN_SLOTS.release()
        return True
    user=authenticate(h,db)
    if not user:respond(h,401,{'error':'Войдите в кабинет'});return True
    try:
        if path=='/api/logout' and h.command=='POST':
            # Increment user version revokes all sessions for this account.
            with db() as c:c.execute('UPDATE hd_users SET version=version+1 WHERE id=%s',(user['id'],))
            respond(h,200,{'ok':True},cookie='hd_session=; Path='+PREFIX+'; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return True
        if path in ['/api/tickets','/api/ticket'] and h.command=='GET':
            query=dict(parse_qsl(h.path.partition('?')[2]))
            with db() as c:result=ticketing.listing(c,user,query) if path=='/api/tickets' else ticketing.detail(c,user,int(query['id']))
            respond(h,200,result);return True
        if path=='/api/ticket-action' and h.command=='POST':
            import bridge
            tid=int(value['ticket_id']);action=value['action'];actor='user:'+str(user['id'])
            with db() as c:
                if not ticketing.can_view(c,user,tid):raise PermissionError()
            if action=='client':
                if user['role']!='admin':raise PermissionError()
                with db() as c:registry.bind_ticket(c,tid,int(value['client_id']),actor)
                respond(h,200,{'ok':True});return True
            if action in ['approve','reject']:
                if user['role']!='admin':raise PermissionError()
                response=bridge.decide(tid,str(value['hash']),action,actor)
                respond(h,200,{'ok':True,'message':response});return True
            if action=='edit':
                with db() as c:
                    t=c.execute('SELECT * FROM tickets WHERE id=%s FOR UPDATE',(tid,)).fetchone()
                    if t['status']!='pending_approval' or t['revision']!=int(value['revision']):raise ValueError('Версия черновика устарела')
                    text=str(value.get('text','')).strip()
                    if not text or len(text)>12000:raise ValueError('Черновик: 1–12000 символов')
                    bridge.save_revision(c,tid,text,t['revision']+1);ticketing.event(c,tid,'operator_draft_edited',{'revision':t['revision']+1},actor)
                try:bridge.preview(tid)
                except Exception:pass
            else:
                with db() as c:ticketing.action(c,user,value)
            respond(h,200,{'ok':True});return True
        if path=='/api/state' and h.command=='GET':
            with db() as c:
                state=registry.snapshot(c)
                if user['role']!='admin':
                    state['clients']=[cl for cl in state['clients'] if cl['executor_id']==user['id']]
                    ids={b['source_id'] for cl in state['clients'] for b in cl['bindings']}
                    state['sources']=[s for s in state['sources'] if s['id'] in ids]
                state['users']=c.execute('SELECT id,login,name,role,active,telegram_id FROM hd_users ORDER BY id').fetchall() if user['role']=='admin' else [user]
            for source in state['sources']:
                source['hasSecret']=connectors.secret_path(source['id']).exists()
                if user['role']!='admin':
                    allowed={op for cl in state['clients'] for b in cl['bindings'] if b['source_id']==source['id'] for op in b['operations']}
                    source['config']={'operations':[{'id':op['id'],'description':op['description']} for op in source['config']['operations'] if op['id'] in allowed]}
            state['me']=user;respond(h,200,state);return True
        if h.command!='POST':respond(h,404,{'error':'Не найдено'});return True
        if path=='/api/check':
            with db() as c:
                cid=int(value['client_id'])
                if not permitted(c,user,cid):raise PermissionError()
                if value.get('ticket_id'):
                    tid=int(value['ticket_id']);t=c.execute('SELECT registry_client_id FROM tickets WHERE id=%s',(tid,)).fetchone()
                    if not t or t['registry_client_id']!=cid or not ticketing.can_view(c,user,tid):raise PermissionError()
                catalog=connectors.catalog(registry.bindings(c,cid,include_inactive=user['role']=='admin'));key=str(int(value['source_id']))+':'+str(value['operation'])
            if key not in catalog:raise ValueError('Операция не разрешена для этого клиента')
            result=connectors.read(catalog[key],str(value.get('query',''))[:500])
            with db() as c:
                if value.get('ticket_id'):
                    tid=int(value['ticket_id'])
                    t=c.execute('SELECT registry_client_id FROM tickets WHERE id=%s',(tid,)).fetchone()
                    if not t or t['registry_client_id']!=cid or not ticketing.can_view(c,user,tid):raise PermissionError()
                    ticketing.event(c,tid,'operator_source_read',result,'user:'+str(user['id']))
                c.execute('INSERT INTO audit(event,actor) VALUES(%s,%s)',('console_source_check',str(user['id'])))
            respond(h,200,result);return True
        if user['role']!='admin':raise PermissionError()
        result={}
        with db() as c:
            if path=='/api/client':
                result['id']=registry.save_client(c,value)
                executor=value.get('executor_id') or None
                if executor and not c.execute('SELECT id FROM hd_users WHERE id=%s AND active',(int(executor),)).fetchone():raise ValueError('Исполнитель не найден')
                c.execute('UPDATE hd_clients SET executor_id=%s WHERE id=%s',(executor,result['id']))
            elif path=='/api/source':
                kind=value['kind'];cfg=value['config'];connectors.validate_config(kind,cfg)
                name=str(value['name']).strip()[:200]
                if not name:raise ValueError('Укажите название источника')
                sid=value.get('id')
                if sid:
                    if not c.execute('UPDATE hd_sources SET name=%s,kind=%s,config=%s::jsonb,active=%s,revision=revision+1,updated_at=now() WHERE id=%s RETURNING id',(name,kind,json.dumps(cfg),bool(value.get('active',False)),sid)).fetchone():raise ValueError('Источник не найден')
                else:sid=c.execute('INSERT INTO hd_sources(name,kind,config,active) VALUES(%s,%s,%s::jsonb,%s) RETURNING id',(name,kind,json.dumps(cfg),bool(value.get('active',False)))).fetchone()['id']
                result['id']=sid
                c.execute('INSERT INTO hd_source_versions(source_id,revision,kind,name,config,actor) SELECT id,revision,kind,name,config,%s FROM hd_sources WHERE id=%s ON CONFLICT DO NOTHING',('user:'+str(user['id']),sid))
                updates=value.get('credentials',{})
                if not isinstance(updates,dict) or set(updates)-{'username','password','bearer','private_key','passphrase','headers'}:raise ValueError('Некорректные поля доступа')
            elif path=='/api/binding':registry.save_binding(c,value,'user:'+str(user['id']))
            elif path=='/api/user':
                login=str(value.get('login','')).strip().lower();name=str(value.get('name','')).strip();uid=value.get('id');password=value.get('password','')
                if not name or not 3<=len(login)<=254:raise ValueError('Укажите имя и логин')
                if not uid or password:
                    if not 12<=len(password)<=1000:raise ValueError('Пароль: не менее 12 символов')
                    salt=secrets.token_hex(16);hashed=password_hash(password,salt)
                if uid:
                    row=c.execute('SELECT role FROM hd_users WHERE id=%s',(uid,)).fetchone()
                    if not row or row['role']=='admin':raise ValueError('Владелец изменяется только через серверную настройку')
                    c.execute('UPDATE hd_users SET name=%s,login=%s,active=%s,telegram_id=%s,version=version+1 WHERE id=%s',(name,login,bool(value.get('active',True)),value.get('telegram_id') or None,uid))
                    if password:c.execute('UPDATE hd_users SET salt=%s,password_hash=%s WHERE id=%s',(salt,hashed,uid))
                else:c.execute("INSERT INTO hd_users(login,name,salt,password_hash,telegram_id) VALUES(%s,%s,%s,%s,%s)",(login,name,salt,hashed,value.get('telegram_id') or None))
            else:respond(h,404,{'error':'Не найдено'});return True
            c.execute('INSERT INTO audit(event,actor) VALUES(%s,%s)',('console_'+path.split('/')[-1],str(user['id'])))
        if path=='/api/source' and (updates or value.get('clearSecret')):connectors.save_secrets(result['id'],updates,bool(value.get('clearSecret')))
        respond(h,200,{'ok':True,**result})
    except PermissionError:respond(h,403,{'error':'Недостаточно прав'})
    except (ValueError,KeyError,TypeError) as e:respond(h,400,{'error':str(e) if isinstance(e,ValueError) else 'Проверьте обязательные поля'})
    except Exception:respond(h,400,{'error':'Не удалось сохранить/прочитать данные. Проверьте уникальность email/логина и настройки.'})
    return True

def respond(h,status,data,mime='application/json; charset=utf-8',cookie=None):
    body=data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False,default=str).encode()
    h.send_response(status);h.send_header('Content-Type',mime);h.send_header('Content-Length',str(len(body)))
    h.send_header('Cache-Control','no-store');h.send_header('X-Content-Type-Options','nosniff');h.send_header('Referrer-Policy','no-referrer')
    h.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; form-action 'self'; base-uri 'none'")
    if cookie:h.send_header('Set-Cookie',cookie)
    h.end_headers();h.wfile.write(body)