import os,routing,bridge,json
cases=[('Ассистенты и баланс','Скажи, какие у меня есть ассистенты рабочие в кабинете и баланс мой сообщи?',['cabinet']),('Метрики проекта','Почему в моём проекте аналитики неправильно рассчитывается метрика успешности?',['analytics_project']),('Общие возможности','Чем отличаются голосовые ассистенты от речевой аналитики?',[])]
for subject,body,expected in cases:
    reads=routing.plan_reads(bridge.call,subject,body,os.environ['DEEPSEEK_API_KEY'])
    print(json.dumps({'case':subject,'reads':reads,'passed':reads==expected},ensure_ascii=False),flush=True)
    if reads!=expected:raise RuntimeError('Unexpected read plan')