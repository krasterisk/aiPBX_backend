import os,json,pathlib,subprocess,uuid
os.chdir('/opt/aipbx-helpdesk')
def run(args):subprocess.run(['docker','compose','exec','-T','n8n','n8n']+args,check=True)
run(['export:workflow','--id=helpdeskApproval01','--output=/tmp/approval-before.json'])
subprocess.run(['docker','compose','cp','n8n:/tmp/approval-before.json','approval-before.json'],check=True)
p=pathlib.Path('approval-before.json');p.chmod(0o600)
items=json.loads(p.read_text());w=items[0]
for n in w['nodes']:
    if n['type']=='n8n-nodes-base.scheduleTrigger':n['parameters']['rule']['interval']=[{'field':'seconds','secondsInterval':5}]
w['versionId']=str(uuid.uuid4())
f=pathlib.Path('approval-fast.json');f.write_text(json.dumps(items));f.chmod(0o600)
subprocess.run(['docker','compose','cp',str(f),'n8n:/tmp/approval-fast.json'],check=True)
subprocess.run(['docker','compose','exec','-T','-u','root','n8n','chown','node:node','/tmp/approval-fast.json'],check=True)
run(['import:workflow','--input=/tmp/approval-fast.json'])
run(['publish:workflow','--id=helpdeskApproval01'])
subprocess.run(['docker','compose','restart','n8n'],check=True)
print('Approval workflow: published with 5-second interval')