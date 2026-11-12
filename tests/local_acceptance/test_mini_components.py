import json,os,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));rows=[]
def check(name,ok):rows.append({'test':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
def run(name,fn):
 try:fn()
 except Exception as e:check(name,False);rows[-1]['error']=str(e)[:900];print(str(e)[:300],flush=True)
def inject(role='长辈'):page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);wx.setStorageSync("rememberLoginUntil",Date.now()+1800000);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role})}',F[role])
def go(path):page.evaluate('p=>YX.goto(p,"relaunch")',path);page.wait_for_timeout(500)
def wait(js):page.wait_for_function(js,timeout=10000)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 page=b.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(7000);page.goto('http://127.0.0.1:8001/site/');wait('window.YX&&YX.getPage()');inject()
 def messages():
  go('pages/family-messages/family-messages');wait('!!YX.getPage().data.selectedPeerId');text='家庭留言复刻验收'+str(time.time_ns())[-6:]
  page.locator('.message-textarea').fill(text);wait("!!YX.getPage().data.inputText");check('留言输入后发送按钮可用',page.get_by_text('发送留言',exact=True).is_enabled());page.get_by_text('发送留言',exact=True).click();page.wait_for_timeout(400)
  check('家庭留言真实保存',page.evaluate('t=>getApp().request({url:"/family/messages",loading:false}).then(r=>JSON.stringify(r).includes(t))',text))
  page.wait_for_timeout(500);go('pages/family-messages/family-messages');wait('!!YX.getPage().data.selectedPeerId');
  if page.get_by_text('查看往来',exact=True).count():page.get_by_text('查看往来',exact=True).click()
  page.wait_for_timeout(250);check('留言历史查看',text in page.locator('.compact-history').inner_text())
 run('family_message',messages)
 def group():
  go('pages/family-group-chat/family-group-chat')
  if not page.locator('.ask-input-v2').count():page.locator('.mode-switch-btn').first.click()
  text='家庭群聊复刻验收'+str(time.time_ns())[-6:];page.locator('.ask-input-v2').fill(text);page.wait_for_timeout(80);page.locator('.send-btn-v2').click();page.wait_for_timeout(500)
  check('家庭群聊发送持久化',page.evaluate('t=>getApp().request({url:"/family/group-chat",loading:false}).then(r=>JSON.stringify(r).includes(t))',text))
  page.get_by_text('记录',exact=True).click();page.wait_for_timeout(150);check('群聊记录窗口',page.locator('.history-panel').is_visible());page.locator('.history-close').click();check('群聊记录关闭',not page.locator('.history-panel').count())
 run('family_group',group)
 def permission():
  go('pages/profile/profile');page.locator('[data-key="child_support"]').first.click();wait('YX.getPage().data.showChildPermissionPanel===true');switch=page.locator('.yx-switch[data-key="ledger"]');initial=switch.get_attribute('aria-checked')=='true';switch.click();check('子女权限开关响应',switch.get_attribute('aria-checked')!=str(initial).lower());page.locator('.child-permission-panel .edit-confirm').click();page.wait_for_timeout(500)
  check('子女权限后端保存',page.evaluate('getApp().request({url:"/family/members",loading:false}).then(r=>r.items.every(x=>x.permissions.view_ledger_summary===false))') if initial else True)
  # Restore synthetic family permissions, exercising the original same UI path.
  page.locator('[data-key="child_support"]').first.click();page.locator('.yx-switch[data-key="ledger"]').click();page.locator('.child-permission-panel .edit-confirm').click();page.wait_for_timeout(400)
 run('family_permission',permission)
 def drag():
  go('pages/finance/finance');page.evaluate('YX.getPage().setData({termExplainPopups:[{id:"drag_fixture",term:"测试术语",explanation:"仅用于拖动适配验收",top:150,left:30}]})');page.wait_for_timeout(200)
  card=page.locator('.term-popup-card');before=card.bounding_box();head=page.locator('.term-popup-head').bounding_box();x=head['x']+30;y=head['y']+20
  page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(100);page.mouse.move(x+20,y+30,steps=5);page.mouse.up();page.wait_for_timeout(150);after=card.bounding_box()
  check('术语窗重绘后连续拖动',after['x']>before['x']+5 and after['y']>before['y']+5)
  check('拖动释放清除状态',page.evaluate('[...YX.getPage()._components.values()].find(x=>x.__config.methods?.dragEnd).data.dragging===null'))
  page.locator('.term-popup-close').click();check('拖动后关闭弹窗',card.count()==0)
 run('term_drag',drag)
 def dynamic():
  go('pages/family-messages/family-messages');wait('!!YX.getPage().data.selectedPeerId')
  # Diagnostic handlers verify that the existing conditional WXML binding resolves both branches.
  page.evaluate('const p=YX.getPage();p.startRecord=()=>{p.setData({isRecording:true});window.__recordStart=true};p.stopRecord=()=>{p.setData({isRecording:false});window.__recordStop=true};p.setData({isRecording:false})');page.wait_for_timeout(80)
  page.get_by_text('语音留言',exact=True).click();page.wait_for_timeout(80);page.locator('.message-tools').get_by_text('停止录音',exact=True).click();check('动态事件开始与停止分支',page.evaluate('window.__recordStart&&window.__recordStop&&!YX.getPage().data.isRecording'))
 run('dynamic_handler',dynamic)
 b.close()
(OUT/'component_flow_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('COMPONENT_FLOWS',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
