import os,subprocess
os.chdir('/opt/aipbx-helpdesk')
q='''SELECT id,active,nodes::jsonb->0->'parameters' AS trigger FROM workflow_entity WHERE id='helpdeskApproval01'; SELECT "workflowId",status,"startedAt","stoppedAt" FROM execution_entity ORDER BY id DESC LIMIT 10;'''
subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','helpdesk','-d','n8n','-c',q],check=True)