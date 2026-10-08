import unittest,os,email
from unittest.mock import patch,MagicMock
import bridge

class RoutingTests(unittest.TestCase):
    def test_read_tools_and_mixed_products(self):
        self.assertEqual(bridge.routing.validate_plan({'reads':['cabinet']}),['cabinet'])
        self.assertEqual(bridge.routing.validate_plan({'reads':['cabinet','analytics_project']}),['cabinet','analytics_project'])
        self.assertEqual(bridge.routing.validate_plan({'reads':[]}),[])
    def test_model_cannot_supply_tenant_or_arbitrary_tools(self):
        for value in [{'reads':['send_email']},{'reads':['cabinet'],'clientId':99},{'reads':['cabinet','cabinet']},{'reads':'cabinet'}]:
            with self.assertRaises(ValueError):bridge.routing.validate_plan(value)
    def test_cabinet_context_accepts_missing_project(self):
        with patch.dict(os.environ,{'AIPBX_API_URL':'https://example.test/api','AIPBX_API_KEY':'test'}),patch('bridge.call',return_value={'found':True,'clientId':'1','contextScope':'cabinet','projectId':None}) as request:
            self.assertTrue(bridge.client_context(None,'client@example.test','cabinet')['found'])
            self.assertEqual(request.call_args.args[1],{'email':'client@example.test','scope':'cabinet'})

class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'TELEGRAM_APPROVER_USER_ID':'123','TELEGRAM_APPROVAL_CHAT_ID':'-456','YANDEX_EMAIL':'desk@example.test','PROCESSING_ENABLED':'false'})
        self.env.start()
    def tearDown(self):self.env.stop()
    def test_unauthorized_telegram_never_reaches_decision(self):
        for actor,chat in [(999,-456),(123,-999)]:
            with patch('bridge.decide') as decision,patch('bridge.notify'):
                bridge.handle_update({'callback_query':{'from':{'id':actor},'message':{'chat':{'id':chat}},'data':'approve:1:'+'a'*20}})
                decision.assert_not_called()
    def test_disabled_approval_cannot_send(self):
        with patch('bridge.db') as db,patch('bridge.smtplib.SMTP_SSL') as smtp:
            bridge.decide(1,'a'*20,'approve','123');db.assert_not_called();smtp.assert_not_called()
    def test_only_current_pending_revision_can_be_approved(self):
        t={'status':'pending_approval','draft_hash':bridge.digest('new body')}
        self.assertFalse(bridge.approval_valid(t,bridge.digest('old body')))
        self.assertTrue(bridge.approval_valid(t,bridge.digest('new body')))
        for state in ['sending','sent','send_uncertain','rejected','needs_mapping']:
            self.assertFalse(bridge.approval_valid({**t,'status':state},t['draft_hash']))
    def test_reply_uses_verified_envelope_and_original_thread(self):
        m=bridge.reply_message({'sender':'client@example.test','subject':'Вопрос','message_id':'<original@example.test>','refs':'<earlier@example.test>','draft':'Ответ','outgoing_id':'<new@example.test>'})
        self.assertEqual(m['To'],'client@example.test');self.assertEqual(m['From'],'desk@example.test')
        self.assertEqual(m['In-Reply-To'],'<original@example.test>')
        self.assertEqual(m['References'],'<earlier@example.test> <original@example.test>')
    def test_ambiguous_from_rejected(self):
        with self.assertRaises(ValueError):bridge.normalize_mail(b'From: a@example.test, b@example.test\r\n\r\nHello')
    def test_reply_to_cannot_redirect_recipient(self):
        result=bridge.normalize_mail(b'From: a@example.test\r\nReply-To: attacker@example.test\r\nSubject: test\r\nMessage-ID: <one@example.test>\r\n\r\nHello')
        self.assertEqual(result[0],'a@example.test');self.assertEqual(result[2],'<one@example.test>')
    def test_automated_mail_is_not_drafted(self):
        self.assertTrue(bridge.normalize_mail(b'From: a@example.test\r\nAuto-Submitted: auto-replied\r\n\r\nHello')[-1])
    def test_incomplete_api_context_fails_closed(self):
        with patch.dict(os.environ,{'AIPBX_API_URL':'https://example.test/api','AIPBX_API_KEY':'test'}),patch('bridge.call',return_value={'found':True}):
            with self.assertRaises(RuntimeError):bridge.client_context({'clientId':'1','projectId':'2'},'client@example.test')

