import os,runpy
os.environ['DATABASE_URL']=os.environ['DATABASE_URL'].rsplit('/',1)[0]+'/helpdesk_test'
os.environ['RUN_DB_TESTS']='true'
runpy.run_path('/app/tests.py',run_name='__main__')