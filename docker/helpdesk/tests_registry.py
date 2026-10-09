import unittest,os,json,tempfile,threading,time,hmac,hashlib
from pathlib import Path
from unittest.mock import patch,MagicMock
from urllib.parse import urlencode
import jwt,requests
import bridge,registry,connectors,web,ticketing,routing

class AuthTests(unittest.TestCase):
    def test_jwt_signature_expiry_audience_and_algorithm(self):
        key='a'*64;token=web.issue({'id':7,'version':3},key)
        self.assertEqual(web.decode(token,key)['sub'],'7')
        with self.assertRaises(jwt.PyJWTError):web.decode(token,'wrong-key'*8)
        claims=jwt.decode(token,key,algorithms=['HS256'],options={'verify_aud':False})
        for modification in [{'exp':1},{'aud':'another-app'}]:
            with self.assertRaises(jwt.PyJWTError):web.decode(jwt.encode({**claims,**modification},key,algorithm='HS256'),key)
        with self.assertRaises(jwt.PyJWTError):web.decode(jwt.encode(claims,'',algorithm='none'),key)
    def test_telegram_identity_signature_and_expiry(self):
        fields={'auth_date':str(int(time.time())),'user':json.dumps({'id':123})}
        with patch.dict(os.environ,{'TELEGRAM_BOT_TOKEN':'fake-token'}):
            key=hmac.new(b'WebAppData',b'fake-token',hashlib.sha256).digest()
            fields['hash']=hmac.new(key,'\n'.join(k+'='+v for k,v in sorted(fields.items())).encode(),hashlib.sha256).hexdigest()
            self.assertEqual(web.telegram_identity(urlencode(fields)),'123')
            fields['user']=json.dumps({'id':999})
            with self.assertRaises(ValueError):web.telegram_identity(urlencode(fields))

