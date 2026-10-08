"""Bound Telegram connection attempts; IPv6 is the working route on this host."""
import socket
_original_connection = socket.create_connection

def telegram_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None, *, all_errors=False):
    if address[0] != 'api.telegram.org':
        return _original_connection(address,timeout,source_address,all_errors=all_errors)
    addresses=socket.getaddrinfo(address[0],address[1],socket.AF_UNSPEC,socket.SOCK_STREAM)
    addresses.sort(key=lambda item: item[0] != socket.AF_INET6)
    error=None
    for family,kind,protocol,_,target in addresses:
        connection=None
        try:
            connection=socket.socket(family,kind,protocol)
            connection.settimeout(min(5,timeout) if isinstance(timeout,(int,float)) else 5)
            if source_address:connection.bind(source_address)
            connection.connect(target)
            connection.settimeout(timeout if isinstance(timeout,(int,float)) else None)
            return connection
        except OSError as failure:
            error=failure
            if connection:connection.close()
    if error:raise error
    raise OSError('No Telegram addresses resolved')

socket.create_connection=telegram_connection

class TelegramAPIError(RuntimeError):
    def __init__(self,code):
        self.code=code
        super().__init__('Telegram API HTTP '+str(code))

class TelegramTransportError(RuntimeError):
    pass

def json_request(url,data=None,headers=None):
    import os,json,urllib.request
    proxy=os.environ.get('TELEGRAM_PROXY','').strip().strip('\"').strip("'")
    if url.startswith('https://api.telegram.org/') and proxy:
        import requests
        if proxy.startswith('socks5://'):proxy='socks5h://'+proxy[len('socks5://'):]
        try:
            with requests.Session() as session:
                session.trust_env=False
                response=session.request('POST' if data is not None else 'GET',url,json=data,headers=headers or {},proxies={'http':proxy,'https':proxy},timeout=(10,30))
                if response.status_code >= 400:raise TelegramAPIError(response.status_code)
                return response.json()
        except requests.RequestException as failure:
            raise TelegramTransportError(type(failure).__name__) from None
    request=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=headers or {})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
