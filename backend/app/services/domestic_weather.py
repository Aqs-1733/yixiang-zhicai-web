"""Weather from the National Meteorological Center; no overseas fallback."""
from __future__ import annotations
import os,threading,time
from datetime import datetime,timedelta,timezone
from typing import Any
import httpx

_cache:dict[str,tuple[float,Any]]={}
_lock=threading.Lock()
NMC='https://www.nmc.cn'
SHANGHAI=timezone(timedelta(hours=8))

def _json(path:str,params=None,ttl=3600):
    key=path+repr(params)
    with _lock:
        cached=_cache.get(key)
        if cached and time.monotonic()-cached[0]<ttl:return cached[1]
    response=httpx.get(NMC+path,params=params,timeout=httpx.Timeout(10,connect=4))
    response.raise_for_status();data=response.json()
    with _lock:_cache[key]=(time.monotonic(),data)
    return data

def _simple(value):
    return str(value or '').replace('特别行政区','').replace('自治区','').replace('壮族','').replace('回族','').replace('维吾尔','').rstrip('省市区县')

def _station(city,latitude,longitude):
    common={'北京':'ABJ','天津':'ATJ','上海':'ASH','重庆':'ACQ'}
    name=_simple(city);province='';district=''
    code=next((v for k,v in common.items() if name.startswith(k)),None)
    if not code:
        key=(os.getenv('TENCENT_MAP_KEY') or os.getenv('QQ_MAP_KEY') or '').strip()
        if not key:raise ValueError('Select a city or configure Tencent location service')
        r=httpx.get('https://apis.map.qq.com/ws/geocoder/v1/',params={'location':f'{latitude},{longitude}','key':key},timeout=10)
        r.raise_for_status();body=r.json()
        if body.get('status')!=0:raise ValueError('City lookup failed')
        address=(body.get('result') or {}).get('address_component') or {}
        province=address.get('province','');name=_simple(address.get('city') or city);district=_simple(address.get('district'))
        provinces=_json('/rest/province/all',ttl=86400)
        code=next((p['code'] for p in provinces if _simple(p['name'])==_simple(province)),None)
    if not code:raise ValueError('No domestic weather station matched')
    stations=_json('/rest/province/'+code,ttl=86400)
    station=next((s for s in stations if _simple(s['city'])==district),None) if district else None
    station=station or next((s for s in stations if _simple(s['city'])==name),None)
    if not station:raise ValueError('No weather station matched the requested city')
    return station

def get_weather(city,latitude,longitude):
    station=_station(city,latitude,longitude)
    payload=_json('/rest/weather',{'stationid':station['code']},ttl=600)
    data=payload.get('data') or {};real=data.get('real') or {};weather=real.get('weather') or {};wind=real.get('wind') or {}
    temp=weather.get('temperature');published=real.get('publish_time','')
    if temp is None or not -60<=float(temp)<=60:raise ValueError('Invalid observation')
    stamp=datetime.strptime(published,'%Y-%m-%d %H:%M').replace(tzinfo=SHANGHAI)
    age=datetime.now(SHANGHAI)-stamp
    if age>timedelta(hours=6) or age<timedelta(minutes=-20):raise ValueError('Stale weather observation')
    condition=str(weather.get('info') or '')
    if condition in {'-','9999',''}:
        details=(data.get('predict') or {}).get('detail') or []
        today=next((d for d in details if d.get('date')==datetime.now(SHANGHAI).date().isoformat()),{})
        part=today.get('night' if datetime.now(SHANGHAI).hour>=18 else 'day') or {}
        condition=str((part.get('weather') or {}).get('info') or '')
        if condition in {'9999','-'}:condition=''
    text=f'{float(temp):g}℃';humidity=weather.get('humidity')
    return {'ok':True,'success':True,'city':station['city'],'weather':condition or '天气实况','temperature':text,'temp':text,'wind':' '.join(str(wind.get(k) or '') for k in ['direct','power']).strip(),'humidity':f'{humidity:g}%' if isinstance(humidity,(int,float)) and 0<=humidity<=100 else '', 'update_time':published,'source':'real','provider':'nmc','source_url':NMC+station['url'],'source_label':'中央气象台','data_kind':'observed_temperature_with_daily_forecast'}
