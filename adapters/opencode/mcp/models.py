"""Read-only local serving discovery and owner profile recommendations."""
from __future__ import annotations
import json,time,urllib.request
ENDPOINTS={'lmstudio':'http://127.0.0.1:1234/v1/models','ollama':'http://127.0.0.1:11434/api/tags','vllm':'http://127.0.0.1:8000/v1/models'}
def probe_local(endpoints=None):
 result={}
 for provider,url in (endpoints or ENDPOINTS).items():
  start=time.monotonic()
  try:
   with urllib.request.urlopen(url,timeout=1.5) as response:payload=json.load(response)
   rows=payload.get('models',[]) if provider=='ollama' else payload.get('data',[])
   ids=[provider+'/'+str(item.get('name') if provider=='ollama' else item.get('id')) for item in rows if item.get('name') or item.get('id')]
   result[provider]={'status':'SERVING','served_ids':ids,'elapsed_seconds':round(time.monotonic()-start,3),'limitation':'Listed by server; tool support, specialization and inference quality require benchmarks'}
  except Exception as e:
   result[provider]={'status':'UNREACHABLE','served_ids':[],'error_type':type(e).__name__}
 return result

def recommend(profiles,ids,specialization,local_status):
 candidates=[]
 for p in profiles:
  if p['id'] not in ids or (specialization and specialization not in p.get('specializations',[])):continue
  item=dict(p);provider=p['id'].split('/',1)[0]
  serving=provider not in local_status or p['id'] in local_status[provider]['served_ids']
  item['connection_status']=('SERVING' if serving else 'UNREACHABLE') if provider in local_status else 'NOT_PROBED_CLOUD'
  item['specialty_quality']=p.get('specialty_quality','NOT_EVALUATED')
  item['routing_eligible']=bool(p.get('allow_worker') and p.get('benchmark_status')=='PASSED_TOOL_SMOKE' and item['specialty_quality']=='PASSED' and serving)
  candidates.append(item)
 # Owner order wins ties. Tool smoke is explicitly not a domain-quality benchmark.
 return candidates
