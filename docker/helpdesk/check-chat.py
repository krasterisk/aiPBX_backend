import bridge,os,json
updates=bridge.telegram('getUpdates',{'timeout':0,'allowed_updates':['message']})
starts=[]
for u in updates:
    m=u.get('message',{})
    if m.get('text','').startswith('/start'):
        starts.append({'user_id':m.get('from',{}).get('id'),'chat_id':m.get('chat',{}).get('id'),'chat_type':m.get('chat',{}).get('type'),'matches_configured_approver':str(m.get('from',{}).get('id'))==os.environ['TELEGRAM_APPROVER_USER_ID']})
print(json.dumps({'configured_ids_equal':os.environ['TELEGRAM_APPROVER_USER_ID']==os.environ['TELEGRAM_APPROVAL_CHAT_ID'],'start_events':starts}))
