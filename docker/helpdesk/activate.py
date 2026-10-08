import pathlib,subprocess,os,time,json,urllib.request
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
compose=p/'compose.yaml';old=compose.read_text();new=old.replace("PROCESSING_ENABLED: 'false'","PROCESSING_ENABLED: 'true'")
assert new!=old or "PROCESSING_ENABLED: 'true'" in old
compose.write_text(new)
subprocess.run(['docker','compose','up','-d','bridge'],check=True)
# First activation initializes the mailbox watermark without processing historical mail.
subprocess.run(['docker','compose','exec','-T','bridge','python','-c',"import bridge,json;print(json.dumps(bridge.poll_mail()));print(json.dumps(bridge.poll_telegram()))"],check=True)
for workflow in ['helpdeskInbox01','helpdeskApproval01']:
    subprocess.run(['docker','compose','exec','-T','n8n','n8n','publish:workflow','--id='+workflow],check=True)
subprocess.run(['docker','compose','restart','n8n'],check=True)
query="SELECT id,active FROM workflow_entity WHERE id IN ('helpdeskInbox01','helpdeskApproval01') ORDER BY id"
subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','helpdesk','-d','n8n','-c',query],check=True)
for i in range(15):
    try:
        with urllib.request.urlopen('https://ipbx.krasterisk.ru/helpdesk/rest/settings',timeout=3) as response:
            if response.status==200:print('n8n HTTPS API after restart: PASS');break
    except Exception:time.sleep(2)
else:raise RuntimeError('n8n startup health pending')
subprocess.run(['python3','backup.py'],check=True)
