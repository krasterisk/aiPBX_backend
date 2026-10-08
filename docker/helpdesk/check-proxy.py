import os,network
try:
    import bridge
    print('Telegram proxy configured:',bool(os.getenv('TELEGRAM_PROXY')))
    print('Telegram getMe via proxy:',bool(bridge.telegram('getMe',{}).get('id')))
    print('Telegram existing webhook:',bool(bridge.telegram('getWebhookInfo',{}).get('url')))
except Exception as e:
    print('Telegram proxy check: FAIL '+type(e).__name__)
    raise SystemExit(1)
