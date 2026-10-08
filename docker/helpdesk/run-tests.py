import pathlib,subprocess,os
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
e=dict(l.split('=',1) for l in (p/'.env').read_text().splitlines() if '=' in l)
exists=subprocess.check_output(['docker','compose','exec','-T','postgres','psql','-U','helpdesk','-d','postgres','-tAc',"SELECT 1 FROM pg_database WHERE datname='helpdesk_test'"]).strip()
if not exists:subprocess.run(['docker','compose','exec','-T','postgres','createdb','-U','helpdesk','helpdesk_test'],check=True)
url='postgresql://helpdesk:'+e['POSTGRES_PASSWORD']+'@postgres:5432/helpdesk_test'
result=subprocess.run(['docker','compose','exec','-T','-e','RUN_DB_TESTS=true','-e','DATABASE_URL='+url,'bridge','python','tests.py'])
if result.returncode:raise SystemExit(result.returncode)
print('Isolated database safety tests: PASS')
