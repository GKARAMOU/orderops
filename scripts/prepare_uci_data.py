"""Derive one daily product series from UCI Online Retail (CC BY 4.0).
Requires openpyxl. Raw workbook stays in ignored .local/; no customer identifiers are exported.
"""
from pathlib import Path
from collections import defaultdict
from datetime import date,timedelta
import urllib.request,zipfile,csv,hashlib,json
import openpyxl
root=Path(__file__).resolve().parents[1];cache=root/'.local';cache.mkdir(exist_ok=True)
archive=cache/'uci-online-retail.zip'
if not archive.exists():urllib.request.urlretrieve('https://archive.ics.uci.edu/static/public/352/online+retail.zip',archive)
with zipfile.ZipFile(archive) as z:
 with z.open('Online Retail.xlsx') as f:
  book=openpyxl.load_workbook(f,read_only=True,data_only=True)
  counts=defaultdict(int);scanned=0;kept=0
  for row in book.active.iter_rows(min_row=2,values_only=True):
   scanned+=1;invoice,sku,description,quantity,day,price,customer,country=row
   if str(sku)=='22423' and quantity and quantity>0 and price and price>0 and not str(invoice).upper().startswith('C'):
    counts[day.date()]+=int(quantity);kept+=1
  book.close()
start=date(2010,12,1);end=date(2011,12,9);out=root/'docs/uci-22423-daily.csv'
with out.open('w',newline='') as f:
 w=csv.writer(f);w.writerow(['day','units'])
 day=start
 while day<=end:w.writerow([str(day),counts[day]]);day+=timedelta(days=1)
(root/'docs/uci-provenance.json').write_text(json.dumps({'source':'Chen, D. (2015). Online Retail. UCI Machine Learning Repository. https://doi.org/10.24432/C5BW33','license':'CC BY 4.0','stockCode':'22423','description':'REGENCY CAKESTAND 3 TIER','rawRowsScanned':scanned,'rowsRetained':kept,'dailyObservations':(end-start).days+1,'transformations':'Keep positive quantity and positive price, exclude cancellation invoices; aggregate all countries by day, fill no-sales dates with zero. Gross sales units, not uncensored demand. No customer identifiers exported.','rawZipSha256':hashlib.sha256(archive.read_bytes()).hexdigest()},indent=2)+'\n')
print('Wrote',out,'from',scanned,'source rows;',kept,'retained.')
