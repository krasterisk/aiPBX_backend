import bridge,web,json,pathlib,os,connectors
with bridge.db() as c:
    c.execute(bridge.SCHEMA);web.bootstrap(c)
    if not bridge.read_state(c,'client_console_initialized'):
        c.execute("UPDATE tickets SET case_status='waiting_client' WHERE status='sent' AND case_status='open'")
        bridge.set_state(c,'client_console_initialized','true')
    if not c.execute('SELECT id FROM hd_sources').fetchone():
        p=pathlib.Path('/opt/aipbx-helpdesk/integrations.env')
        # Environment already supplied by Compose; credentials stay in private files.
        config={'url':os.environ['AIPBX_API_URL'].rstrip('/'),'operations':[{'id':'cabinet','description':'Ассистенты и баланс кабинета aiPBX','scope':'cabinet'},{'id':'analytics','description':'Настройки и результаты проекта речевой аналитики','scope':'analytics'}]}
        connectors.validate_config('aipbx',config)
        sid=c.execute("INSERT INTO hd_sources(name,kind,config,active) VALUES('aiPBX API','aipbx',%s::jsonb,true) RETURNING id",(json.dumps(config),)).fetchone()['id']
        connectors.save_secrets(sid,{'bearer':os.environ['AIPBX_API_KEY']})
print('Registry schema and owner initialized; no clients imported')