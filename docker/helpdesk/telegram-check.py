import network
import pathlib,urllib.request,urllib.error,json,os
v={}
for l in pathlib.Path('/opt/aipbx-helpdesk/integrations.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in l:
        k,x=l.split('=',1);v[k]=x.strip().strip('\"').strip("'")
print('Telegram token syntax: '+str(bool(__import__('re').fullmatch(r'\d+:[\w-]+',v.get('TELEGRAM_BOT_TOKEN','')))),flush=True)
print('Proxy variables configured: '+str([k for k in os.environ if 'proxy' in k.lower()]),flush=True)
for method,data in [('getMe',None),('getChat',{'chat_id':v['TELEGRAM_APPROVAL_CHAT_ID']})]:
    print('Checking '+method,flush=True)
    try:
        req=urllib.request.Request('https://api.telegram.org/bot'+v['TELEGRAM_BOT_TOKEN']+'/'+method,data=json.dumps(data).encode() if data else None,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=10) as r: print(method+': '+str(json.load(r)['ok']),flush=True)
    except urllib.error.HTTPError as x:print('HTTP '+str(x.code),flush=True)
    except urllib.error.URLError as x:print(type(x.reason).__name__+': '+str(x.reason)[:100],flush=True)
