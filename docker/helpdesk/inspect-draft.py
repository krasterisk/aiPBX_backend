import bridge,json
with bridge.db() as c:
    t=c.execute('SELECT status,draft,context FROM tickets WHERE id=2').fetchone()
print(json.dumps({'status':t['status'],'draft':t['draft']},ensure_ascii=False))