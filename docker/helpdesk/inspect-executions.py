import pathlib,subprocess,os,json,re
os.chdir('/opt/aipbx-helpdesk')
query="SELECT id,status,finished,\"startedAt\",\"stoppedAt\" FROM execution_entity ORDER BY id DESC LIMIT 8"
subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','helpdesk','-d','n8n','-c',query],check=True)
