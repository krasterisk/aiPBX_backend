import pathlib,urllib.request,urllib.error,json
p=pathlib.Path('/opt/aipbx-helpdesk')
e={k:v.strip().strip('\"').strip("'") for k,v in (l.split('=',1) for l in (p/'integrations.env').read_text(encoding='utf-8-sig').splitlines() if '=' in l and not l.lstrip().startswith('#'))}
for path in ['/', '/helpdesk/', '/rest/settings','/helpdesk/rest/settings']:
    try:
        with urllib.request.urlopen('http://127.0.0.1:5678'+path,timeout=10) as r:
            b=r.read().decode(); print(path,r.status, r.headers.get('Content-Type'))
            if path=='/helpdesk/':
                (p/'editor.html').write_text(b)
                import re;print('Assets:',re.findall(r'(?:src|href)="([^\"]+assets[^\"]+)"',b)[:4])
    except urllib.error.HTTPError as x:print(path,x.code)
for path in ['/helpdesk/tools/identify-client','/helpdesk/tools/get-llm-context','/operator-analytics/projects']:
    req=urllib.request.Request(e['AIPBX_API_URL'].rstrip('/')+path,data=b'{}' if 'helpdesk' in path else None,headers={'Content-Type':'application/json','Authorization':'Bearer '+e['AIPBX_API_KEY']})
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            d=json.load(r);print('aiPBX '+path, r.status, 'shape:', list(d)[:8] if isinstance(d,dict) else type(d).__name__)
    except urllib.error.HTTPError as x:print('aiPBX '+path,x.code)
