import bridge,json
with bridge.db() as c:
    tickets=c.execute('SELECT id,status,client_id,project_id,context,mapping_notified,revision,notified_revision FROM tickets ORDER BY id DESC LIMIT 3').fetchall()
for t in tickets:
    context=t.pop('context') or {}
    t['mapping_reason']=context.get('reason')
    t['candidate_projects']=context.get('projects',[])
    print(json.dumps(t,ensure_ascii=False))
