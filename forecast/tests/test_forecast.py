from datetime import date,timedelta
from fastapi.testclient import TestClient
from app import app
client=TestClient(app)
def history(n=84):return [{'day':str(date.today()-timedelta(days=n-i)), 'units':10+i%7} for i in range(n)]
def test_real_evaluation_and_horizon():
 r=client.post('/predict',json={'history':history()});assert r.status_code==200
 d=r.json();assert len(d['forecast'])==7;assert d['holdoutDays']==14;assert d['baselineMae']==0;assert d['selectedModel']=='seasonal_naive';assert all(x['units']>=0 for x in d['forecast'])
def test_gaps_rejected():
 h=history();h.pop(20);assert client.post('/predict',json={'history':h}).status_code==422
def test_duplicate_rejected():
 h=history();h[5]=h[4];assert client.post('/predict',json={'history':h}).status_code==422
def test_insufficient_history():assert client.post('/predict',json={'history':history(10)}).status_code==422
def test_zero_demand():
 h=history();[o.update(units=0) for o in h];r=client.post('/predict',json={'history':h});assert r.status_code==200;assert all(p['units']==0 for p in r.json()['forecast'])
