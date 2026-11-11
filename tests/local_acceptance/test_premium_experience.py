"""Real media + responsive pattern/motion checks, using synthetic test accounts."""
import os,json,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));rows=[]
def record(name,ok,**extra):rows.append({'test':name,'passed':bool(ok),**extra});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
def inject(page,actor='长辈'):page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);wx.setStorageSync("rememberLoginUntil",Date.now()+1800000);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role})}',F[actor])
def go(page,path):
 page.evaluate('p=>YX.goto(p,"relaunch")',path);page.wait_for_timeout(650)
 if page.locator('#dialog-overlay').is_visible() and page.locator('#dialog-title').inner_text()=='家人发来新消息':page.locator('#dialog-okay').click()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--autoplay-policy=no-user-gesture-required'])
 context=b.new_context(viewport={'width':1440,'height':1050});page=context.new_page();page.set_default_timeout(12000);page.goto('http://127.0.0.1:8001/site/');page.wait_for_function('window.YX&&YX.getPage()');inject(page)
 for width,height in [(1440,1050),(768,1024),(390,844)]:
  page.set_viewport_size({'width':width,'height':height})
  for name,path in [('home','pages/index/index'),('finance','pages/finance/finance'),('ledger','pages/money/money'),('family','pages/family/family'),('health','pages/health/health'),('profile','pages/profile/profile'),('service','pages/service/service'),('child','pages/child/index/index')]:
   inject(page,'子女' if name=='child' else '长辈');go(page,path)
   state=page.evaluate('''()=>({patterns:[...new Set([...document.querySelectorAll('#yx-render [data-pattern]')].map(x=>x.dataset.pattern))],overflow:document.documentElement.scrollWidth>innerWidth+1,mainOverflow:document.querySelector('#main-scroll').scrollWidth>document.querySelector('#main-scroll').clientWidth+2,errors:YX.errors()})''')
   record(f'{width} {name} 区块与布局',bool(state['patterns']) and not state['overflow'] and not state['mainOverflow'] and not state['errors'],**state)
   page.screenshot(path=str(OUT/f'premium_{width}_{name}.png'),animations='disabled',timeout=20000)
 # Actual local media, not a dispatched play event.
 inject(page);page.set_viewport_size({'width':1440,'height':1050});go(page,'pages/index/index')
 try:
  page.wait_for_function('document.querySelector("#homeLessonVideo")?.readyState>=1');video=page.locator('#homeLessonVideo');video.evaluate('v=>{v.muted=true;return v.play()}');page.wait_for_function('document.querySelector("#homeLessonVideo").currentTime>1.0',timeout=15000)
  record('本地课程真实解码播放',video.evaluate('v=>v.videoWidth===1280&&v.videoHeight===720&&v.duration>60'))
  video.evaluate('v=>{window.__sameVideo=v;v.currentTime=15}');page.wait_for_timeout(250);record('课程进度和重绘保持',page.evaluate('window.__sameVideo===document.querySelector("#homeLessonVideo")&&YX.getPage().data.lessonCurrentTime>14'))
  video.evaluate('v=>v.pause()');page.wait_for_timeout(150);record('课程暂停回写原版状态',page.evaluate('YX.getPage().data.lessonVideoPlaying===false'))
 except Exception as e:record('本地课程播放流程',False,error=str(e)[:400])
 try:
  page.evaluate('()=>{window.__nativeCanPlay=HTMLMediaElement.prototype.canPlayType;HTMLMediaElement.prototype.canPlayType=function(t){return t==="application/vnd.apple.mpegurl"?"":window.__nativeCanPlay.call(this,t)}}');page.locator('.lesson-picker-open').click();page.wait_for_timeout(150)
  # First remote original episode follows the local fallback in the original picker.
  candidates=page.locator('[data-index="1"]').filter(has_text='投资方式')
  if not candidates.count():candidates=page.locator('.lesson-picker-item').nth(1)
  candidates.first.click();page.wait_for_timeout(200);video=page.locator('#homeLessonVideo');video.evaluate('v=>{v.muted=true;return v.play()}')
  page.wait_for_function('document.querySelector("#homeLessonVideo")?.currentTime>1',timeout=40000)
  state=video.evaluate('v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,hls:!!v.__yxMedia?.hls,source:v.dataset.yxSource})');record('原版HLS课程真实播放',state['hls'] and state['width']>0 and state['duration']>30,**state)
  video.evaluate('v=>{v.pause();v.currentTime=30}');page.wait_for_function('YX.getPage().data.lessonCurrentTime>=29',timeout=15000);record('HLS进度与暂停',True)
  page.screenshot(path=str(OUT/'actual_hls_playback.png'),animations='disabled')
 except Exception as e:record('原版HLS播放流程',False,error=str(e)[:600])
 # Animated tabs retain original click handlers and real mode state.
 go(page,'pages/finance/finance');page.locator('[data-mode=learn]').click();page.wait_for_timeout(100);record('分段标签动效及原版切换',page.evaluate("YX.getPage().data.financeMode==='learn'") and page.locator('.pattern-active-indicator').count()>0)
 page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(120);record('减少动画立即停止',page.evaluate('YXMotion.reduced&&YXMotion.activeCount===0'))
 record('减少动画内容仍可见',page.locator('.advice-card').is_visible())
 b.close()
(OUT/'premium_experience_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('PREMIUM_EXPERIENCE',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
