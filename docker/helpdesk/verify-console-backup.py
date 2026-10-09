import pathlib,subprocess,os,hashlib,tarfile,json
os.chdir('/opt/aipbx-helpdesk');p=pathlib.Path('.')
subprocess.run(['python3','backup.py'],check=True)
f=sorted((p/'backups').iterdir())[-1]
for line in (f/'SHA256SUMS').read_text().splitlines():
    expected,name=line.split('  ',1)
    if hashlib.sha256((f/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Backup checksum mismatch')
with tarfile.open(f/'configuration.tar.gz') as archive:
    auth=json.load(archive.extractfile('private/auth.json'))
    if not auth.get('vault_key') or not auth.get('jwt_key'):raise RuntimeError('Backup signing/vault keys missing')
    for member in archive.getmembers():
        if member.name.startswith('private/source-') and member.name.endswith('.json'):
            if json.load(archive.extractfile(member)).get('version')!=1:raise RuntimeError('Plaintext credential in current backup')
database='helpdesk_console_restore_check'
base=['docker','compose','exec','-T','postgres']
exists=subprocess.check_output(base+['psql','-U','helpdesk','-d','postgres','-Atc',"SELECT 1 FROM pg_database WHERE datname='"+database+"'"],text=True).strip()
if exists:raise RuntimeError('Restore-check database already exists; preserve it')
subprocess.run(base+['createdb','-U','helpdesk',database],check=True)
with (f/'helpdesk.dump').open('rb') as stream:subprocess.run(base+['pg_restore','-U','helpdesk','-d',database],stdin=stream,check=True)
q='SELECT count(*) FROM tickets; SELECT count(*) FROM hd_clients; SELECT count(*) FROM hd_sources; SELECT count(*) FROM hd_users;'
counts=subprocess.check_output(base+['psql','-U','helpdesk','-d',database,'-Atc',q],text=True).strip().splitlines()
print(json.dumps({'backup':f.name,'checksums':'pass','encryptedVaultAndKeys':'pass','isolatedDatabaseRestore':'pass','counts':counts}))