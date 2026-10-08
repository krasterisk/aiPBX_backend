import subprocess,json
info=json.loads(subprocess.check_output(['docker','inspect','xray-ui']))[0]
print('Xray mounts:',[{k:m[k] for k in ['Source','Destination']} for m in info.get('Mounts',[])])
for file in ['/app/bin/config.json','/etc/xray/config.json']:
    p=subprocess.run(['docker','exec','xray-ui','cat',file],capture_output=True)
    if p.returncode:continue
    try:config=json.loads(p.stdout)
    except Exception:continue
    print('Inbounds:',[{k:v.get(k) for k in ['tag','listen','port','protocol']} for v in config.get('inbounds',[])])
    print('Outbound protocols:',[{k:v.get(k) for k in ['tag','protocol']} for v in config.get('outbounds',[])])
    print('Telegram routing configured:',any('telegram' in str(v.get('domain','')) for v in config.get('routing',{}).get('rules',[])))
