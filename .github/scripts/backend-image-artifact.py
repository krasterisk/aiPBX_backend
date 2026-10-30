"""RU only: build on Actions and install the verified image without production builds."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import gzip
import urllib.request
import urllib.error
import urllib.parse

if not __debug__:
    raise RuntimeError('Release validation requires Python assertions enabled')

HOST_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIARpd/YonUy13Q3L3Cw1UXa899L5etIC8UUT2aRMF+5J'
CONFIG_KEYS = ('User', 'Env', 'Entrypoint', 'Cmd', 'WorkingDir', 'ExposedPorts', 'Labels', 'StopSignal', 'Healthcheck', 'Shell', 'Volumes', 'OnBuild', 'ArgsEscaped')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()


def image_hash(image):
    data = {'config': {key: image['Config'].get(key) for key in CONFIG_KEYS}, 'layers': image['RootFS']['Layers'], 'os': image['Os'], 'arch': image['Architecture']}
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def release_dir(run, attempt):
    assert re.fullmatch(r'\d+', run) and re.fullmatch(r'\d+', attempt), 'Invalid run identity'
    return Path('/app/aipbx-backend-releases') / (run + '-' + attempt)


def validate_destination(host, user, target):
    assert target == 'aipbxru_production', 'RU-only release'
    assert re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', host)
    assert re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,31}', user)


def validate(meta, revision, version):
    assert re.fullmatch('[0-9a-f]{40}', revision) and meta['sourceSha'] == revision
    assert meta['version'] == version and re.fullmatch(r'\d+\.\d+\.\d+', version)
    assert meta['tag'] == 'aipbx-backend-ci:' + revision
    assert meta['platform'] == 'linux/amd64'
    for field in ['archiveSha256', 'imageContentHash']: assert re.fullmatch('[0-9a-f]{64}', meta[field])
    assert 0 < meta['compressedBytes'] < 8 * 1024 ** 3


def run(args, input=None):
    for attempt in range(3 if args[0] in ['ssh', 'scp'] else 1):
        result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=1200)
        if result.returncode == 0: return result.stdout
        fatal = any(s in result.stderr for s in ['Permission denied', 'Host key verification failed', 'REMOTE HOST IDENTIFICATION', 'invalid format'])
        if args[0] not in ['ssh', 'scp'] or result.returncode != 255 or fatal or attempt == 2:
            raise RuntimeError('Release command failed: ' + args[0] + ', exit ' + str(result.returncode))
        time.sleep((5, 15)[attempt])


def build():
    revision = os.environ['GITHUB_SHA']; assert re.fullmatch('[0-9a-f]{40}', revision)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == revision
    version = json.loads(Path('package.json').read_text())['version']; tag = 'aipbx-backend-ci:' + revision
    subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--label', 'org.opencontainers.image.revision=' + revision, '--label', 'org.opencontainers.image.version=' + version, '-t', tag, '.'], check=True)
    image = json.loads(run(['docker', 'image', 'inspect', tag]))[0]
    assert image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    root = Path(os.environ['RUNNER_TEMP']) / 'backend-image-release'; root.mkdir(mode=0o700)
    archive = root / 'image.tar.gz'
    with gzip.open(archive, 'wb', compresslevel=1) as output:
        process = subprocess.Popen(['docker', 'save', tag], stdout=subprocess.PIPE)
        try: shutil.copyfileobj(process.stdout, output)
        finally: process.stdout.close()
        assert process.wait() == 0, 'Image export failed'
    meta = {'sourceSha': revision, 'version': version, 'tag': tag, 'platform': 'linux/amd64', 'archiveSha256': sha(archive), 'imageContentHash': image_hash(image), 'compressedBytes': archive.stat().st_size}
    validate(meta, revision, version); (root / 'release.json').write_text(json.dumps(meta, indent=2))
    print('Backend image built and exported; credentials and environment files excluded')


def validate_signed_url(url):
    parsed = urllib.parse.urlsplit(url)
    assert parsed.scheme == 'https' and parsed.username is None and parsed.password is None and parsed.port in (None, 443)
    assert parsed.hostname and parsed.hostname.endswith(('.blob.core.windows.net', '.githubusercontent.com', '.actions.githubusercontent.com'))


def artifact_url():
    assert os.environ['GITHUB_REPOSITORY'] == 'krasterisk/aiPBX_backend'
    run_id, attempt = os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_RUN_ATTEMPT']; release_dir(run_id, attempt)
    base = 'https://api.github.com/repos/krasterisk/aiPBX_backend'
    headers = {'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache'}
    with urllib.request.urlopen(urllib.request.Request(base + '/actions/runs/' + run_id + '/artifacts?per_page=100', headers=headers), timeout=30) as response: items = json.load(response)['artifacts']
    found = [a for a in items if a['name'] == 'backend-image-release-' + run_id + '-' + attempt and not a['expired']]
    assert len(found) == 1 and found[0]['workflow_run']['head_sha'] == os.environ['GITHUB_SHA']
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    try:
        urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(base + '/actions/artifacts/' + str(found[0]['id']) + '/zip', headers=headers), timeout=30)
    except urllib.error.HTTPError as error:
        assert error.code == 302
        url = error.headers['Location']; validate_signed_url(url); return url
    raise RuntimeError('Expected a short-lived artifact download redirect')


PULL_CODE = r'''
import sys,json,pathlib,os,subprocess,urllib.request,urllib.parse,zipfile,stat,hashlib,re,fcntl
if not __debug__:raise RuntimeError('Validation must be enabled')
d=json.load(sys.stdin);p=pathlib.Path(d['directory']);assert re.fullmatch(r'/app/aipbx-backend-releases/\d+-\d+',str(p))
u=urllib.parse.urlsplit(d['url']);assert u.scheme=='https' and u.username is None and u.password is None and u.port in (None,443) and u.hostname.endswith(('.blob.core.windows.net','.githubusercontent.com','.actions.githubusercontent.com'))
assert not p.parent.is_symlink()
if not p.parent.exists():
 subprocess.run(['sudo','-n','mkdir','-m','700',str(p.parent)],check=True)
 subprocess.run(['sudo','-n','chown',str(os.getuid())+':'+str(os.getgid()),str(p.parent)],check=True)
assert p.parent.stat().st_uid==os.getuid();p.mkdir(mode=0o700,exist_ok=True);assert not p.is_symlink() and p.stat().st_uid==os.getuid();os.chmod(p,0o700)
for n in ['download.zip.tmp','image.tar.gz.tmp','release.json.tmp','image.tar.gz','release.json','.transfer.lock']:assert not (p/n).is_symlink()
lock=os.open(p/'.transfer.lock',os.O_CREAT|os.O_WRONLY,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
temporary=p/'download.zip.tmp'
try:
 with urllib.request.urlopen(d['url'],timeout=90) as source,temporary.open('wb') as output:
  total=0
  while True:
   chunk=source.read(1024*1024)
   if not chunk:break
   total+=len(chunk);assert total<8*1024**3;output.write(chunk)
 with zipfile.ZipFile(temporary) as z:
  assert len(z.infolist())==2 and set(z.namelist())=={'image.tar.gz','release.json'}
  assert all(not stat.S_ISLNK(i.external_attr>>16) for i in z.infolist())
  assert z.getinfo('release.json').file_size<65536 and z.getinfo('image.tar.gz').file_size<8*1024**3
  m=json.loads(z.read('release.json'));assert m['sourceSha']==d['revision'] and m['version']==d['version'] and re.fullmatch('[0-9a-f]{64}',m['archiveSha256'])
  h=hashlib.sha256();size=0
  with z.open('image.tar.gz') as source,(p/'image.tar.gz.tmp').open('wb') as output:
   while True:
    chunk=source.read(1024*1024)
    if not chunk:break
    h.update(chunk);size+=len(chunk);output.write(chunk)
  assert h.hexdigest()==m['archiveSha256'] and size==m['compressedBytes']
  (p/'release.json.tmp').write_text(json.dumps(m))
  for name in ['image.tar.gz','release.json']:os.chmod(p/(name+'.tmp'),0o600);os.replace(p/(name+'.tmp'),p/name)
 print('Private HTTPS artifact received; revision/version/SHA verified')
except Exception as error:
 raise RuntimeError('Private artifact transfer failed: '+type(error).__name__) from None
finally:
 if temporary.exists() and not temporary.is_symlink():temporary.unlink()
'''


def upload():
    host, user = os.environ['PRODUCTION_HOST'], os.environ['PRODUCTION_USER']
    validate_destination(host, user, os.environ['PRODUCTION_TARGET'])
    target = release_dir(os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_RUN_ATTEMPT'])
    root = Path(os.environ['RUNNER_TEMP']) / 'backend-image-release'
    assert (root / 'image.tar.gz').is_file() and (root / 'release.json').is_file()
    with tempfile.TemporaryDirectory(prefix='backend-release-', dir=os.environ['RUNNER_TEMP']) as temporary:
        os.chmod(temporary, 0o700); key, known = Path(temporary) / 'key', Path(temporary) / 'known_hosts'
        for file, value in [(key, os.environ['PRODUCTION_SSH_KEY'].replace('\r\n', '\n').strip() + '\n'), (known, host + ' ' + HOST_PUBLIC_KEY + '\n')]:
            fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as stream: stream.write(value)
        options = ['-4', '-i', str(key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'UserKnownHostsFile=' + str(known), '-o', 'ConnectTimeout=10', '-o', 'IPQoS=none', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3']
        remote = user + '@' + host
        payload = {'directory': str(target), 'url': artifact_url(), 'revision': os.environ['GITHUB_SHA'], 'version': json.loads((root / 'release.json').read_text())['version']}
        run(['ssh', *options, remote, 'python3 -c ' + shlex.quote(PULL_CODE)], input=json.dumps(payload))
    print('Verified private HTTPS transfer complete; temporary SSH files removed')


def verify(folder, revision):
    folder = Path(folder); assert re.fullmatch(r'/app/aipbx-backend-releases/\d+-\d+', str(folder))
    assert not folder.is_symlink() and not folder.parent.is_symlink()
    archive = folder / 'image.tar.gz'; receipt = folder / 'release.json'
    assert archive.is_file() and receipt.is_file() and not archive.is_symlink() and not receipt.is_symlink()
    meta = json.loads(receipt.read_text()); version = json.loads(Path('/app/aiPBX_backend/package.json').read_text())['version']
    validate(meta, revision, version)
    assert run(['git', '-C', '/app/aiPBX_backend', 'rev-parse', 'HEAD']).strip() == revision
    assert archive.stat().st_size == meta['compressedBytes'] and sha(archive) == meta['archiveSha256'], 'Transport checksum mismatch'
    run(['sudo', '-n', 'docker', 'load', '--input', str(archive)])
    image = json.loads(run(['sudo', '-n', 'docker', 'image', 'inspect', meta['tag']]))[0]
    assert image_hash(image) == meta['imageContentHash'], 'Image configuration/filesystem mismatch'
    assert image['Config']['Labels']['org.opencontainers.image.revision'] == revision
    assert image['Config']['Labels']['org.opencontainers.image.version'] == version
    current = json.loads(run(['sudo', '-n', 'docker', 'inspect', 'app-backend-1']))[0]
    alias = current['Config']['Image']
    assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_./:-]+', alias) and not alias.startswith('sha256:')
    before = folder / 'before.json'; assert not before.exists()
    before.write_text(json.dumps({'image': current['Image'], 'containerId': current['Id'], 'composeImage': alias}))
    # Retain the configured local alias so future ordinary Compose commands use this release too.
    run(['sudo', '-n', 'docker', 'tag', meta['tag'], alias])
    override = 'services:\n  backend:\n    image: ' + json.dumps(alias) + '\n    pull_policy: never\n'
    assert not (folder / 'runtime.override.yml').is_symlink()
    (folder / 'runtime.override.yml').write_text(override)
    print('Backend source/version/transport/filesystem/configuration verified')


def check(folder, revision):
    folder = Path(folder); assert re.fullmatch(r'/app/aipbx-backend-releases/\d+-\d+', str(folder)) and not folder.is_symlink()
    meta = json.loads((folder / 'release.json').read_text()); validate(meta, revision, meta['version'])
    container = json.loads(run(['sudo', '-n', 'docker', 'inspect', 'app-backend-1']))[0]
    image = json.loads(run(['sudo', '-n', 'docker', 'image', 'inspect', container['Image']]))[0]
    assert image_hash(image) == meta['imageContentHash'], 'Running image differs from verified artifact'
    assert container['State']['Health']['Status'] == 'healthy'
    version = run(['sudo', '-n', 'docker', 'exec', 'app-backend-1', 'node', '-p', "require('./package.json').version"]).strip()
    assert version == meta['version']
    print('Running backend image, version and health match the verified artifact')


def cleanup(folder):
    folder = Path(folder); assert re.fullmatch(r'/app/aipbx-backend-releases/\d+-\d+', str(folder)) and not folder.is_symlink()
    archive = folder / 'image.tar.gz'; assert archive.is_file() and not archive.is_symlink(); archive.unlink()
    print('Own transport archive removed; image and release receipt retained')


if __name__ == '__main__':
    assert __debug__, 'Validation must remain enabled'
    mode = sys.argv[1]
    if mode == 'build': build()
    elif mode == 'upload': upload()
    elif mode == 'verify': verify(sys.argv[2], sys.argv[3])
    elif mode == 'check': check(sys.argv[2], sys.argv[3])
    elif mode == 'cleanup': cleanup(sys.argv[2])
    else: raise ValueError('Invalid release operation')
