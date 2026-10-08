import os,json,bridge
me=bridge.telegram('getMe',{})
assert not bridge.telegram('getWebhookInfo',{}).get('url'),'Dedicated bot must have no webhook'
chat=bridge.telegram('getChat',{'chat_id':os.environ['TELEGRAM_APPROVAL_CHAT_ID']})
assert str(chat['id'])==os.environ['TELEGRAM_APPROVAL_CHAT_ID']
assert os.environ['TELEGRAM_APPROVER_USER_ID'].isdigit()
print(json.dumps({'bot_username':me['username'],'chat_access':'PASS','chat_type':chat['type'],'private_chat_matches_approver':str(chat['id'])==os.environ['TELEGRAM_APPROVER_USER_ID']}))
bridge.notify('aiPBX Helpdesk подключён. Новые письма будут готовиться в черновики; отправка — только после вашего одобрения конкретной версии. Неизвестный клиент или неоднозначный проект переводятся на ручную проверку.')
print('Dedicated bot connection notification: SENT')
