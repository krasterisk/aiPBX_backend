#!/usr/bin/env python3
import os, pathlib, secrets
p = pathlib.Path('/opt/aipbx-helpdesk')
os.chmod(p,0o700)
env=p/'.env'
if not env.exists():
    env.write_text('POSTGRES_PASSWORD='+secrets.token_hex(32)+'\nN8N_ENCRYPTION_KEY='+secrets.token_hex(32)+'\nBRIDGE_TOKEN='+secrets.token_hex(32)+'\n')
os.chmod(env,0o600)
os.chmod(p/'integrations.env',0o600)