class ConnectorTests(unittest.TestCase):
    def test_no_arbitrary_source_or_command_or_identity_in_plan(self):
        catalog={'1:read':None}
        for v in [{'reads':[{'operation':'2:read'}]},{'reads':[{'operation':'1:read','clientId':9}]},{'reads':[{'operation':'1:read','query':'x'*501}]}]:
            with self.assertRaises(ValueError):routing.validate_source_plan(v,catalog)
    def test_search_text_cannot_replace_fixed_tenant_arguments(self):
        cfg={'url':'https://mcp.test/mcp','operations':[{'id':'read','description':'read','tool':'read','arguments':{'tenant_id':'{account_id}'},'query_argument':'tenant_id'}]}
        with self.assertRaises(ValueError):connectors.validate_config('mcp',cfg)
        source={'id':1,'kind':'http','config':{'url':'https://api.test'},'params':{'tenant_id':'a'}}
        with patch('connectors.secrets',return_value={}):
            with self.assertRaises(ValueError):connectors.fetch(source,{'query_param':'tenant_id'},'b')
    def test_mcp_templates_preserve_tenant_argument_types(self):
        self.assertEqual(connectors.template({'tenant_id':'{account_id}'},{'account_id':20}),{'tenant_id':20})
        self.assertEqual(connectors.template('/clients/{account_id}',{'account_id':'a/b'},path=True),'/clients/a%2Fb')
    def test_reject_embedded_secrets_unsafe_sql_and_shell(self):
        samples=[('http',{'url':'https://example.test','bearer':'secret','operations':[{'id':'read','description':'read','path':'/'}]}),('postgres',{'host':'db','database':'test','operations':[{'id':'read','description':'read','query':'SELECT 1; DELETE FROM clients'}]}),('ssh',{'host':'server','host_fingerprint':'SHA256:FAKE','operations':[{'id':'read','description':'read','argv':['sh','-c','rm -rf /']}]}),('http',{'url':'https://user:pass@example.test','operations':[{'id':'read','description':'read','path':'/'}]})]
        for kind,cfg in samples:
            with self.assertRaises(ValueError):connectors.validate_config(kind,cfg)
    def test_model_metadata_and_letters_exclude_known_credentials(self):
        with patch('connectors.secrets',return_value={'bearer':'FAKE-LIVE-TOKEN'}):
            result=connectors.model_data({'email':'FAKE-LIVE-TOKEN','description':'token=other-value','key':'-----BEGIN OPENSSH PRIVATE KEY-----\nDATA\n-----END OPENSSH PRIVATE KEY-----'},[{'id':1}])
        encoded=json.dumps(result);self.assertNotIn('FAKE-LIVE-TOKEN',encoded);self.assertNotIn('other-value',encoded);self.assertNotIn('PRIVATE KEY',encoded)
    def test_knowledge_groups_cannot_cross_clients(self):
        source={'id':1,'kind':'knowledge','config':{'documents':[{'title':'A','text':'A data','group':'a'},{'title':'B','text':'B data','group':'b'}]},'params':{'knowledge_group':'a'}}
        with patch('connectors.secrets',return_value={}):
            result=connectors.fetch(source,{},'data')
            self.assertEqual([d['title'] for d in result['documents']],['A'])
            source['params']={}
            with self.assertRaises(ValueError):connectors.fetch(source,{},'data')
    def test_secrets_are_write_only_and_redacted(self):
        with tempfile.TemporaryDirectory() as d,patch('connectors.PRIVATE',Path(d)):
            (Path(d)/'auth.json').write_text(json.dumps({'vault_key':'a'*64}))
            connectors.save_secrets(1,{'bearer':'SENSITIVE-value'})
            self.assertNotIn('SENSITIVE-value',connectors.secret_path(1).read_text())
            connectors.save_secrets(1,{'password':''})
            self.assertEqual(connectors.secrets(1),{'bearer':'SENSITIVE-value'})
            self.assertEqual(connectors.scrub({'apiKey':'unknown','message':'SENSITIVE-value'},connectors.secrets(1)),{'apiKey':'[скрыто]','message':'[скрыто]'})
    def test_vault_ciphertext_is_bound_to_source_identity(self):
        from cryptography.exceptions import InvalidTag
        with tempfile.TemporaryDirectory() as d,patch('connectors.PRIVATE',Path(d)):
            (Path(d)/'auth.json').write_text(json.dumps({'vault_key':'a'*64}))
            connectors.save_secrets(1,{'bearer':'FAKE-sensitive-value'})
            connectors.secret_path(2).write_bytes(connectors.secret_path(1).read_bytes())
            with self.assertRaises(InvalidTag):connectors.secrets(2)
    def test_postgres_read_only_params_and_limits(self):
        source={'id':1,'kind':'postgres','config':{'host':'db','database':'test','sslmode':'require'},'params':{'account_id':'a'}}
        op={'query':'SELECT id FROM clients WHERE id=%(account_id)s'}
        with patch('connectors.secrets',return_value={'username':'read','password':'test-password'}),patch('connectors.psycopg.connect') as connect:
            conn=connect.return_value.__enter__.return_value;cur=conn.cursor.return_value.__enter__.return_value;cur.fetchmany.return_value=[{'id':'a'}]
            self.assertEqual(connectors.fetch(source,op)['rows'],[{'id':'a'}]);self.assertTrue(conn.read_only)
            self.assertEqual(cur.execute.call_args.args,(op['query'],{'account_id':'a'}));cur.fetchmany.assert_called_once_with(51)
    def test_mcp_uses_handshake_pinned_tool_and_binding_params(self):
        source={'id':1,'kind':'mcp','config':{'url':'https://mcp.test/mcp'},'params':{'tenant':'a'}}
        op={'tool':'read_account','arguments':{'tenant':'{tenant}'},'query_argument':'query'}
        with patch('connectors.secrets',return_value={}),patch('connectors.requests.Session'),patch('connectors.http',side_effect=[({'result':{'protocolVersion':'2025-11-25'}},{'Mcp-Session-Id':'session'}),({},{}),({'result':{'content':[{'type':'text','text':'result'}]}},{})]) as request:
            self.assertEqual(connectors.fetch(source,op,'search')['content'][0]['text'],'result')
            call=request.call_args_list[2].args
            self.assertEqual(call[3]['params'],{'name':'read_account','arguments':{'tenant':'a','query':'search'}})
            self.assertEqual(call[4]['MCP-Session-Id'],'session')
    def test_real_ssh_fixture_verifies_host_key_and_quotes_arguments(self):
        import socket,paramiko,io,base64
        server_key=paramiko.RSAKey.generate(2048);client_key=paramiko.RSAKey.generate(2048)
        buffer=io.StringIO();client_key.write_private_key(buffer)
        fingerprint='SHA256:'+base64.b64encode(hashlib.sha256(server_key.asbytes()).digest()).decode().rstrip('=')
        listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(1);listener.settimeout(10);commands=[];done=threading.Event()
        class Fixture(paramiko.ServerInterface):
            def check_auth_publickey(self,user,key):return paramiko.AUTH_SUCCESSFUL if key==client_key else paramiko.AUTH_FAILED
            def get_allowed_auths(self,user):return 'publickey'
            def check_channel_request(self,kind,cid):return paramiko.OPEN_SUCCEEDED if kind=='session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
            def check_channel_exec_request(self,channel,command):
                commands.append(command.decode())
                def reply():
                    time.sleep(.1);channel.send(b'example log output');channel.send_exit_status(0);channel.close();done.set()
                threading.Thread(target=reply,daemon=True).start();return True
        def serve():
            conn,_=listener.accept()
            with paramiko.Transport(conn) as transport:
                transport.add_server_key(server_key);transport.start_server(server=Fixture());channel=transport.accept(10);done.wait(10)
        thread=threading.Thread(target=serve,daemon=True);thread.start()
        source={'id':99,'kind':'ssh','config':{'host':'127.0.0.1','port':listener.getsockname()[1],'host_fingerprint':fingerprint},'params':{'log_path':'/log/customer; touch /tmp/UNSAFE'}}
        try:
            with patch('connectors.secrets',return_value={'username':'fixture','private_key':buffer.getvalue()}):
                result=connectors.fetch(source,{'argv':['tail','-n','10','--','{log_path}']})
            self.assertEqual(result['stdout'],'example log output')
            self.assertEqual(commands,["tail -n 10 -- '/log/customer; touch /tmp/UNSAFE'"])
        finally:done.set();listener.close();thread.join(2)
    def test_unavailable_source_never_exposes_exception_secrets(self):
        item=({'id':1,'name':'api','revision':1,'binding_revision':1},{'id':'read'})
        with patch('connectors.fetch',side_effect=RuntimeError('password=LEAK')):
            self.assertNotIn('LEAK',json.dumps(connectors.read(item)))

