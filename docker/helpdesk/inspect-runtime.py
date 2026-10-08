import subprocess,os,json,pathlib
os.chdir('/opt/aipbx-helpdesk')
queries={
 'workflow_activation':('n8n',"SELECT id,active FROM workflow_entity WHERE id IN ('helpdeskInbox01','helpdeskApproval01') ORDER BY id"),
 'recent_executions':('n8n',"SELECT \"workflowId\",status,\"startedAt\" FROM execution_entity WHERE \"workflowId\" IN ('helpdeskInbox01','helpdeskApproval01') ORDER BY \"startedAt\" DESC LIMIT 6"),
 'mailbox_state':('helpdesk',"SELECT key FROM state WHERE key IN ('imap_validity','imap_uid','telegram_offset') ORDER BY key"),
 'ticket_statuses':('helpdesk',"SELECT status,count(*) FROM tickets GROUP BY status")}
for label,(database,sql) in queries.items():
    print(label,flush=True)
    subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','helpdesk','-d',database,'-c',sql],check=True)
subprocess.run(['docker','compose','exec','-T','bridge','python','-c',"import urllib.request; print(urllib.request.urlopen('http://localhost:8080/health').read().decode())"],check=True)
