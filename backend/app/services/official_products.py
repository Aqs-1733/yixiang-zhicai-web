"""Latest public bank disclosures, with dates, exact codes and a shared MySQL cache.

This is daily disclosed NAV data, not an intraday quotation or a product licence check.
"""
from __future__ import annotations
import copy,json,threading,time,re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,date,timedelta,timezone
from decimal import Decimal,InvalidOperation
import httpx
from bs4 import BeautifulSoup
from app.database import conn

SOURCE='https://www.boc.cn/sourcedb/srfd6_2024/'
LABEL='中国银行公开代销净值'
CACHE_KEY='official:boc:nav:v1'
TZ=timezone(timedelta(hours=8))
_cache=None;_expires=0.;_lock=threading.Lock();_last_attempt=0.

def numeric(text):
 try:
  value=Decimal(str(text).strip().replace(',',''))
  return str(value) if value.is_finite() else None
 except (InvalidOperation,ValueError):return None

def parse_page(html,source_url=SOURCE):
 soup=BeautifulSoup(html,'html.parser');items=[]
 for row in soup.find_all('tr'):
  cells=[c.get_text(' ',strip=True) for c in row.find_all('td',recursive=False)]
  if len(cells)!=8:continue
  code,name,nav,cumulative,per_ten_thousand,metric,day_change,stamp=cells
  if not re.fullmatch(r'[A-Za-z0-9_-]{3,64}',code) or not name or not re.fullmatch(r'\d{4}/\d{2}/\d{2}.*',stamp):continue
  try:asof=datetime.strptime(stamp[:10],'%Y/%m/%d').date()
  except ValueError:continue
  value=numeric(nav)
  if value is None or Decimal(value)<=0 or asof>datetime.now(TZ).date():continue
  # Unknown risk/eligibility/registration information stays unknown. Never infer PR1 from a name.
  items.append({'id':'boc-'+code,'product_code':code,'registration_code':'','name':name,'institution':'中国银行代销','risk':'该披露页未列风险等级','safe':False,'term':'以产品说明书为准','min_buy':'以销售文件为准','yield_rate':(metric+'%（披露指标）') if metric else '未披露','net_value':value,'unit_net_value':value,'cumulative_net_value':numeric(cumulative),'income_per_ten_thousand':numeric(per_ten_thousand),'disclosed_return_percent':numeric(metric),'daily_change_percent':numeric(day_change),'as_of_date':asof.isoformat(),'source':'boc_public_disclosure','source_label':LABEL,'source_url':source_url,'data_kind':'official_daily_disclosure','eligibility_note':'仅为披露记录，销售状态及适用客户以银行说明书为准。','desc':'单位净值按披露日期展示，历史收益不代表未来表现。'})
 return items

def _read_shared():
 try:
  with conn() as c:row=c.execute('SELECT info_json FROM product_info_cache WHERE query=?',(CACHE_KEY,)).fetchone()
  if row:
   value=row['info_json'];return json.loads(value) if isinstance(value,str) else value
 except Exception:pass
 return None

def _save_shared(payload):
 now=datetime.now(TZ);expires=now+timedelta(minutes=30)
 with conn() as c:
  c.execute('INSERT INTO product_info_cache(query,info_json,source,fetched_at,expires_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE info_json=VALUES(info_json),source=VALUES(source),fetched_at=VALUES(fetched_at),expires_at=VALUES(expires_at)',(CACHE_KEY,json.dumps(payload,ensure_ascii=False),'boc_public_disclosure',now.isoformat(),expires.isoformat()));c.commit()

def _fetch():
 urls=[SOURCE,SOURCE+'index_1.html',SOURCE+'index_2.html']
 def page(url):
  try:
   r=httpx.get(url,timeout=httpx.Timeout(10,connect=4),follow_redirects=False,headers={'User-Agent':'YixiangZhicai/1.0 (public financial disclosure reader)'})
   r.raise_for_status();return parse_page(r.content.decode('utf-8-sig'),url)
  except Exception:return []
 with ThreadPoolExecutor(max_workers=3) as pool:rows=[item for part in pool.map(page,urls) for item in part]
 unique={}
 for item in rows:
  code=item['product_code']
  if code not in unique or item['as_of_date']>unique[code]['as_of_date']:unique[code]=item
 items=sorted(unique.values(),key=lambda i:(i['as_of_date'],i['product_code']),reverse=True)
 if not items:raise ValueError('No valid bank disclosures returned')
 return {'success':True,'items':items,'source':'boc_public_disclosure','source_label':LABEL,'source_url':SOURCE,'real_time':False,'live_source':True,'data_kind':'official_daily_disclosure','fetched_at':datetime.now(TZ).isoformat(timespec='seconds'),'latest_date':max(i['as_of_date'] for i in items),'coverage':'中国银行官网最近三页、具备名称与有效净值的公开披露记录','refresh_interval_seconds':1800,'time_policy':'按银行披露更新，不是盘中报价。'}

def catalogue(refresh=False):
 global _cache,_expires,_last_attempt
 if _cache is None:
  _cache=_read_shared()
  if _cache:
   try:_expires=datetime.fromisoformat(_cache['fetched_at']).timestamp()+1800
   except Exception:_expires=0
 if _cache and not refresh and time.time()<_expires:return _view(_cache)
 if _lock.acquire(blocking=False):
  try:
   if time.monotonic()-_last_attempt>=30:
    _last_attempt=time.monotonic();fresh=_fetch();_save_shared(fresh);_cache=fresh;_expires=time.time()+1800
  except Exception:
   if _cache:return _view(_cache,failed=True)
  finally:_lock.release()
 if _cache:return _view(_cache)
 return {'success':False,'items':[],'source':'unavailable','real_time':False,'live_source':False,'stale':True,'message':'暂未取得银行净值披露，请稍后刷新。','source_url':SOURCE,'source_label':LABEL}

def _view(payload,failed=False):
 result=copy.deepcopy(payload)
 try:age=(datetime.now(TZ).date()-date.fromisoformat(result['latest_date'])).days
 except Exception:age=999
 result['stale']=failed or time.time()>_expires or age>7
 result['from_cache']=time.time()>_expires
 if failed:result['message']='本次更新未成功，显示上次披露记录。'
 return result

def exact_quote(code,refresh=False):
 text=str(code or '').strip().upper()
 return next((x for x in catalogue(refresh)['items'] if x['product_code'].upper()==text),None)