@unittest.skipUnless(os.getenv('RUN_DB_TESTS')=='true','requires isolated PostgreSQL test database')
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'PROCESSING_ENABLED':'true','YANDEX_EMAIL':'desk@example.test'})
        self.env.start()
        with bridge.db() as c:
            c.execute(bridge.SCHEMA);c.execute('TRUNCATE agreements,revisions,tickets,audit RESTART IDENTITY CASCADE')
            self.tid=c.execute("INSERT INTO tickets(mail_key,sender,subject,message_id,refs,body,client_id,project_id) VALUES('test','client@example.test','Test','<in@example.test>','','question','client','project') RETURNING id").fetchone()['id']
            bridge.save_revision(c,self.tid,'approved body',1)
    def tearDown(self):self.env.stop()
    def test_exact_approval_sends_once_duplicate_does_not_send(self):
        with patch('bridge.smtplib.SMTP_SSL') as smtp:
            bridge.decide(self.tid,bridge.digest('approved body'),'approve','123')
            bridge.decide(self.tid,bridge.digest('approved body'),'approve','123')
            self.assertEqual(smtp.return_value.__enter__.return_value.send_message.call_count,1)
        with bridge.db() as c:self.assertEqual(c.execute('SELECT status FROM tickets WHERE id=%s',(self.tid,)).fetchone()['status'],'sent')
    def test_edit_invalidates_previous_approval(self):
        with bridge.db() as c:bridge.save_revision(c,self.tid,'edited body',2)
        with patch('bridge.smtplib.SMTP_SSL') as smtp:
            bridge.decide(self.tid,bridge.digest('approved body'),'approve','123');smtp.assert_not_called()
    def test_smtp_uncertainty_is_not_retried(self):
        with patch('bridge.smtplib.SMTP_SSL') as smtp:
            smtp.return_value.__enter__.return_value.send_message.side_effect=TimeoutError()
            bridge.decide(self.tid,bridge.digest('approved body'),'approve','123')
            bridge.decide(self.tid,bridge.digest('approved body'),'approve','123')
            self.assertEqual(smtp.return_value.__enter__.return_value.send_message.call_count,1)
        with bridge.db() as c:self.assertEqual(c.execute('SELECT status FROM tickets WHERE id=%s',(self.tid,)).fetchone()['status'],'send_uncertain')
    def test_pending_preview_retries_after_telegram_transport_failure(self):
        with patch('bridge.notify',side_effect=RuntimeError('transport unavailable')):
            with self.assertRaises(RuntimeError):bridge.notify_pending()
        with bridge.db() as c:
            row=c.execute('SELECT notified_revision FROM tickets WHERE id=%s',(self.tid,)).fetchone()
            self.assertEqual(row['notified_revision'],0)
        with patch('bridge.notify') as notification:
            bridge.notify_pending();self.assertGreater(notification.call_count,0)
        with bridge.db() as c:
            row=c.execute('SELECT notified_revision FROM tickets WHERE id=%s',(self.tid,)).fetchone()
            self.assertEqual(row['notified_revision'],1)
    def test_rejection_and_duplicate_ingestion(self):
        with patch('bridge.smtplib.SMTP_SSL') as smtp:
            bridge.decide(self.tid,bridge.digest('approved body'),'reject','123');smtp.assert_not_called()
        with bridge.db() as c:
            c.execute("INSERT INTO tickets(mail_key,sender,subject,message_id,refs,body) VALUES('test','x@example.test','test','','','test') ON CONFLICT(mail_key) DO NOTHING")
            self.assertEqual(c.execute('SELECT count(*) AS n FROM tickets').fetchone()['n'],1)

class NetworkTests(unittest.TestCase):
    def test_telegram_prefers_ipv6_and_bounds_each_connect(self):
        import network,socket
        ipv4=(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))
        ipv6=(socket.AF_INET6,socket.SOCK_STREAM,6,'',('::1',443,0,0))
        with patch('network.socket.getaddrinfo',return_value=[ipv4,ipv6]),patch('network.socket.socket') as factory:
            connection=network.telegram_connection(('api.telegram.org',443),30)
            factory.assert_called_once_with(socket.AF_INET6,socket.SOCK_STREAM,6)
            self.assertEqual(factory.return_value.settimeout.call_args_list[0].args,(5,))
            self.assertIs(connection,factory.return_value)
    def test_other_hosts_use_original_connection(self):
        import network
        with patch('network._original_connection') as original:
            network.telegram_connection(('smtp.yandex.ru',465),20)
            original.assert_called_once()
    def test_configured_proxy_is_used_only_for_telegram(self):
        import network
        with patch.dict(os.environ,{'TELEGRAM_PROXY':'socks5://proxy.example.test:1080'}),patch('requests.Session') as factory:
            session=factory.return_value.__enter__.return_value
            session.request.return_value.status_code=200
            session.request.return_value.json.return_value={'ok':True}
            self.assertEqual(network.json_request('https://api.telegram.org/botfake/getMe',{}),{'ok':True})
            self.assertFalse(session.trust_env)
            self.assertEqual(session.request.call_args.kwargs['proxies']['https'],'socks5h://proxy.example.test:1080')
    def test_telegram_api_error_does_not_include_token_url(self):
        import network
        with patch.dict(os.environ,{'TELEGRAM_PROXY':'http://proxy.example.test:8080'}),patch('requests.Session') as factory:
            factory.return_value.__enter__.return_value.request.return_value.status_code=400
            with self.assertRaises(network.TelegramAPIError) as failure:
                network.json_request('https://api.telegram.org/botFAKE_SECRET/getChat',{})
            self.assertNotIn('FAKE_SECRET',str(failure.exception))
            self.assertEqual(failure.exception.code,400)
if __name__=='__main__':unittest.main(verbosity=2)
