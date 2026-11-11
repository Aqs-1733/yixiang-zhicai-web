"""Public-source headline retrieval. Never turn static education text into today's news."""
import hashlib,json,re,threading,time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone,timedelta
from html import unescape
from urllib.parse import urljoin,urlparse
import httpx

GOV_FEED='https://www.gov.cn/pushinfo/v150203/pushinfo.jsonp'
PBC_FEED='https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html'
_lock=threading.Lock();_items=[];_fetched_at='';_last=0.0;_errors=[];_stale=True
SHANGHAI=timezone(timedelta(hours=8))

def _clean(value):return unescape(re.sub(r'<[^>]+>','',str(value or ''))).strip()
def _item(title,url,date,source,description=''):
    return {'id':'news-'+hashlib.sha256(url.encode()).hexdigest()[:16],'title':_clean(title),'url':url,'source':source,'time':date,'date':date,'published_at':date,'summary':_clean(description or title)[:180],'content':_clean(description or title)[:220],'content_kind':'publisher_headline','rights':'publisher_metadata_link_only'}
def _gov():
    r=httpx.get(GOV_FEED,timeout=httpx.Timeout(8,connect=4),follow_redirects=True);r.raise_for_status();s=r.text
    data=json.loads(s[s.index('['):s.rindex(']')+1]);selected=[]
    for x in data:
        title=_clean(x.get('title'));url=x.get('link','');date=str(x.get('pubDate',''))[:10]
        if not title or urlparse(url).hostname not in {'www.gov.cn','gov.cn'} or not re.fullmatch(r'20\d\d-\d\d-\d\d',date):continue
        if re.search('养老|社保|医保|退休|金融|财政|就业|银行|保险|消费|税收|民生|公积金',title):selected.append(_item(title,url,date,'中国政府网',x.get('description')))
    return selected
def _pbc():
    r=httpx.get(PBC_FEED,timeout=httpx.Timeout(8,connect=4),follow_redirects=True);r.raise_for_status();out=[]
    for href,attrs,body in re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\']([^>]*)>([\s\S]*?)</a>',r.text,re.I):
        match=re.search(r'/(20\d{6})\d*/index\.html',href)
        if not match:continue
        title_match=re.search(r'title=["\']([^"\']+)["\']',attrs);title=_clean(title_match.group(1) if title_match else body);url=urljoin(PBC_FEED,href);d=match.group(1);date=f'{d[:4]}-{d[4:6]}-{d[6:8]}'
        if title and urlparse(url).hostname in {'www.pbc.gov.cn','pbc.gov.cn'}:out.append(_item(title,url,date,'中国人民银行'))
    return out
def get_news(limit=8,force=False):
    global _last,_items,_fetched_at,_errors,_stale
    with _lock:
        if time.monotonic()-_last>600 or force and time.monotonic()-_last>20:
            results=[];errors=[]
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures=[(name,pool.submit(fn)) for name,fn in [('gov.cn',_gov),('pbc.gov.cn',_pbc)]]
                for name,f in futures:
                    try:results.extend(f.result())
                    except Exception:errors.append(name+' unavailable')
            today=datetime.now(SHANGHAI).date().isoformat();seen=set();valid=[]
            for x in sorted(results,key=lambda x:x['time'],reverse=True):
                if x['url'] not in seen and x['time']<=today:seen.add(x['url']);valid.append(x)
            if valid:_items=valid[:60];_fetched_at=datetime.now(SHANGHAI).isoformat(timespec='seconds')
            _last=time.monotonic();_errors=errors;_stale=not bool(valid)
        stale=_stale or bool(_items) and not _fetched_at.startswith(datetime.now(SHANGHAI).date().isoformat())
        return {'success':bool(_items),'items':_items[:max(1,min(limit,60))],'source':'public_official_feeds','real_time':bool(_items) and not stale,'fallback':False,'stale':bool(stale),'fetched_at':_fetched_at,'message':'已获取官方公开资讯' if _items else '暂未取得可核实的资讯，请稍后刷新','sources':[{'name':'中国政府网','url':GOV_FEED},{'name':'中国人民银行','url':PBC_FEED}],'errors':list(_errors)}
def find_article(identifier='',url=''):
    return next((x for x in get_news(60)['items'] if x['id']==identifier or url and x['url']==url),None)
def news_context():
    data=get_news(6)
    return {'kind':'retrieved_news','retrieved_at':data['fetched_at'],'stale':data['stale'],'items':[{k:x[k] for k in ['id','title','source','published_at','url','summary']} for x in data['items']]}
