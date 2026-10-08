import pathlib,hashlib
p=pathlib.Path('/opt/aipbx-helpdesk')
e=dict(l.split('=',1) for l in (p/'integrations.env').read_text(encoding='utf-8-sig').splitlines() if '=' in l)
f=p/'exposed-token.sha256'
if not f.exists():
    f.write_text(hashlib.sha256(e['TELEGRAM_BOT_TOKEN'].strip().strip('\"').strip("'").encode()).hexdigest());f.chmod(0o600)
print('Exposed token fingerprint recorded (not printed)')
