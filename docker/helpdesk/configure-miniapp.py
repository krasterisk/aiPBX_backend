import bridge,json
url='https://ipbx.krasterisk.ru/helpdesk-clients/'
bridge.telegram('setChatMenuButton',{'menu_button':{'type':'web_app','text':'Кабинет','web_app':{'url':url}}})
menu=bridge.telegram('getChatMenuButton',{})
if menu.get('type')!='web_app' or menu.get('web_app',{}).get('url')!=url:raise RuntimeError('Mini App menu validation failed')
print(json.dumps({'miniAppMenu':'configured','url':url}))
bridge.notify('Веб-кабинет helpdesk готов: '+url+'\nВ боте появилось меню «Кабинет». Вход — текущий логин/пароль n8n; регистрацию отключил.\nСоздайте клиента, настройте источники и привяжите письмо: /client НОМЕР_ТИКЕТА ID_КЛИЕНТА.\nВкладка «Тикеты» содержит обращения, переписку, черновики и журнал действий.')