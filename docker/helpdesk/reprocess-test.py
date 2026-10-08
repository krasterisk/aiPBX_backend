import bridge,json
with bridge.db() as c:t=c.execute('SELECT sender FROM tickets WHERE id=2').fetchone()
x=bridge.client_context(None,t['sender'],'cabinet')
print(json.dumps({'found':x.get('found'),'scope':x.get('contextScope'),'assistantCount':len(x.get('assistants',[])),'balanceAvailable':x.get('balance',{}).get('available'),'currency':x.get('balance',{}).get('currency')}))
if x.get('contextScope')!='cabinet' or not x.get('found'):raise RuntimeError('Cabinet endpoint not ready')
with bridge.lease(812341) as locked:
    if not locked:raise RuntimeError('Mail processing busy; retry later')
    with bridge.db() as c:
        c.execute("UPDATE tickets SET status='received',mapping_notified=false,updated_at=now() WHERE id=2 AND status='needs_mapping'")
        bridge.audit(c,2,'retry_with_product_routing','operator')
    bridge.prepare_drafts()
    with bridge.db() as c:
        t=c.execute('SELECT id,status,project_id,revision,notified_revision,context FROM tickets WHERE id=2').fetchone()
        context=t.pop('context') or {};t['readPlan']=context.get('readPlan');print(json.dumps(t))
