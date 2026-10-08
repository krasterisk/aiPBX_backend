import pathlib,json,urllib.request,urllib.error,http.cookiejar
p=pathlib.Path('/opt/aipbx-helpdesk')
e=dict(line.split('=',1) for line in (p/'access.env').read_text().splitlines() if '=' in line)
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path,data=None):
    r=urllib.request.Request('https://ipbx.krasterisk.ru/helpdesk'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':'https://ipbx.krasterisk.ru'})
    with opener.open(r,timeout=10) as response:return json.load(response)
request('/rest/login',{'emailOrLdapLoginId':e['N8N_OWNER_EMAIL'],'password':e['N8N_OWNER_PASSWORD']})
for eid in [1,2,15,16]:
    try:
        x=request('/rest/executions/'+str(eid)+'?includeData=true')
        print(json.dumps({'execution':eid,'response_keys':list(x) if isinstance(x,dict) else type(x).__name__}))
        if isinstance(x,dict) and 'execution' in x:x=x['execution']
        data=x.get('data',{})
        result=data.get('resultData',{}) if isinstance(data,dict) else {}
        print(json.dumps({'execution':eid,'status':x.get('status'),'finished':x.get('finished'),'last_node':result.get('lastNodeExecuted'),'nodes':[{ 'node':name,'status':r.get('executionStatus'),'duration_ms':r.get('executionTime'),'error_type':r.get('error',{}).get('name')} for name,runs in result.get('runData',{}).items() for r in runs]}))
    except urllib.error.HTTPError as error:print('Execution lookup HTTP '+str(error.code))
