import pathlib,subprocess,os,json
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
def run(*args,**kwargs):return subprocess.run(list(args),check=True,**kwargs)
run('docker','pull','postgres:17-alpine',stdout=subprocess.DEVNULL)
info=json.loads(subprocess.check_output(['docker','image','inspect','postgres:17-alpine']))[0]
image=info['RepoDigests'][0]
compose=p/'compose.yaml'
old=compose.read_text(encoding='utf-8-sig')
if 'postgres_data:/var/lib/postgresql/data' in old:
    run('docker','compose','stop','n8n','bridge')
    migration=p/'postgres-migration';migration.mkdir(mode=0o700,exist_ok=True)
    for database in ['n8n','helpdesk']:
        with (migration/(database+'.dump')).open('wb') as out:
            run('docker','compose','exec','-T','postgres','pg_dump','-U','helpdesk','-Fc',database,stdout=out)
    run('docker','compose','stop','postgres')
    new=old.replace('postgres:16.13-alpine',image).replace('postgres_data:/var/lib/postgresql/data','postgres17_data:/var/lib/postgresql/data')
    new=new.replace('  postgres_data:\n','  postgres_data:\n  postgres17_data:\n')
    compose.write_text(new)
    run('docker','compose','up','-d','--wait','postgres')
    for database in ['n8n','helpdesk']:
        with (migration/(database+'.dump')).open('rb') as inp:
            run('docker','compose','exec','-T','postgres','pg_restore','-U','helpdesk','--exit-on-error','--no-owner','-d',database,stdin=inp)
    run('docker','compose','up','-d','n8n','bridge')
print('PostgreSQL 17 migration: PASS; original volume and dumps retained')
