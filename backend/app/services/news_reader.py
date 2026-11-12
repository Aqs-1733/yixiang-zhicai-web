"""Read bounded excerpts from registered official news URLs, never arbitrary URLs."""
import json,threading,time
from pathlib import Path
from urllib.parse import urlparse,urljoin
import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException
from app.services import live_news

STORE=Path(__file__).resolve().parents[2]/'data'/'public_news_cache.json'
_lock=threading.RLock();_archive={};_bodies={}
HOSTS={'www.gov.cn','gov.cn','www.pbc.gov.cn','pbc.gov.cn'}

def _allowed(url):
    p=urlparse(url)
    return p.scheme=='https' and p.hostname in HOSTS and p.port in (None,443) and not p.username

def _load():
    try:
        data=json.loads(STORE.read_text(encoding='utf-8'))
        _archive.update({k:v for k,v in data.get('articles',{}).items() if _allowed(v.get('url',''))})
        _bodies.update({k:v for k,v in data.get('bodies',{}).items() if k in _archive})
    except (OSError,ValueError,TypeError):pass

def _save():
    try:
        STORE.parent.mkdir(parents=True,exist_ok=True)
        temp=STORE.with_suffix('.tmp');temp.write_text(json.dumps({'articles':_archive,'bodies':_bodies},ensure_ascii=False),encoding='utf-8');temp.replace(STORE)
    except OSError:pass

def remember(items):
    with _lock:
        for item in items:
            if _allowed(item.get('url','')):_archive[item['id']]=dict(item)
        while len(_archive)>500:
            key=next(iter(_archive));_archive.pop(key,None);_bodies.pop(key,None)
        _save()

def lookup(identifier='',url=''):
    item=live_news.find_article(identifier,url)
    if item:remember([item]);return item
    with _lock:return next((dict(v) for k,v in _archive.items() if k==identifier or url and v['url']==url),None)

def read(identifier='',url=''):
    item=lookup(identifier,url)
    if not item:raise HTTPException(404,detail='该资讯暂未找到，请返回资讯列表重新选择')
    with _lock:
        cached=_bodies.get(item['id'])
        if cached:return {**cached,'cached':True}
    try:
        target=item['url']
        with httpx.Client(timeout=httpx.Timeout(12,connect=5),follow_redirects=False) as client:
            for _ in range(4):
                if not _allowed(target):raise ValueError('unregistered redirect')
                response=client.get(target)
                if response.is_redirect:target=urljoin(target,response.headers.get('location',''));continue
                response.raise_for_status();break
            else:raise ValueError('redirect limit')
        if len(response.content)>3_000_000:raise ValueError('article size')
        soup=BeautifulSoup(response.content,'html.parser')
        for node in soup(['script','style','nav','noscript','iframe']):node.decompose()
        candidates=soup.select('#UCAP-CONTENT,#zoom,.TRS_Editor,.TRS_PreAppend,.article-content,.content')
        if not candidates:raise ValueError('article body unavailable')
        body=max(candidates,key=lambda n:len(n.get_text(' ',strip=True)))
        paragraphs=[];length=0;truncated=False
        nodes=body.find_all(['p','h2','h3']) or [body]
        for node in nodes:
            text=' '.join(node.get_text(' ',strip=True).split())
            if not text or text in paragraphs or text==item['title']:continue
            if length+len(text)>900:text=text[:max(0,900-length)];truncated=True
            if text:paragraphs.append(text);length+=len(text)
            if length>=900 or len(paragraphs)>=8:truncated=True;break
        if not paragraphs:paragraphs=[item['summary']]
        result={**item,'ok':True,'paragraphs':paragraphs,'content_kind':'official_excerpt','truncated':truncated,'fetched_at':time.strftime('%Y-%m-%dT%H:%M:%S'),'cached':False}
        with _lock:_bodies[item['id']]=result;_save()
        return result
    except Exception:
        # A visible source and headline remain useful; never pretend this is a full body.
        return {**item,'ok':True,'paragraphs':[item['summary']],'content_kind':'publisher_headline','truncated':False,'reader_message':'正文暂未读取成功，可点击原文阅读官方发布内容。','cached':False}

_load()
