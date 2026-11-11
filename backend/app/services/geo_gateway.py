"""WGS84 -> GCJ02 and real walking routes; all credentials remain server-side."""
import os,re
import httpx
from fastapi import HTTPException

def _key():
    key=(os.getenv('TENCENT_MAP_KEY') or os.getenv('QQ_MAP_KEY') or os.getenv('MAP_API_KEY') or '').strip().strip('"').strip("'")
    if not key:raise HTTPException(503,detail='地图服务尚未配置，请使用手动地址选点')
    return key
def _get(path,params):
    try:
        r=httpx.get('https://apis.map.qq.com/ws/'+path,params={**params,'key':_key()},timeout=12);r.raise_for_status();body=r.json()
        if int(body.get('status',-1))!=0:raise HTTPException(502,detail='地图服务暂未返回有效结果，请稍后重试')
        return body
    except HTTPException:raise
    except Exception:raise HTTPException(502,detail='地图连接暂时失败，请稍后重试') from None
def convert(latitude,longitude):
    body=_get('coord/v1/translate',{'locations':f'{latitude},{longitude}','type':1});p=(body.get('locations') or [None])[0]
    if not p:raise HTTPException(502,detail='定位坐标转换失败')
    return {'latitude':float(p['lat']),'longitude':float(p['lng']),'coordinate_system':'gcj02','source':'tencent_coordinate_translate'}
def walking(start_latitude,start_longitude,latitude,longitude):
    body=_get('direction/v1/walking/',{'from':f'{start_latitude},{start_longitude}','to':f'{latitude},{longitude}'})
    route=((body.get('result') or {}).get('routes') or [None])[0]
    if not route:raise HTTPException(404,detail='没有查询到可用步行路线')
    compressed=route.get('polyline') or [];points=list(compressed)
    for i in range(2,len(points)):points[i]=points[i-2]+points[i]/1e6
    steps=[{'instruction':re.sub('<[^>]+>','',str(x.get('instruction') or '')),'distance':x.get('distance',0),'road_name':x.get('road_name','')} for x in route.get('steps',[])][:80]
    return {'success':True,'source':'tencent_directions','coordinate_system':'gcj02','distance':route.get('distance',0),'duration':route.get('duration',0),'steps':steps,'polyline':[[points[i],points[i+1]] for i in range(0,len(points)-1,2)],'start':{'latitude':start_latitude,'longitude':start_longitude},'destination':{'latitude':latitude,'longitude':longitude}}
