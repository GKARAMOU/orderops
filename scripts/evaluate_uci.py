"""Evaluate the checked-in, attributed daily series through the running forecast service."""
import csv,json,urllib.request,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with (root/'docs/uci-22423-daily.csv').open() as f: history=[{'day':r['day'],'units':int(r['units'])} for r in csv.DictReader(f)]
request=urllib.request.Request(os.environ.get('FORECAST_URL','http://127.0.0.1:8000')+'/predict',data=json.dumps({'history':history}).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=60) as r:result=json.load(r)
result['dataset']='UCI Online Retail, stock 22423; see DATA_SOURCES.md'
(root/'docs/forecast-evaluation.json').write_text(json.dumps(result,indent=2)+'\n')
print('Validation results:',json.dumps({k:result[k] for k in ['selectedModel','modelMae','baselineMae','trainingDays','holdoutDays']}))
