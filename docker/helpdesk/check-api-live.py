import bridge,os,json
for label,address in [('unknown-email','n8n-connectivity-check@invalid.example'),('configured-mailbox',os.environ['YANDEX_EMAIL'])]:
    try:
        context=bridge.client_context(None,address)
        print(json.dumps({'case':label,'api_access':'PASS','found':context.get('found'),'ambiguous':context.get('ambiguous'),'reason':context.get('reason'),'project_context_shape_valid':all(k in context for k in ['project','topics','transcripts','analysis']) if context.get('found') else None,'transcript_count':len(context.get('transcripts',[])),'analysis_count':len(context.get('analysis',[]))}))
    except Exception as e:
        print(json.dumps({'case':label,'api_access':'FAIL','error_type':type(e).__name__,'http_status':getattr(e,'code',None)}))
        raise SystemExit(1)
