import pathlib,subprocess,os,urllib.request,urllib.error,json
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
e=dict(l.split('=',1) for l in (p/'integrations.env').read_text(encoding='utf-8-sig').splitlines() if '=' in l)
e={k:v.strip().strip('\"').strip("'") for k,v in e.items()}
for path,body in [('/helpdesk/tools/get-llm-context',{}),('/helpdesk/tools/email-project-context',{'email':'n8n-connectivity-check@invalid.example'})]:
    req=urllib.request.Request(e['AIPBX_API_URL'].rstrip('/')+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+e['AIPBX_API_KEY']})
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            result=json.load(r);print(path,r.status,'found:',result.get('found'),'reason:',result.get('reason'))
    except urllib.error.HTTPError as x:print(path,x.code)
for method in ['getMe','getWebhookInfo']:
    with urllib.request.urlopen('https://api.telegram.org/bot'+e['TELEGRAM_BOT_TOKEN']+'/'+method,timeout=15) as r:
        result=json.load(r)['result'];print('Telegram '+method+': PASS',('webhook_configured='+str(bool(result.get('url')))) if method=='getWebhookInfo' else '')
subprocess.run(['docker','compose','exec','-T','bridge','python','-c',"import urllib.request; print(urllib.request.urlopen('http://localhost:8080/health').read().decode())"],check=True)
