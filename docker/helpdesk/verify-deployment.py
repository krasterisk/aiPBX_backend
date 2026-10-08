import pathlib,subprocess,os,hashlib,urllib.request,urllib.error,json
p=pathlib.Path('/opt/aipbx-helpdesk');os.chdir(p)
# Units have no credentials. Keep all secret-bearing backup files root-only.
for name in ['aipbx-helpdesk-backup.service','aipbx-helpdesk-backup.timer']:
    subprocess.run(['install','-m','644',str(p/name),'/etc/systemd/system/'+name],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','aipbx-helpdesk-backup.timer'],check=True)
subprocess.run(['python3',str(p/'backup.py')],check=True)
f=sorted((p/'backups').iterdir())[-1]
for line in (f/'SHA256SUMS').read_text().splitlines():
    expected,name=line.split('  ',1)
    assert hashlib.sha256((f/name).read_bytes()).hexdigest()==expected
for database in ['n8n','helpdesk']:
    target=database+'_restore_check'
    # All operations target fresh, dedicated restore-check databases only.
    subprocess.run(['docker','compose','exec','-T','postgres','createdb','-U','helpdesk',target],check=True)
    with (f/(database+'.dump')).open('rb') as inp:
        subprocess.run(['docker','compose','exec','-T','postgres','pg_restore','-U','helpdesk','--exit-on-error','--no-owner','-d',target],stdin=inp,check=True)
print('Backup checksums and isolated n8n/helpdesk restoration: PASS')
for route in ['/helpdesk/','/helpdesk/assets/index-Bps3wcx5.js','/helpdesk/rest/settings']:
    with urllib.request.urlopen('https://ipbx.krasterisk.ru'+route,timeout=15) as r:
        print(route+': '+str(r.status)+' '+r.headers['Content-Type'])
        if route.endswith('settings'):
            settings=json.load(r)['data'];print('First-load setup disabled: '+str(not settings['userManagement']['showSetupOnFirstLoad']))
subprocess.run(['docker','compose','ps'],check=True)
subprocess.run(['systemctl','list-timers','aipbx-helpdesk-backup.timer','--no-pager'],check=True)
