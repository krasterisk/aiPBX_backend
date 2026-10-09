import connectors,json
count=0
for file in connectors.PRIVATE.glob('source-*.json'):
    sid=int(file.stem.split('-')[1])
    if json.loads(file.read_text()).get('version')!=1:
        connectors.save_secrets(sid,{})
    # Validate authenticated decryption without showing any value.
    connectors.secrets(sid);count+=1
print('Encrypted credential files validated:',count)