@unittest.skipUnless(os.getenv('RUN_DB_TESTS')=='true','isolated PostgreSQL required')
class RegistryTests(unittest.TestCase):
    def setUp(self):
        with bridge.db() as c:
            c.execute(bridge.SCHEMA)
            c.execute('TRUNCATE hd_users,hd_clients,hd_sources,tickets,agreements,revisions,audit RESTART IDENTITY CASCADE')
            self.a=registry.save_client(c,{'name':'A','emails':['a@example.test']})
            self.b=registry.save_client(c,{'name':'B','emails':['b@example.test']})
            self.tid=ticketing.ingest(c,'first','a@example.test','question','<first@example.test>','','question','received')
    def test_telegram_reply_id_links_only_authorized_owner_context(self):
        update={'message':{'from':{'id':123},'chat':{'id':456},'text':str(self.a),'reply_to_message':{'from':{'is_bot':True},'text':'Тикет #'+str(self.tid)+': question'}}}
        with patch.dict(os.environ,{'TELEGRAM_APPROVER_USER_ID':'123','TELEGRAM_APPROVAL_CHAT_ID':'456'}),patch('bridge.notify'):
            bridge.handle_update(update)
        with bridge.db() as c:self.assertEqual(c.execute('SELECT registry_client_id FROM tickets WHERE id=%s',(self.tid,)).fetchone()['registry_client_id'],self.a)
    def test_unknown_sender_makes_no_external_request(self):
        with bridge.db() as c:
            tid=ticketing.ingest(c,'unknown','unknown@example.test','question','<unknown@example.test>','','question','received');t=c.execute('SELECT * FROM tickets WHERE id=%s',(tid,)).fetchone()
        with patch('bridge.call') as external:bridge.prepare_ticket(t);external.assert_not_called()
        with bridge.db() as c:self.assertEqual(c.execute('SELECT status FROM tickets WHERE id=%s',(tid,)).fetchone()['status'],'needs_mapping')
    def test_contact_conflict_is_not_silently_reassigned(self):
        with bridge.db() as c:
            with self.assertRaises(ValueError):registry.bind_ticket(c,self.tid,self.b,'owner')
            self.assertEqual(registry.resolve(c,'a@example.test')['id'],self.a)
    def test_clients_only_receive_bound_operations(self):
        with bridge.db() as c:
            cfg={'operations':[{'id':'search','description':'search'}],'documents':[]}
            sid=c.execute("INSERT INTO hd_sources(name,kind,config,active) VALUES('KB','knowledge',%s::jsonb,true) RETURNING id",(json.dumps(cfg),)).fetchone()['id']
            registry.save_binding(c,{'client_id':self.a,'source_id':sid,'params':{},'operations':['search']})
            self.assertEqual(set(connectors.catalog(registry.bindings(c,self.a))),{str(sid)+':search'})
            self.assertEqual(connectors.catalog(registry.bindings(c,self.b)),{})
    def test_held_tickets_resume_only_after_registry_and_sources_are_configured(self):
        with bridge.db() as c:
            c.execute("UPDATE tickets SET status='needs_mapping' WHERE id=%s",(self.tid,));ticketing.resume_configured(c)
            self.assertEqual(c.execute('SELECT status FROM tickets WHERE id=%s',(self.tid,)).fetchone()['status'],'needs_mapping')
            cfg={'operations':[{'id':'search','description':'search'}],'documents':[]}
            sid=c.execute("INSERT INTO hd_sources(name,kind,config,active) VALUES('KB','knowledge',%s::jsonb,true) RETURNING id",(json.dumps(cfg),)).fetchone()['id']
            registry.save_binding(c,{'client_id':self.a,'source_id':sid,'params':{},'operations':['search']});ticketing.resume_configured(c)
            self.assertEqual(c.execute('SELECT status FROM tickets WHERE id=%s',(self.tid,)).fetchone()['status'],'received')
    def test_thread_dedup_reopens_and_invalidates_old_draft(self):
        with bridge.db() as c:
            bridge.save_revision(c,self.tid,'draft',1)
            reply=ticketing.ingest(c,'reply','a@example.test','Re: question','<reply@example.test>','<first@example.test>','new question','received')
            self.assertEqual(reply,self.tid);self.assertIsNone(ticketing.ingest(c,'reply','a@example.test','same','<reply@example.test>','','same','received'))
            ticketing.promote(c);t=c.execute('SELECT * FROM tickets WHERE id=%s',(self.tid,)).fetchone()
            self.assertEqual(t['body'],'new question');self.assertEqual(t['revision'],1);self.assertFalse(bridge.approval_valid(t,bridge.digest('draft')))
            bridge.save_revision(c,self.tid,'new draft',2)
            self.assertEqual(c.execute('SELECT count(*) AS n FROM revisions WHERE ticket_id=%s',(self.tid,)).fetchone()['n'],2)
    def test_registry_draft_records_reads_and_excludes_other_client_history(self):
        with bridge.db() as c:
            cfg={'operations':[{'id':'search','description':'client documentation'}],'documents':[{'title':'A manual','text':'Approved A instructions'}]}
            sid=c.execute("INSERT INTO hd_sources(name,kind,config,active) VALUES('A knowledge','knowledge',%s::jsonb,true) RETURNING id",(json.dumps(cfg),)).fetchone()['id']
            registry.save_binding(c,{'client_id':self.a,'source_id':sid,'params':{},'operations':['search']})
            other=ticketing.ingest(c,'b-mail','b@example.test','private','<b@example.test>','','OTHER_CLIENT_PRIVATE','received')
            c.execute('UPDATE tickets SET registry_client_id=%s WHERE id=%s',(self.b,other))
            t=c.execute('SELECT * FROM tickets WHERE id=%s',(self.tid,)).fetchone()
        responses=[{'reads':[{'operation':str(sid)+':search','query':'instructions'}]},{'reads':[]}]
        payloads=[]
        def model(url,payload,headers):
            payloads.append(payload)
            content=json.dumps(responses.pop(0)) if 'response_format' in payload else 'Approved support reply'
            return {'choices':[{'message':{'content':content}}]}
        with patch('bridge.call',side_effect=model),patch('bridge.preview'):
            bridge.prepare_ticket(t)
        self.assertNotIn('OTHER_CLIENT_PRIVATE',json.dumps(payloads))
        with bridge.db() as c:
            row=c.execute('SELECT status,revision,registry_client_id,context FROM tickets WHERE id=%s',(self.tid,)).fetchone()
            self.assertEqual(row['status'],'pending_approval');self.assertEqual(row['registry_client_id'],self.a)
            self.assertEqual(row['context']['results'][0]['data']['documents'][0]['title'],'A manual')
            events=c.execute('SELECT event FROM hd_ticket_events WHERE ticket_id=%s',(self.tid,)).fetchall()
            self.assertIn('source_read_finished',[e['event'] for e in events]);self.assertIn('model_draft_proposed',[e['event'] for e in events])
    def test_real_postgres_connector_obeys_client_selector(self):
        from urllib.parse import urlsplit,unquote
        info=urlsplit(os.environ['DATABASE_URL'])
        source={'id':99,'kind':'postgres','config':{'host':info.hostname,'port':info.port or 5432,'database':info.path.lstrip('/'),'sslmode':'disable'},'params':{'account_id':self.a}}
        with patch('connectors.secrets',return_value={'username':unquote(info.username),'password':unquote(info.password)}):
            result=connectors.fetch(source,{'query':'SELECT id,name FROM hd_clients WHERE id=%(account_id)s'})
        self.assertEqual(result['rows'],[{'id':self.a,'name':'A'}])
    def test_operator_cannot_view_unassigned_ticket(self):
        with bridge.db() as c:
            user={'id':999,'role':'operator'}
            self.assertFalse(ticketing.can_view(c,user,self.tid));self.assertEqual(ticketing.listing(c,user,{})['total'],0)
            with self.assertRaises(PermissionError):ticketing.detail(c,user,self.tid)
    def test_disabled_source_can_be_previewed_but_not_used_by_model(self):
        with bridge.db() as c:
            cfg={'operations':[{'id':'search','description':'search'}],'documents':[]}
            sid=c.execute("INSERT INTO hd_sources(name,kind,config,active) VALUES('Draft KB','knowledge',%s::jsonb,false) RETURNING id",(json.dumps(cfg),)).fetchone()['id']
            registry.save_binding(c,{'client_id':self.a,'source_id':sid,'params':{},'operations':['search'],'active':False})
            self.assertEqual(registry.bindings(c,self.a),[])
            self.assertEqual(len(registry.bindings(c,self.a,include_inactive=True)),1)
    def test_closed_case_cannot_be_approved(self):
        self.assertFalse(bridge.approval_valid({'status':'pending_approval','case_status':'closed','draft_hash':'a'*20},'a'*20))

