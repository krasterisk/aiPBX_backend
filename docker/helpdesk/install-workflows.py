import pathlib,json,uuid,subprocess,os,urllib.request,urllib.error
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
def env(name):
    return {k:v.strip().strip('\"').strip("'") for k,v in (l.split('=',1) for l in (p/name).read_text(encoding='utf-8-sig').splitlines() if '=' in l and not l.lstrip().startswith('#'))}
e=env('.env');integrations=env('integrations.env')
for path in ['/helpdesk/tools/get-llm-context','/models/external']:
    req=urllib.request.Request(integrations['AIPBX_API_URL'].rstrip('/')+path,data=b'{}' if 'helpdesk' in path else None,headers={'Content-Type':'application/json','Authorization':'Bearer '+integrations['AIPBX_API_KEY']})
    try:
        with urllib.request.urlopen(req,timeout=15) as r:print('aiPBX '+path+': '+str(r.status))
    except urllib.error.HTTPError as x:
        try:
            message=json.load(x).get('message','')
            if message in ['Invalid or expired API key','API key required','Forbidden resource','Unauthorized']:
                print('aiPBX '+path+': '+str(x.code)+' '+message)
            else:print('aiPBX '+path+': '+str(x.code))
        except Exception:print('aiPBX '+path+': '+str(x.code))
credential=[{'id':'helpdeskBridgeAuth','name':'Helpdesk internal bridge','type':'httpHeaderAuth','data':{'name':'X-Helpdesk-Token','value':e['BRIDGE_TOKEN']}}]
creds=p/'import-credentials.json';creds.write_text(json.dumps(credential));creds.chmod(0o600)
workflows=[]
for suffix,title,endpoint in [('Inbox01','Inbox and draft preparation','tick-mail'),('Approval01','Telegram version approval and reply','tick-telegram')]:
    schedule=str(uuid.uuid4());request=str(uuid.uuid4())
    trigger='Every 5 seconds' if suffix=='Approval01' else 'Every minute'
    interval={'field':'seconds','secondsInterval':5} if suffix=='Approval01' else {'field':'minutes','minutesInterval':1}
    workflows.append({'id':'helpdesk'+suffix,'name':'Helpdesk — '+title,'active':False,'versionId':str(uuid.uuid4()),'settings':{'executionOrder':'v1','timezone':'Asia/Krasnoyarsk','executionTimeout':240},'nodes':[{'id':schedule,'name':trigger,'type':'n8n-nodes-base.scheduleTrigger','typeVersion':1.2,'position':[0,0],'parameters':{'rule':{'interval':[interval]}}},{'id':request,'name':title,'type':'n8n-nodes-base.httpRequest','typeVersion':4.2,'position':[300,0],'parameters':{'method':'POST','url':'http://bridge:8080/'+endpoint,'authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','options':{'timeout':240000}},'credentials':{'httpHeaderAuth':{'id':'helpdeskBridgeAuth','name':'Helpdesk internal bridge'}},'notes':'Durable adapter enforces configured approver/chat, exact body revision, duplicate guards and tenant mapping. Processing remains disabled until aiPBX project gate and live acceptance.'}],'connections':{trigger:{'main':[[{'node':title,'type':'main','index':0}]]}}})
f=p/'workflows.json';f.write_text(json.dumps(workflows,ensure_ascii=False));f.chmod(0o600)
try:
    subprocess.run(['docker','compose','cp',str(creds),'n8n:/tmp/helpdesk-credentials.json'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['docker','compose','cp',str(f),'n8n:/tmp/helpdesk-workflows.json'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['docker','compose','exec','-T','-u','root','n8n','chown','node:node','/tmp/helpdesk-credentials.json','/tmp/helpdesk-workflows.json'],check=True)
    subprocess.run(['docker','compose','exec','-T','n8n','n8n','import:credentials','--input=/tmp/helpdesk-credentials.json'],check=True)
    subprocess.run(['docker','compose','exec','-T','n8n','n8n','import:workflow','--input=/tmp/helpdesk-workflows.json'],check=True)
finally:
    creds.unlink(missing_ok=True)
    subprocess.run(['docker','compose','exec','-T','-u','root','n8n','rm','-f','/tmp/helpdesk-credentials.json','/tmp/helpdesk-workflows.json'],check=False)
