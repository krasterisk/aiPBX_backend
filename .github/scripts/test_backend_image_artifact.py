import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('backend_release', Path(__file__).with_name('backend-image-artifact.py'))
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)


class BackendReleaseTest(unittest.TestCase):
    def setUp(self):
        self.revision = 'a' * 40
        self.meta = {'sourceSha': self.revision, 'version': '2.9.32', 'tag': 'aipbx-backend-ci:' + self.revision, 'platform': 'linux/amd64', 'archiveSha256': 'b' * 64, 'imageContentHash': 'c' * 64, 'compressedBytes': 123}

    def test_rejects_wrong_revision_version_tag_platform_and_checksums(self):
        release.validate(self.meta, self.revision, '2.9.32')
        for key, value in [('sourceSha', 'd' * 40), ('version', '2.9.29'), ('tag', 'other:latest'), ('platform', 'linux/arm64'), ('archiveSha256', 'bad'), ('imageContentHash', 'bad'), ('compressedBytes', 0)]:
            with self.subTest(key=key), self.assertRaises(AssertionError): release.validate({**self.meta, key: value}, self.revision, '2.9.32')

    def test_rejects_release_path_and_ssh_argument_injection(self):
        self.assertEqual(release.release_dir('123', '2').as_posix(), '/app/aipbx-backend-releases/123-2')
        for run, attempt in [('../123', '1'), ('1', '../../etc'), ('1;touch x', '2')]:
            with self.assertRaises(AssertionError): release.release_dir(run, attempt)
        release.validate_destination('aipbx.ru', 'aipbxru', 'aipbxru_production')
        release.validate_destination('192.0.2.1', 'aipbxru', 'aipbxru_production')
        for host, user, target in [('-oProxyCommand=x', 'aipbxru', 'aipbxru_production'), ('aipbx.ru/x', 'aipbxru', 'aipbxru_production'), ('aipbx.ru', 'root;id', 'aipbxru_production'), ('aipbx.ru', 'aipbxru', 'aipbxnet_production')]:
            with self.assertRaises(AssertionError): release.validate_destination(host, user, target)

    def test_filesystem_runtime_configuration_and_platform_are_part_of_integrity(self):
        image = {'Id': 'engine-specific', 'Config': {'Env': ['NODE_ENV=production'], 'User': 'node', 'Labels': {'revision': self.revision}}, 'RootFS': {'Layers': ['sha256:abc']}, 'Os': 'linux', 'Architecture': 'amd64'}
        expected = release.image_hash(image)
        alternate = copy.deepcopy(image); alternate['Id'] = 'other-engine-format'
        self.assertEqual(release.image_hash(alternate), expected)
        for edge in ['layers', 'env', 'user', 'labels', 'arch']:
            altered = copy.deepcopy(image)
            if edge == 'layers': altered['RootFS']['Layers'] = ['sha256:other']
            elif edge == 'env': altered['Config']['Env'] = ['NODE_ENV=debug']
            elif edge == 'user': altered['Config']['User'] = 'root'
            elif edge == 'labels': altered['Config']['Labels'] = {'revision': 'other'}
            else: altered['Architecture'] = 'arm64'
            with self.subTest(edge=edge): self.assertNotEqual(release.image_hash(altered), expected)

    def test_ru_only_pipeline_installs_with_no_build_and_preserves_other_targets(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / '.github/workflows/deploy.yml').read_text()
        self.assertIn('backend-image-artifact.py build', workflow)
        self.assertIn('backend-image-artifact.py verify', workflow)
        self.assertIn('--no-build --no-deps --force-recreate backend', workflow)
        self.assertIn('--build \\\n', workflow)
        ignore = (root / '.dockerignore').read_text().splitlines()
        for entry in ['.git', 'node_modules', '.env*', '*.env', '*.env.*']: self.assertIn(entry, ignore)



    def test_signed_urls_require_verified_https_artifact_hosts(self):
        release.validate_signed_url('https://production.blob.core.windows.net/artifact?sig=temporary')
        for url in ['http://production.blob.core.windows.net/x', 'https://127.0.0.1/x', 'https://production.blob.core.windows.net.evil.test/x', 'https://secret@production.blob.core.windows.net/x', 'https://production.blob.core.windows.net:22/x']:
            with self.subTest(url=url), self.assertRaises(AssertionError): release.validate_signed_url(url)

    def test_download_capability_uses_stdin_and_no_github_token_reaches_remote_command(self):
        import tempfile
        import os
        import json
        from unittest.mock import patch
        signed = 'https://production.blob.core.windows.net/image?sig=private-download-capability'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'backend-image-release'; root.mkdir()
            (root / 'image.tar.gz').write_bytes(b'fixture')
            (root / 'release.json').write_text(json.dumps({'version': '2.9.32'}))
            env = {'PRODUCTION_HOST': 'aipbx.ru', 'PRODUCTION_USER': 'aipbxru', 'PRODUCTION_TARGET': 'aipbxru_production', 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1', 'RUNNER_TEMP': folder, 'GITHUB_SHA': self.revision, 'PRODUCTION_SSH_KEY': 'synthetic-key', 'GITHUB_TOKEN': 'synthetic-token'}
            with patch.dict(os.environ, env), patch.object(release, 'artifact_url', return_value=signed), patch.object(release, 'run', return_value='') as transport:
                release.upload()
            args, kwargs = transport.call_args
            command = ' '.join(args[0])
            self.assertNotIn('private-download-capability', command)
            self.assertNotIn('synthetic-token', command + kwargs['input'])
            self.assertEqual(json.loads(kwargs['input'])['url'], signed)
            self.assertIn('StrictHostKeyChecking=yes', command)
            self.assertFalse(any(p.name.startswith('backend-release-') for p in Path(folder).iterdir()))


if __name__ == '__main__': unittest.main()
