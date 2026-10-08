import bridge,json
with bridge.db() as c:
    print(json.dumps(c.execute('SELECT id,status,revision,outgoing_id FROM tickets WHERE id=2').fetchone()))
    print(json.dumps(c.execute('SELECT event,count(*) AS count FROM audit WHERE ticket_id=2 GROUP BY event ORDER BY event').fetchall()))
print(json.dumps(bridge.poll_telegram()))