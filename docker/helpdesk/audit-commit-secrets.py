import pathlib,tarfile,json,re
p=pathlib.Path('/opt/aipbx-helpdesk')
diff=(p/'audit-1af5b95.diff').read_text(encoding='utf-8-sig')
results=[]
def scan(label,body):
    for line in body.splitlines():
        if '=' not in line or line.lstrip().startswith('#'):continue
        key,value=line.split('=',1);value=value.strip().strip('\"').strip("'")
        if re.search('PASSWORD|API_KEY|TOKEN|ENCRYPTION_KEY',key) and len(value)>=8:
            results.append({'source':label,'field':key,'secret_present_in_commit':value in diff})
for name in ['.env','integrations.env','access.env']:
    scan(name,(p/name).read_text(encoding='utf-8-sig'))
for backup in (p/'backups').glob('*/configuration.tar.gz'):
    with tarfile.open(backup) as archive:
        for name in ['.env','integrations.env','access.env']:
            stream=archive.extractfile(name)
            if stream:scan('backup:'+backup.parent.name+':'+name,stream.read().decode('utf-8-sig'))
print(json.dumps({'checked_secret_values':len(results),'matching_values':[r for r in results if r['secret_present_in_commit']],'current_and_historical_secrets_absent':not any(r['secret_present_in_commit'] for r in results)}))
(p/'audit-1af5b95.diff').unlink()
