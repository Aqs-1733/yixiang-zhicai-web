"""Resize every original route; separately check text/art intersections and chat reachability."""
import os,json,sys,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ['YX_EVIDENCE_DIR']);a=argparse.ArgumentParser();a.add_argument('--phase',default='modified');a.add_argument('--url',default='http://127.0.0.1:8001/site/');a.add_argument('--quick',action='store_true');args=a.parse_args();F=json.loads((OUT/('baseline_fixtures.json' if args.phase in ['baseline','rollback'] else 'ui_fixtures.json')).read_text(encoding='utf-8'));routes=json.loads((ROOT/'site/manifest.json').read_text(encoding='utf-8'))['pages'];rows=[]
widths=[(1734,1140),(1440,1000),(1156,760),(960,900),(768,1024),(650,900),(390,844),(320,640)];fonts=['normal','large','xlarge']
if args.quick:widths=[(1734,1140),(390,844)];fonts=['xlarge']
JS=r'''()=>{const root=document.querySelector('#yx-render'),host=root.firstElementChild,main=document.querySelector('#main-scroll'),bad=[],rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}},overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
const rootBox=rect(root),hostBox=rect(host);if(hostBox.w<rootBox.w*.94)bad.push({type:'fixed_mobile_canvas',root:rootBox.w,host:hostBox.w});if(main.scrollWidth>main.clientWidth+2||document.documentElement.scrollWidth>innerWidth+2)bad.push({type:'page_horizontal_overflow',scroll:main.scrollWidth,client:main.clientWidth});
for(const card of root.querySelectorAll('.module-welcome,.top-card')){const image=card.querySelector('.profile-senior-art')||card.querySelector(':scope>img');if(!image||getComputedStyle(image).display==='none')continue;const ib=rect(image);for(const text of card.querySelectorAll('h1,h2,h3,.nick-input,.nick-hint,.module-welcome>div>span')){if(getComputedStyle(text).display==='none')continue;const tb=rect(text);if(overlap(tb,ib))bad.push({type:'text_art_overlap',text:text.textContent?.trim().slice(0,40)||text.value,textBox:tb,imageBox:ib})}}
if(YX.route()==='pages/family-group-chat/family-group-chat'){const layer=root.querySelector('.group-layer'),bar=root.querySelector('.group-input-bar'),back=root.querySelector('.back-btn'),list=root.querySelector('.group-list');if(rect(layer).w<rootBox.w*.94)bad.push({type:'chat_width',width:rect(layer).w,root:rootBox.w});if(getComputedStyle(host).overflow==='hidden'&&host.scrollHeight>host.clientHeight+2)bad.push({type:'clipped_chat_page',scroll:host.scrollHeight,client:host.clientHeight});bar.scrollIntoView({block:'nearest'});const bb=rect(bar),mb=rect(main);if(bb.y<mb.y-1||bb.bottom>Math.min(mb.bottom,innerHeight)+1)bad.push({type:'composer_unreachable',bar:bb,main:mb});if(getComputedStyle(list).overflowY!=='auto'&&getComputedStyle(list).overflowY!=='scroll')bad.push({type:'messages_not_scrollable'});for(const e of bar.querySelectorAll('button,input,[role=button]')){const b=rect(e);if(b.w<2||b.h<2||b.x<bb.x-1||b.right>bb.right+1)bad.push({type:'composer_control_outside',class:e.className,box:b})}}
return {passed:bad.length===0,issues:bad,hostWidth:hostBox.w,rootWidth:rootBox.w};}'''
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);ctx=b.new_context(viewport={'width':1440,'height':1000});p=ctx.new_page();p.set_default_timeout(15000);p.goto(args.url);p.wait_for_function('window.YX&&YX.getPage()')
 for route in routes:
  f=F['子女' if route.startswith('pages/child/') else '长辈'];p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("rememberLoginUntil",0);wx.setStorageSync("role",f.user.role);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role});getApp()._familyUnreadPrompted=true}',f);p.evaluate('r=>YX.goto(r,"relaunch")',route+('?elder_id='+str(F['meta']['elder_id']) if route.startswith('pages/child/') else ''));p.wait_for_timeout(240)
  for width,height in widths:
   p.set_viewport_size({'width':width,'height':height})
   for font in fonts:
    p.evaluate('mode=>{let n=0;while(getApp().getGlobalFontSetting().mode!==mode&&n++<4)getApp().cycleGlobalFontSize();YX.getPage().syncGlobalFont?.();document.documentElement.dataset.font=mode}',font);p.wait_for_timeout(95)
    if p.locator('#dialog-overlay').is_visible():p.locator('#dialog-okay').click()
    state=p.evaluate(JS);state.update(route=route,width=width,height=height,font=font);rows.append(state)
    if width in [1440,390] and font=='xlarge':
     p.locator('#main-scroll').evaluate('e=>e.scrollTop=0');p.evaluate('Promise.all([...document.querySelectorAll("#yx-render img")].filter(i=>i.offsetWidth>0).map(i=>i.decode().catch(()=>null)))');p.screenshot(path=str(OUT/(args.phase+'_'+route.replace('/','_')+'_'+str(width)+'.png')),animations='disabled')
  (OUT/(args.phase+'_responsive.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print(route,sum(x['passed'] for x in rows if x['route']==route),'/',sum(x['route']==route for x in rows),flush=True)
 b.close()
print(args.phase.upper()+'_RESPONSIVE',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
