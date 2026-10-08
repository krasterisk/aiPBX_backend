#!/usr/bin/env python3
import pathlib, json, secrets, urllib.request, urllib.error, http.cookiejar, re, subprocess, datetime
p=pathlib.Path('/opt/aipbx-helpdesk')
def env(path):
    return {k.strip():v.strip().strip('\"').strip("'") for k,v in (l.split('=',1) for l in path.read_text(encoding='utf-8-sig').splitlines() if '=' in l and not l.lstrip().startswith('#'))}
e=env(p/'integrations.env')
a=p/'access.env'
if not a.exists():
    a.write_text('N8N_OWNER_EMAIL='+e['YANDEX_EMAIL']+'\nN8N_OWNER_PASSWORD=Aa1!'+secrets.token_urlsafe(24)+'\n'); a.chmod(0o600)
v=env(a)
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(route,data=None):
    req=urllib.request.Request('http://127.0.0.1:5678'+route, data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':'https://ipbx.krasterisk.ru'})
    with opener.open(req,timeout=15) as r:return json.load(r)
s=call('/rest/settings')
if s.get('data',s).get('userManagement',{}).get('showSetupOnFirstLoad'):
    call('/rest/owner/setup',{'email':v['N8N_OWNER_EMAIL'],'password':v['N8N_OWNER_PASSWORD'],'firstName':'aiPBX','lastName':'Helpdesk'})
call('/rest/login',{'emailOrLdapLoginId':v['N8N_OWNER_EMAIL'],'password':v['N8N_OWNER_PASSWORD']})
print('n8n owner login: PASS')
conf=pathlib.Path('/etc/nginx/sites-enabled/krasterisk').resolve()
old=conf.read_text()
if '# aipbx-helpdesk managed location' not in old:
    backup=p/('nginx-before-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.conf')
    backup.write_text(old); backup.chmod(0o600)
    block='''
    # aipbx-helpdesk managed location
    location = /helpdesk { return 301 /helpdesk/; }
    location ^~ /helpdesk/ {
        proxy_pass http://127.0.0.1:5678/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
        client_max_body_size 16m;
    }
'''
    marker='    location /voice-robots/'
    if marker not in old:raise RuntimeError('Unexpected nginx baseline')
    conf.write_text(old.replace(marker,block+'\n'+marker,1))
    if subprocess.run(['nginx','-t']).returncode:
        conf.write_text(old); raise RuntimeError('nginx test failed, original restored')
    subprocess.run(['systemctl','reload','nginx'],check=True)
print('nginx helpdesk proxy: configured')
