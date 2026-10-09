import os,runpy,tempfile,json,secrets
from pathlib import Path
os.environ['DATABASE_URL']=os.environ['DATABASE_URL'].rsplit('/',1)[0]+'/helpdesk_test'
os.environ['RUN_DB_TESTS']='true'
with tempfile.TemporaryDirectory(prefix='helpdesk-tests-') as directory:
    os.environ['PRIVATE_DIR']=directory
    (Path(directory)/'auth.json').write_text(json.dumps({'vault_key':secrets.token_hex(32),'jwt_key':secrets.token_hex(64)}))
    runpy.run_path('/app/tests.py',run_name='__main__')