"""Edge/Playwright UI acceptance. Uses only synthetic accounts from the isolated HTTP suite."""
import json,os,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.getenv('YX_EVIDENCE_DIR',r'D:\Projects\YixiangZhicai_Execution_20261111'))
ROOT=Path(__file__).resolve().parents[2]; SHOTS=ROOT/'tests/local_acceptance';SHOTS.mkdir(exist_ok=True)
F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));M=json.loads((ROOT/'site/manifest.json').read_text(encoding='utf-8'))
URL='http://127.0.0.1:8001/site/';results=[];audit=[]
def record(name,ok,**extra):
 results.append({'test':name,'passed':bool(ok),**extra});print(('PASS' if ok else 'FAIL'),name,extra,flush=True)
 (OUT/'ui_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
def inject(page,actor):
 page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role});}',F[actor])
def ready(page):
 page.set_default_timeout(9000);page.goto(URL,wait_until='domcontentloaded');page.wait_for_function('window.YX && YX.getPage()')
def shot(page,name):
 page.screenshot(path=str(SHOTS/(name+'.png')),animations='disabled',timeout=12000)
def act(name,fn):
 try:fn()
 except Exception as e:record(name,False,error=type(e).__name__)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();ready(page)
 for actor in ['长辈','子女']:
  page.evaluate("wx.clearStorageSync();getApp().globalData.token='';YX.goto('pages/login/login','relaunch')")
  if actor=='子女':page.locator('[data-role="child"]').click()
  page.locator('[data-k="phone"]').fill(F[actor]['phone']);page.wait_for_timeout(80)
  page.locator('[data-k="password"]').fill(F[actor]['password']);page.wait_for_timeout(80)
  page.get_by_text('手机号登录',exact=True).click()
  try:
   page.wait_for_function('YX.getPage().data.showLoginSuccess===true',timeout=9000)
   record(actor+'浏览器表单登录',page.evaluate('wx.getStorageSync("role")')==F[actor]['user']['role'])
   shot(page,'login_'+F[actor]['user']['role'])
   page.get_by_text('进入颐享智财',exact=True).click();page.wait_for_timeout(450)
   record(actor+'登录后导航',page.evaluate('YX.route()')==('pages/child/index/index' if actor=='子女' else 'pages/index/index'))
   if page.locator('#dialog-overlay').is_visible() and page.locator('#dialog-title').inner_text()=='家人发来新消息':page.locator('#dialog-okay').click()
   page.locator('#logout-top').click();record(actor+'退出登录',not page.evaluate('wx.getStorageSync("token")') and page.evaluate('YX.route()')=='pages/login/login')
  except Exception as e:record(actor+'浏览器登录流程',False,error=type(e).__name__)
 ctx.close()
 # All original routes, three requested viewport widths. Rendering != full interaction acceptance.
 for width,height in [(1440,1000),(768,1024),(390,844)]:
  ctx=b.new_context(viewport={'width':width,'height':height},geolocation={'latitude':39.0851,'longitude':117.1994})
  page=ctx.new_page();ready(page)
  for i,path in enumerate(M['pages']):
   actor='子女' if path.startswith('pages/child/') else '长辈';inject(page,actor)
   params='?elder_id='+str(F['meta']['elder_id']) if path.startswith('pages/child/') else ''
   if path=='pages/security-question/security-question':params='?phone='+F['长辈']['phone']
   try:
    page.evaluate('sessionStorage.removeItem("yx_errors")');page.evaluate('(path)=>YX.goto(path,"relaunch")',path+params);page.wait_for_timeout(300)
    state=page.evaluate('''()=>({route:YX.route(),text:document.querySelector('#yx-render').innerText.length,errors:YX.errors().length,overflow:document.documentElement.scrollWidth>innerWidth+1,mainOverflow:document.querySelector('#main-scroll').scrollWidth>document.querySelector('#main-scroll').clientWidth+2,broken:[...document.querySelectorAll('#yx-render img')].filter(x=>x.complete&&!x.naturalWidth).length})''')
    record(str(width)+' 路由 '+path,state['route']==path and state['text']>5 and state['errors']==0,viewport=width,**state)
    record(str(width)+' 整页无横溢 '+path,not state['overflow'],route=path,viewport=width)
    shot(page,f'{width}_{i+1:02d}_{path.replace("pages/","").replace("/","_")}')
    audit.append({'route':path,'viewport':width,**state})
   except Exception as e:record(str(width)+' 页面 '+path,False,error=type(e).__name__)
  ctx.close()
 # Targeted actual controls, local-only AI path.
 ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();ready(page);inject(page,'长辈')
 def family():
  page.evaluate("YX.goto('pages/family/family','relaunch')");page.wait_for_timeout(350);record('长辈家庭页不自动跳转',page.evaluate('YX.route()')=='pages/family/family')
  page.get_by_text('家庭账本',exact=True).click();page.wait_for_timeout(300);record('长辈家庭账本入口',page.evaluate('YX.route()')=='pages/money/money' and page.evaluate('YX.getPage().data.ledgerScope')=='family')
  page.evaluate("YX.goto('pages/family/family','relaunch')");page.wait_for_timeout(250);page.get_by_text('家庭留言',exact=True).first.click();page.wait_for_timeout(250);record('长辈家庭留言入口',page.evaluate('YX.route()')=='pages/family-messages/family-messages')
  page.evaluate("YX.goto('pages/family/family','relaunch')");page.wait_for_timeout(250);page.get_by_text('家庭群聊',exact=True).first.click();page.wait_for_timeout(250);record('长辈家庭群聊入口',page.evaluate('YX.route()')=='pages/family-group-chat/family-group-chat')
 act('家庭入口交互',family)
 def dialog():
  page.evaluate("void wx.showModal({title:'备注测试',editable:true,placeholderText:'家人备注',success:r=>window.__dialogResult=r})")
  page.locator('#dialog-input').fill('测试备注');page.locator('#dialog-okay').click();record('可编辑弹窗返回输入',page.evaluate('window.__dialogResult.content')=='测试备注')
  page.evaluate("void wx.showModal({title:'关闭测试',content:'取消不会提交',success:r=>window.__dialogResult=r})");page.locator('#dialog-cancel').click();record('弹窗取消关闭',page.evaluate('window.__dialogResult.cancel') and page.locator('#dialog-overlay').is_hidden())
 act('弹窗交互',dialog)
 def fonts():
  before=page.evaluate('getApp().getGlobalFontSetting().mode');page.locator('#font-change').click();page.wait_for_timeout(100);after=page.evaluate('getApp().getGlobalFontSetting().mode');record('全局字号切换',before!=after)
 act('字号交互',fonts)
 def chat():
  page.evaluate("YX.goto('pages/assistant/assistant','relaunch')");page.wait_for_timeout(250)
  if page.locator('.ask-input-v2').count()==0:page.locator('.mode-switch-btn').first.click()
  page.locator('.ask-input-v2').fill('你好，这是本地验收。');page.wait_for_timeout(90);page.locator('.send-btn-v2').click();page.wait_for_timeout(600)
  record('问小享文字发送本地链路', '你好，这是本地验收。' in page.locator('#yx-render').inner_text())
  page.get_by_text('记录',exact=True).click();page.wait_for_timeout(150);record('问小享会话历史弹层',page.locator('.history-close').is_visible());page.locator('.history-close').click();shot(page,'interaction_chat_local_fallback')
  before=page.evaluate('YX.getPage().data.autoSpeak');page.locator('.auto-speak-toggle').first.click();page.wait_for_timeout(100);record('自动播报开关',before!=page.evaluate('YX.getPage().data.autoSpeak'))
 act('问小享交互',chat)
 def permissions():
  status=page.evaluate('''async()=>{let r=await new Promise(resolve=>wx.getSetting({success:resolve}));return r.authSetting}''')
  record('麦克风授权状态不伪报允许',status.get('scope.record')!=True)
  page.evaluate('void wx.getRecorderManager().start({duration:300})');page.wait_for_timeout(500)
  record('拒绝麦克风时出现降级提示','麦克风不可用' in page.locator('#toast').inner_text());shot(page,'interaction_microphone_denied')
 act('麦克风拒绝交互',permissions)
 def upload():
  page.evaluate("YX.goto('pages/finance/finance','relaunch')");page.wait_for_timeout(400)
  with page.expect_file_chooser() as chooser:page.get_by_text('截图识别',exact=True).click()
  chooser.value.set_files(str(OUT/'ocr_fixture.png'))
  page.wait_for_function('YX.getPage().data.analysis !== null && YX.getPage().data.analysis !== undefined',timeout=60000)
  record('浏览器上传图片并显示分析',page.evaluate('!!YX.getPage().data.analysis'));shot(page,'interaction_image_ocr_local')
 act('图片上传交互',upload)
 # Touch-target audit: raw measurements, not a blanket usability pass.
 page.evaluate("YX.goto('pages/finance/finance','relaunch')");page.wait_for_timeout(1600)
 targets=page.locator('#yx-render button').evaluate_all('(els)=>els.map(e=>({text:e.innerText.slice(0,25),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width>0&&e.height>0)')
 (OUT/'touch_targets.json').write_text(json.dumps(targets,ensure_ascii=False,indent=2),encoding='utf-8')
 record('理财页44px触控高度',all(x['height']>=44 for x in targets),small_targets=sum(x['height']<44 for x in targets))
 page.emulate_media(reduced_motion='reduce');record('减少动画媒体设置生效',page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'))
 shot(page,'interaction_reduced_motion');ctx.close();b.close()
(OUT/'ui_route_audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print('UI_RESULT',sum(x['passed'] for x in results),'/',len(results),flush=True)
sys.exit(0 if all(x['passed'] for x in results) else 1)
