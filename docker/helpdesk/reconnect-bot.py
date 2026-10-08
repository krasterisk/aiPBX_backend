import pathlib,hashlib,subprocess,os
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
e=dict(l.split('=',1) for l in (p/'integrations.env').read_text(encoding='utf-8-sig').splitlines() if '=' in l)
token=e['TELEGRAM_BOT_TOKEN'].strip().strip('\"').strip("'")
assert hashlib.sha256(token.encode()).hexdigest()!=(p/'exposed-token.sha256').read_text().strip(),'Token rotation pending'
(p/'integrations.env').chmod(0o600)
print('Token rotation confirmed')
subprocess.run(['docker','compose','up','-d','bridge'],check=True)
subprocess.run(['docker','compose','cp','connect-bot.py','bridge:/tmp/connect-bot.py'],check=True)
subprocess.run(['docker','compose','exec','-T','-e','PYTHONPATH=/app','bridge','python','/tmp/connect-bot.py'],check=True)
