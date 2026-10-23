"""Publish only an ephemeral runner IPv4, then wait for a bounded SSH exception.

No firewall or credential changes are performed by this script. An authorized
operator must allow this exact IPv4/32 on the destination with automatic expiry.
"""
import datetime
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
import time
import urllib.request

mode = sys.argv[1]
assert mode in ('report', 'wait')
assert os.environ['PRODUCTION_TARGET'] == 'aipbxru_production'
host = os.environ['PRODUCTION_HOST']
path = Path(os.environ['RUNNER_TEMP']) / 'production-ssh-access.json'

if mode == 'report':
    configured = {r[4][0] for r in socket.getaddrinfo(host, 22, socket.AF_INET)}
    expected = {r[4][0] for r in socket.getaddrinfo('aipbx.ru', 22, socket.AF_INET)}
    with urllib.request.urlopen('https://api4.ipify.org', timeout=15) as response:
        address = ipaddress.ip_address(response.read(64).decode().strip())
    assert address.version == 4 and address.is_global
    result = {
        'runner_ip': str(address), 'port': 22,
        'target': os.environ['PRODUCTION_TARGET'],
        'repository': os.environ['GITHUB_REPOSITORY'],
        'head_sha': os.environ['GITHUB_SHA'],
        'run_id': os.environ['GITHUB_RUN_ID'],
        'run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'destination_matches': bool(configured) and configured.issubset(expected),
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    path.write_text(json.dumps(result), encoding='utf-8')
    assert result['destination_matches'], 'Configured SSH destination differs from aipbx.ru'
    print('Ephemeral runner access request prepared; no credentials included.')
else:
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, 22), timeout=4) as connection:
                connection.settimeout(4)
                assert connection.recv(256).startswith(b'SSH-'), 'Unexpected service on SSH port'
            print('SSH is reachable; continuing the authorized deployment.')
            break
        except (OSError, AssertionError):
            time.sleep(10)
    else:
        raise SystemExit('SSH access was not granted within the 15 minute window')
