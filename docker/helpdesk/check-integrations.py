import network
#!/usr/bin/env python3
import pathlib, json, urllib.request, urllib.error, imaplib, smtplib, ssl, re, os
p=pathlib.Path('/opt/aipbx-helpdesk/integrations.env')
e=dict(os.environ)
for line in (p.read_text(encoding='utf-8-sig').splitlines() if p.exists() else []):
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1); e[k.strip()]=v.strip().strip('\"').strip("'")
os.environ['TELEGRAM_PROXY']=e.get('TELEGRAM_PROXY','')
def check(name, fn):
    try:
        fn(); print(name+': PASS',flush=True)
    except Exception as x:
        print(name+': FAIL '+type(x).__name__+(' HTTP '+str(x.code) if isinstance(x,urllib.error.HTTPError) else ''),flush=True)
def request(url, data=None, headers=None):
    return network.json_request(url,data,headers)
def imap():
    with imaplib.IMAP4_SSL('imap.yandex.ru',993,timeout=25) as c:
        c.login(e['YANDEX_EMAIL'],e['YANDEX_APP_PASSWORD']); assert c.select('INBOX',readonly=True)[0]=='OK'
def smtp():
    with smtplib.SMTP_SSL('smtp.yandex.ru',465,timeout=25,context=ssl.create_default_context()) as c:
        c.login(e['YANDEX_EMAIL'],e['YANDEX_APP_PASSWORD'])
def deepseek():
    r=request('https://api.deepseek.com/chat/completions',{'model':'deepseek-chat','messages':[{'role':'user','content':'Reply OK'}],'max_tokens':3},{'Authorization':'Bearer '+e['DEEPSEEK_API_KEY'],'Content-Type':'application/json'})
    assert r.get('choices')
def telegram():
    base='https://api.telegram.org/bot'+e['TELEGRAM_BOT_TOKEN']+'/'
    assert request(base+'getMe')['ok']
    assert re.fullmatch(r'[0-9]+',e['TELEGRAM_APPROVER_USER_ID'])
    assert re.fullmatch(r'-?[0-9]+',e['TELEGRAM_APPROVAL_CHAT_ID'])
    assert request(base+'getChat',{'chat_id':e['TELEGRAM_APPROVAL_CHAT_ID']},{'Content-Type':'application/json'})['ok']
check('Yandex IMAP authentication (read-only)',imap)
check('Yandex SMTP authentication (no send)',smtp)
check('DeepSeek minimal completion',deepseek)
check('Telegram bot and approval chat access (no messages)',telegram)
print('aiPBX URL/key configured: '+str(bool(e.get('AIPBX_API_URL') and e.get('AIPBX_API_KEY'))))
