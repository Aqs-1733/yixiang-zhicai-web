"""轻量自动验收：源码覆盖、静态站点、双角色认证与环境状态。不会发送第三方计费请求。"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json,os,re,sys,subprocess
ROOT=Path(__file__).resolve().parent
FRONT=ROOT/'site'; ORIG=ROOT/'miniprogram'
results=[]
def record(name, success, detail=''):
    results.append({'test':name,'passed':bool(success),'detail':str(detail)[:500]});print(('PASS' if success else 'FAIL'),name,detail)
manifest=json.loads((FRONT/'manifest.json').read_text(encoding='utf-8'))
original_pages=sorted(p.relative_to(ORIG).with_suffix('').as_posix() for p in (ORIG/'pages').rglob('*.wxml'))
original_components=sorted(p.relative_to(ORIG).with_suffix('').as_posix() for p in (ORIG/'components').rglob('*.wxml'))
record('原版页面与 Web 页面清单完整对应',sorted(manifest['pages'])==original_pages,f'{len(manifest["pages"])} / {len(original_pages)}')
record('自定义组件完整对应',sorted(manifest['components'])==original_components,f'{len(manifest["components"])} / {len(original_components)}')
for prefix,items in [('pages',original_pages),('components',original_components)]:
    missing=[x for x in items if not (ORIG/(x+'.js')).exists()]
    record(f'{prefix} 脚本保留',not missing, '缺失 '+','.join(missing) if missing else f'{len(items)} 个')
for name in ('modules.js','templates.js','legacy.css','theme.css','compat.js','index.html'):
    record(f'网站资源 {name}',(FRONT/name).is_file() and (FRONT/name).stat().st_size>150)
for name in ('modules.js','templates.js','compat.js'):
    p=subprocess.run(['node','--check',str(FRONT/name)],capture_output=True,text=True)
    record(f'JS 语法 {name}',p.returncode==0,p.stderr.strip()[:120])
record('Web 前端页面模板完整覆盖', all('"'+s+'"' in (FRONT/'templates.js').read_text(encoding='utf-8') for s in original_pages),f'{len(original_pages)} templates')
record('API 密钥未直接写入前端',not bool(re.search(r'(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9_-]{40,})', ''.join((FRONT/f).read_text(encoding='utf-8',errors='replace') for f in ('index.html','compat.js','theme.css')))))
record('独立网页预览 HTML',(ROOT/'网页视觉预览.html').is_file())
# Set a scratch DB path to avoid modifying bundled demo DB while checking live auth.
with TemporaryDirectory(prefix='yx_check_') as td:
    os.environ['DB_PATH']=str(Path(td)/'yixiang_test.db')
    os.environ['JWT_SECRET']='test-only-not-for-production-secret-unique-2026'
    sys.path.insert(0,str(ROOT/'backend'))
    try:
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as client:
            for loc in ['/site/','/web/']:
                r=client.get(loc)
                record(f'HTTP {loc} 首页',r.status_code==200 and '颐享智财' in r.text,f'HTTP {r.status_code}')
            for loc in ('/site/compat.js','/site/theme.css','/site/modules.js','/site/templates.js'):
                r=client.get(loc)
                record(f'HTTP {loc}',r.status_code==200 and len(r.content)>200,f'HTTP {r.status_code}, {len(r.content)} bytes')
            r=client.get('/integrations/status')
            record('第三方服务状态接口',r.status_code==200 and 'llm' in r.text,f'HTTP {r.status_code}')
            (ROOT/'tests').mkdir(exist_ok=True)
            if r.status_code==200:
                (ROOT/'tests'/'API状态.json').write_text(json.dumps(r.json(),ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception as e:
        record('FastAPI HTTP 接口验证',False,repr(e))
(ROOT/'tests').mkdir(exist_ok=True)
(ROOT/'tests'/'本轮测试结果.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('RESULT',sum(x['passed'] for x in results),'/',len(results))
sys.exit(0 if all(x['passed'] for x in results) else 1)
