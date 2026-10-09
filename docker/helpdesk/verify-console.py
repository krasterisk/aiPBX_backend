import pathlib,subprocess,json,urllib.request,urllib.error,http.cookiejar
p=pathlib.Path('/opt/aipbx-helpdesk')
access=dict(l.split('=',1) for l in (p/'access.env').read_text().splitlines() if '=' in l)
base='https://ipbx.krasterisk.ru/helpdesk-clients'
jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def request(path,data=None):
    req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':'https://ipbx.krasterisk.ru'})
    with opener.open(req,timeout=30) as response:return json.load(response)
try:request('/api/state');raise RuntimeError('Unauthenticated state permitted')
except urllib.error.HTTPError as e:
    if e.code!=401:raise
request('/api/login',{'login':access['N8N_OWNER_EMAIL'],'password':access['N8N_OWNER_PASSWORD']})
state=request('/api/state');listing=request('/api/tickets')
if 'password_hash' in json.dumps(state) or 'jwt_key' in json.dumps(state) or 'vault_key' in json.dumps(state):raise RuntimeError('Private auth fields returned')
for source in state['sources']:
    if 'credentials' in source:raise RuntimeError('Credentials returned')
for ticket in listing['tickets']:
    detail=request('/api/ticket?id='+str(ticket['id']))
    if not detail['messages']:raise RuntimeError('Ticket message history missing')
print(json.dumps({'login':'pass','unauthenticatedState':401,'role':state['me']['role'],'clients':len(state['clients']),'sources':len(state['sources']),'tickets':listing['total'],'history':'pass','credentialValues':'not returned'}))