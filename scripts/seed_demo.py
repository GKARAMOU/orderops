"""Explicit sample records for a local walkthrough, created through the real API."""
import json,urllib.request,os,uuid,csv,random
from pathlib import Path
from datetime import date,timedelta
root=Path(__file__).resolve().parents[1]
env=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if line and not line.startswith('#'))
url=os.environ.get('ORDEROPS_URL','http://127.0.0.1:8080')
token=None
def api(path,body=None,headers=None):
 h={'Content-Type':'application/json',**(headers or {})}
 if token:h['Authorization']='Bearer '+token
 req=urllib.request.Request(url+'/api'+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
 with urllib.request.urlopen(req) as r:return json.load(r)
token=api('/auth/login',{'email':env['ADMIN_EMAIL'],'password':env['ADMIN_PASSWORD']})['token']
if api('/products'):
 print('Workspace already has products. No sample records were added.');raise SystemExit()
warehouses=[api('/warehouses',{'name':name}) for name in ['Patras · Central','Athens · Distribution']]
products=[]
for sku,name,price,stock in [('OO-100','Wireless keyboard',49.9,120),('OO-200','USB-C docking station',89,65),('OO-300','Studio headphones',79.5,84),('OO-400','Laptop stand',32,150),('OO-500','Webcam HD',59,46),('OO-600','Desk light',42,98)]:
 p=api('/products',{'sku':sku,'name':name,'price':price});products.append(p)
 for w in warehouses:api('/inventory/adjust',{'productId':p['id'],'warehouseId':w['id'],'onHand':stock if w==warehouses[0] else stock//3,'reason':'Explicit synthetic walkthrough stock'})
for i,(name,q,status) in enumerate([('Example · Northline Retail',12,'RESERVED'),('Example · Studio Eight',8,'FULFILLED'),('Example · Atlas Supply',4,'RESERVED'),('Example · Horizon Office',10,'FULFILLED')]):
 o=api('/orders',{'customer':name,'warehouseId':warehouses[i%2]['id'],'items':[{'productId':products[i]['id'],'quantity':q}]},{'Idempotency-Key':str(uuid.uuid4())})
 if status=='FULFILLED':api('/orders/'+str(o['id'])+'/fulfill',{})
api('/purchases',{'supplier':'Example · Central Components','productId':products[2]['id'],'warehouseId':warehouses[0]['id'],'quantity':35})
random.seed(42);history=[]
for i in range(98):
 day=date.today()-timedelta(days=98-i)
 history.append({'day':str(day),'units':max(0,round(8+i*.035+(4 if day.weekday()<5 else -3)+random.gauss(0,1.3)))})
api('/forecast/history',{'productId':products[0]['id'],'warehouseId':warehouses[0]['id'],'source':'SYNTHETIC walkthrough data; not real business sales','days':history})
with (root/'docs/synthetic-sales-example.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['day','units'],lineterminator='\n');writer.writeheader();writer.writerows(history)
print('Created sample records through the API. The forecast source explicitly identifies synthetic data.')
