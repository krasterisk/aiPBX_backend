import bridge,json
with bridge.db() as c:
    q="SELECT id,status,case_status,registry_client_id,revision,last_error FROM tickets ORDER BY id"
    print(json.dumps({'tickets':c.execute(q).fetchall()}))
    print(json.dumps({'sources':c.execute('SELECT id,kind,active,revision FROM hd_sources ORDER BY id').fetchall(),'bindings':c.execute('SELECT client_id,source_id,active FROM hd_bindings ORDER BY client_id,source_id').fetchall()}))
print(json.dumps({'mail':bridge.poll_mail()}))