@unittest.skipUnless(os.getenv('RUN_DB_TESTS')=='true','isolated PostgreSQL required')
class ConsoleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.private=patch('connectors.PRIVATE',Path(self.tmp.name));self.private.start()
        salt='a'*32
        (Path(self.tmp.name)/'auth.json').write_text(json.dumps({'login':'owner','salt':salt,'password_hash':web.password_hash('test-password-123',salt),'jwt_key':'b'*64,'vault_key':'c'*64}))
        with bridge.db() as c:
            c.execute(bridge.SCHEMA);c.execute('TRUNCATE hd_users,hd_clients,hd_sources,tickets,agreements,revisions,audit RESTART IDENTITY CASCADE');web.bootstrap(c)
        self.server=bridge.ThreadingHTTPServer(('127.0.0.1',0),bridge.Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.url='http://127.0.0.1:'+str(self.server.server_port);self.cookie='';web.ATTEMPTS.clear()
    def tearDown(self):self.server.shutdown();self.server.server_close();self.private.stop();self.tmp.cleanup()
    def request(self,path,data=None,origin=web.ORIGIN):
        return requests.request('GET' if data is None else 'POST',self.url+path,json=data,headers={'Origin':origin,'Cookie':self.cookie},timeout=10)
    def login(self):
        r=self.request('/api/login',{'login':'owner','password':'test-password-123'});self.assertEqual(r.status_code,200);self.cookie=r.headers['Set-Cookie'].split(';',1)[0];return r
    def test_no_registration_authentication_csrf_and_secret_non_disclosure(self):
        self.assertEqual(self.request('/api/state').status_code,401)
        self.assertEqual(self.request('/api/login',{'login':'owner','password':'wrong'}).status_code,401)
        self.assertEqual(self.request('/api/login',{'login':'owner','password':'test-password-123'},origin='https://attacker.test').status_code,403)
        r=self.login();self.assertIn('HttpOnly',r.headers['Set-Cookie']);self.assertIn('Secure',r.headers['Set-Cookie']);self.assertNotIn('token',r.json())
        self.assertEqual(self.request('/api/register',{}).status_code,404)
        cfg={'url':'https://api.example.test','operations':[{'id':'read','description':'read','path':'/account'}]}
        result=self.request('/api/source',{'name':'API','kind':'http','config':cfg,'credentials':{'bearer':'test-SENSITIVE-value'},'active':True});self.assertEqual(result.status_code,200)
        state=self.request('/api/state');self.assertEqual(state.status_code,200);self.assertNotIn('test-SENSITIVE-value',state.text);self.assertTrue(state.json()['sources'][0]['hasSecret'])
        self.assertEqual(self.request('/api/logout',{}).status_code,200);self.assertEqual(self.request('/api/state').status_code,401)
    def test_miniapp_bearer_login_works_without_third_party_cookies(self):
        fields={'auth_date':str(int(time.time())),'user':json.dumps({'id':123})}
        key=hmac.new(b'WebAppData',b'fake-bot-token',hashlib.sha256).digest()
        fields['hash']=hmac.new(key,'\n'.join(k+'='+v for k,v in sorted(fields.items())).encode(),hashlib.sha256).hexdigest()
        with bridge.db() as c:c.execute("UPDATE hd_users SET telegram_id='123' WHERE login='owner'")
        with patch.dict(os.environ,{'TELEGRAM_BOT_TOKEN':'fake-bot-token'}):
            response=self.request('/api/login',{'login':'owner','password':'test-password-123','initData':urlencode(fields)})
        self.assertEqual(response.status_code,200);self.assertIn('SameSite=None',response.headers['Set-Cookie']);self.assertIn('Partitioned',response.headers['Set-Cookie'])
        headers={'Authorization':'Bearer '+response.json()['token'],'Origin':web.ORIGIN}
        result=requests.get(self.url+'/api/state',headers=headers,timeout=10)
        self.assertEqual(result.status_code,200);self.assertEqual(result.json()['me']['role'],'admin')
        self.assertEqual(requests.post(self.url+'/api/logout',json={},headers=headers,timeout=10).status_code,200)
        self.assertEqual(requests.get(self.url+'/api/state',headers=headers,timeout=10).status_code,401)
    def test_employee_has_no_client_or_source_admin_permissions(self):
        self.login();r=self.request('/api/user',{'login':'worker','name':'Worker','password':'worker-password-123','active':True});self.assertEqual(r.status_code,200)
        r=self.request('/api/login',{'login':'worker','password':'worker-password-123'});self.assertEqual(r.status_code,200);self.cookie=r.headers['Set-Cookie'].split(';',1)[0]
        self.assertEqual(self.request('/api/client',{'name':'steal','emails':[]}).status_code,403)
        self.assertEqual(self.request('/api/source',{}).status_code,403)
        self.assertEqual(self.request('/api/check',{'client_id':999,'source_id':1,'operation':'read'}).status_code,403)
        state=self.request('/api/state').json();self.assertEqual(state['clients'],[]);self.assertEqual(state['sources'],[])