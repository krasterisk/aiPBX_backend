#!/usr/bin/env python3
"""Server-only console installation. Never prints credentials."""
import os,json,pathlib,hashlib,secrets,subprocess,datetime
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
def env(name):return dict(line.split('=',1) for line in (p/name).read_text(encoding='utf-8-sig').splitlines() if '=' in line and not line.startswith('#'))
private=p/'private';private.mkdir(mode=0o700,exist_ok=True);os.chown(private,10001,10001);private.chmod(0o700)
auth=private/'auth.json'
if not auth.exists():
    values=env('access.env');salt=secrets.token_hex(16)
    hashed=hashlib.scrypt(values['N8N_OWNER_PASSWORD'].encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
    auth.write_text(json.dumps({'login':values['N8N_OWNER_EMAIL'].lower(),'salt':salt,'password_hash':hashed,'jwt_key':secrets.token_hex(64),'vault_key':secrets.token_hex(32)}));auth.chmod(0o600);os.chown(auth,10001,10001)
values=json.loads(auth.read_text())
if not values.get('vault_key'):
    values['vault_key']=secrets.token_hex(32);auth.write_text(json.dumps(values));auth.chmod(0o600);os.chown(auth,10001,10001)
# Preserve the last running image for operational rollback; additive DB migration.
container=subprocess.check_output(['docker','compose','ps','-q','bridge'],text=True).strip()
if container:
    old=subprocess.check_output(['docker','inspect','--format={{.Image}}',container],text=True).strip()
    tagged=subprocess.run(['docker','tag',old,'aipbx-helpdesk-bridge:pre-registry'],stderr=subprocess.DEVNULL)
    if tagged.returncode:print('Prior image metadata unavailable; preserved prior-source.tar for rollback rebuild')
subprocess.run(['python3','backup.py'],check=True)
subprocess.run(['docker','compose','run','--rm','--no-deps','-v',str(p/'init-console.py')+':/app/init-console.py:ro','bridge','python','/app/init-console.py'],check=True)
conf=pathlib.Path('/etc/nginx/sites-enabled/krasterisk').resolve();old=conf.read_text()
if '# aipbx-helpdesk client console' not in old:
    saved=p/('nginx-before-console-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.conf');saved.write_text(old);saved.chmod(0o600)
    marker='    # aipbx-helpdesk managed location'
    if marker not in old:raise RuntimeError('Expected nginx location marker missing')
    block='''    # aipbx-helpdesk client console
    location = /helpdesk-clients { return 301 /helpdesk-clients/; }
    location ^~ /helpdesk-clients/ {
        proxy_pass http://127.0.0.1:8088/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 1m;
        proxy_read_timeout 180s;
    }

'''
    conf.write_text(old.replace(marker,block+marker,1))
    check=subprocess.run(['nginx','-t'])
    if check.returncode:conf.write_text(old);raise RuntimeError('nginx check failed; original restored')
    subprocess.run(['systemctl','reload','nginx'],check=True)
subprocess.run(['docker','compose','up','-d','--no-deps','bridge'],check=True)
subprocess.run(['docker','compose','cp','migrate-vault.py','bridge:/tmp/migrate-vault.py'],check=True)
subprocess.run(['docker','compose','exec','-T','-e','PYTHONPATH=/app','bridge','python','/tmp/migrate-vault.py'],check=True)
print('Console deployed; owner credentials remain in access.env')