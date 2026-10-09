import bridge,connectors,json
with bridge.db() as c:
    source=c.execute("SELECT * FROM hd_sources WHERE kind='aipbx' ORDER BY id LIMIT 1").fetchone()
source['params']={'account_email':'admin@krasterisk.ru','cabinet_id':1}
x=connectors.fetch(source,{'id':'cabinet','scope':'cabinet','description':'cabinet'})
if not x.get('found') or x.get('contextScope')!='cabinet':raise RuntimeError('Live aiPBX configured read failed')
print(json.dumps({'connector':'aipbx','found':True,'assistants':len(x.get('assistants',[])),'balanceAvailable':x.get('balance',{}).get('available'),'currency':x.get('balance',{}).get('currency')}))