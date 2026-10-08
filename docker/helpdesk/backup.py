#!/usr/bin/env python3
import subprocess,pathlib,datetime,tarfile,os,hashlib
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
b=p/'backups';b.mkdir(mode=0o700,exist_ok=True)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
f=b/stamp;f.mkdir(mode=0o700)
for db in ['n8n','helpdesk']:
    with (f/(db+'.dump')).open('wb') as out:
        subprocess.run(['docker','compose','exec','-T','postgres','pg_dump','-U','helpdesk','-Fc',db],stdout=out,check=True)
with (f/'n8n-files.tar.gz').open('wb') as out:
    subprocess.run(['docker','compose','exec','-T','n8n','tar','-czf','-','-C','/home/node','.n8n'],stdout=out,check=True)
with tarfile.open(f/'configuration.tar.gz','w:gz') as archive:
    for name in ['.env','integrations.env','access.env','compose.yaml','client-projects.json','bridge.py','Dockerfile','init.sql','backup.py']:
        archive.add(p/name,arcname=name)
    for nginx in p.glob('nginx-before-*.conf'):archive.add(nginx,arcname=nginx.name)
(f/'SHA256SUMS').write_text(''.join(hashlib.sha256(x.read_bytes()).hexdigest()+'  '+x.name+'\n' for x in sorted(f.iterdir()) if x.is_file()))
for item in f.iterdir():item.chmod(0o600)
# Retention only for this tool's timestamped backup directories, never other files.
cutoff=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=14)
import re,shutil
for older in b.iterdir():
    if older.is_dir() and re.fullmatch(r'\d{8}T\d{6}Z',older.name):
        when=datetime.datetime.strptime(older.name,'%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
        if when<cutoff:shutil.rmtree(older)
print('Backup complete:',f.name)
