import os,pathlib,imaplib,smtplib,ssl,json
p=pathlib.Path('/opt/aipbx-helpdesk/integrations.env')
e=dict(os.environ)
if p.exists():
    for line in p.read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);e[k.strip()]=v.strip().strip('\"').strip("'")
for name in ['IMAP','SMTP']:
    try:
        if name=='IMAP':
            with imaplib.IMAP4_SSL('imap.yandex.ru',993,timeout=15) as c:
                family=c.sock.family.name;c.login(e['YANDEX_EMAIL'],e['YANDEX_APP_PASSWORD']);c.select('INBOX',readonly=True)
        else:
            with smtplib.SMTP_SSL('smtp.yandex.ru',465,timeout=15,context=ssl.create_default_context()) as c:
                family=c.sock.family.name;c.login(e['YANDEX_EMAIL'],e['YANDEX_APP_PASSWORD'])
        print(json.dumps({'service':name,'authentication':'PASS','network_family':family}),flush=True)
    except Exception as error:print(json.dumps({'service':name,'authentication':'FAIL','error_type':type(error).__name__}),flush=True)
