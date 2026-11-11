"""All routes: three viewport widths x three font settings, real hit-test geometry."""
import os,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);ROOT=Path(__file__).resolve().parents[2];F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));routes=json.loads((ROOT/'site/manifest.json').read_text(encoding='utf-8'))['pages'];rows=[]
JS="""()=>{const main=document.querySelector('#main-scroll'),root=document.querySelector('#yx-render'),bad=[],seen=new Set();let count=0;
function check(){for(const e of root.querySelectorAll('button,input,textarea,select,[data-yx-action]')){if(e.disabled||e.hidden||e.closest('[hidden]')||e.getAttribute('aria-hidden')==='true')continue;const b=e.getBoundingClientRect(),s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||b.width<2||b.height<2)continue;let x=b.left+b.width/2,y=b.top+b.height/2;if(x<0||x>innerWidth||y<0||y>innerHeight)continue;let clipped=false;for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const ps=getComputedStyle(p),r=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(ps.overflowY)&& (y<r.top||y>r.bottom))clipped=true;}if(clipped)continue;count++;const top=document.elementFromPoint(x,y);if(top&&!e.contains(top)&&!top.contains(e)){const key=e.dataset.yxKey||e.className;if(!seen.has(key)){seen.add(key);bad.push({target:e.className,text:e.innerText.slice(0,45),blockedBy:top.className})}}}}
const scrolls=[main,...root.querySelectorAll('.yx-scroll')].filter(e=>e&&e.scrollHeight>e.clientHeight+10);check();for(const step of [.5,1]){for(const e of scrolls)e.scrollTop=step*(e.scrollHeight-e.clientHeight);check()}for(const e of scrolls)e.scrollTop=0;return {checked:count,blocked:bad,overflow:document.documentElement.scrollWidth>innerWidth+2}}
"""
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 for width,height in [(1440,1000),(960,900),(390,844)]:
  ctx=b.new_context(viewport={'width':width,'height':height});page=ctx.new_page();page.goto('http://127.0.0.1:8001/site/');page.wait_for_function('window.YX&&YX.getPage()')
  for font in ['normal','large','xlarge']:
   for route in routes:
    f=F['子女' if route.startswith('pages/child/') else '长辈'];page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role});getApp()._familyUnreadPrompted=true}',f)
    page.evaluate('x=>{wx.setStorageSync("globalFontMode",x.font);document.documentElement.dataset.font=x.font;YX.goto(x.route,"relaunch")}',{'font':font,'route':route+('?elder_id='+str(F['meta']['elder_id']) if route.startswith('pages/child/') else '')});page.wait_for_timeout(180)
    # Set the actual app preference via its public setter/cycler, not just a CSS label.
    page.evaluate('mode=>{let n=0;while(getApp().getGlobalFontSetting().mode!==mode&&n++<4)getApp().cycleGlobalFontSize();YX.getPage().syncGlobalFont?.();document.documentElement.dataset.font=mode}',font);page.wait_for_timeout(60)
    if page.locator('#dialog-overlay').is_visible():page.locator('#dialog-okay').click()
    state=page.evaluate(JS);row={'route':route,'width':width,'font':font,'passed':not state['blocked'] and not state['overflow'],**state};rows.append(row)
    if not row['passed']:print('FAIL',route,width,font,json.dumps(state,ensure_ascii=False),flush=True)
  ctx.close()
 b.close()
(OUT/'layout_targets_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('LAYOUT_TARGETS',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
