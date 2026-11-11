"""Authenticated, bounded static-map adapter. Provider keys never reach the browser."""
import os
import threading
import time
from collections import OrderedDict
import httpx
from fastapi import HTTPException
from fastapi.responses import Response

_cache = OrderedDict()
_lock = threading.Lock()

def static_map(latitude: float, longitude: float, zoom: int, width: int, height: int):
    key = (os.getenv('TENCENT_MAP_KEY') or os.getenv('QQ_MAP_KEY') or os.getenv('MAP_API_KEY') or '').strip().strip('"').strip("'")
    if not key:
        raise HTTPException(503, detail='地图服务尚未配置')
    identity = (round(latitude, 6), round(longitude, 6), zoom, width, height)
    with _lock:
        cached = _cache.get(identity)
        if cached and time.monotonic() - cached[0] < 600:
            _cache.move_to_end(identity)
            return Response(cached[1], media_type=cached[2], headers={'Cache-Control': 'private, max-age=600'})
    try:
        response = httpx.get('https://apis.map.qq.com/ws/staticmap/v2/', params={
            'key': key, 'center': f'{latitude},{longitude}', 'zoom': zoom,
            'size': f'{width}*{height}', 'format': 'png', 'scale': 1,
        }, timeout=12)
        response.raise_for_status()
        media = response.headers.get('content-type', '').split(';')[0]
        if media not in ('image/png', 'image/jpeg', 'image/gif') or len(response.content) > 8_000_000:
            raise ValueError('invalid map response')
    except Exception:
        raise HTTPException(502, detail='地图暂时未加载，请稍后重试') from None
    with _lock:
        _cache[identity] = (time.monotonic(), response.content, media)
        while len(_cache) > 80:
            _cache.popitem(last=False)
    return Response(response.content, media_type=media, headers={'Cache-Control': 'private, max-age=600'})
