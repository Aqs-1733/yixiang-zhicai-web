"""Interaction acceptance against an isolated local database; no real-provider claims."""
import os,json,time,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'))
results=[]
def check(name,value):
 results.append({'test':name,'passed':bool(value)});print(('PASS ' if value else 'FAIL ')+name,flush=True)
def run(name,fn):
 try: fn()
 except Exception as e:
  check(name,False);results[-1]['error']=str(e)[:800];print(str(e)[:800],flush=True)
  try:page.screenshot(path=str(OUT/('failure_'+name+'.png')),animations='disabled',timeout=3000)
  except Exception:pass
  if page.locator('#dialog-overlay').is_visible():page.locator('#dialog-okay').click(force=True)
 finally:(OUT/'parity_flow_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
def wait(js):page.wait_for_function(js,timeout=12000)
def go(path):page.evaluate('p=>YX.goto(p,"relaunch")',path);page.wait_for_timeout(350)
def inject(role='长辈'):
 page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);wx.setStorageSync("rememberLoginUntil",Date.now()+1800000);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role})}',F[role])
def api(path):return page.evaluate('p=>getApp().request({url:p,loading:false})',path)
def fill(selector,value):page.locator(selector).fill(value);page.wait_for_timeout(60)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True);page=context.new_page();page.set_default_timeout(7000)
 page.goto('http://127.0.0.1:8001/site/');wait('window.YX&&YX.getPage()')
 def switches():
  s=page.locator('.yx-switch');s.click();wait('YX.getPage().data.rememberWeek===true');check('七天开关点击与状态',s.get_attribute('aria-checked')=='true')
  s.press('Space');wait('YX.getPage().data.rememberWeek===false');check('七天开关键盘与焦点',s.get_attribute('aria-checked')=='false' and s.evaluate('e=>e===document.activeElement'))
  check('已删除额外页脚与说明',page.locator('.content-footer,.page-intro,.hero-stat,.top-tagline,.side-badge').count()==0)
 run('switch',switches)
 def registration():
  page.get_by_text('注册新账号',exact=True).click();wait("YX.route()==='pages/register/register'")
  with page.expect_file_chooser() as fc:page.locator('.register-avatar').click()
  fc.value.set_files(str(OUT/'ocr_fixture.png'));wait("YX.getPage().data.avatar.startsWith('blob:')")
  check('注册头像真实文件选择',page.locator('.register-avatar-img').get_attribute('src').startswith('blob:'))
  phone='139'+str(time.time_ns())[-8:];fill('[data-k=nickname]','复刻验收账号');fill('[data-k=phone]',phone);fill('[data-k=password]','Parity-test-2486')
  page.get_by_text('完成注册',exact=True).click();wait("!!wx.getStorageSync('token')")
  me=api('/auth/me');check('注册与头像上传持久化',me['user']['phone']==phone and '/media/' in str(me.get('profile',{}).get('avatar','')))
  page.locator('#dialog-okay').click();wait("YX.route()==='pages/login/login'");check('注册完成清除临时登录状态',not page.evaluate("wx.getStorageSync('rememberLoginUntil')"))
 run('register_avatar',registration)
 def login():
  go('pages/login/login');fill('[data-k=phone]',F['长辈']['phone']);fill('[data-k=password]',F['长辈']['password']);page.locator('.yx-switch').click()
  page.get_by_text('手机号登录',exact=True).click();wait('YX.getPage().data.showLoginSuccess===true')
  remaining=page.evaluate("Number(wx.getStorageSync('rememberLoginUntil'))-Date.now()");check('七天免登录期限',604700000<remaining<=604800000)
  page.get_by_text('进入颐享智财',exact=True).click();page.wait_for_timeout(250);page.reload();wait("YX.route()==='pages/index/index'");check('刷新保留七天登录',bool(api('/auth/me').get('user')))
  page.locator('#logout-top').click();check('退出同时清除全局令牌',not page.evaluate('getApp().globalData.token') and not page.evaluate("wx.getStorageSync('token')"))
 run('remember_login',login)
 inject()
 def questionnaire():
  go('pages/questionnaire/questionnaire')
  for i in range(8):
   page.locator('.option').first.click();page.wait_for_timeout(80)
   check('问卷单选第'+str(i+1)+'题',page.locator('input[type=radio]:checked').count()==1)
   page.locator('.next-btn').click();page.wait_for_timeout(120)
  page.locator('#dialog-okay').click();wait("YX.route()==='pages/profile/profile'")
  check('八题问卷提交画像',api('/auth/me')['profile'].get('onboarding_completed') is True)
 run('questionnaire',questionnaire)
 def profile():
  go('pages/profile/profile');fill('.nick-input','浏览器昵称验收');page.locator('.nick-input').press('Tab');page.wait_for_timeout(500)
  check('昵称失焦保存后端',api('/auth/me')['profile'].get('nickname')=='浏览器昵称验收')
  with page.expect_file_chooser() as fc:page.locator('.avatar-btn').click()
  fc.value.set_files(str(OUT/'ocr_fixture.png'));page.wait_for_timeout(600)
  avatar=api('/auth/me')['profile'].get('avatar','');check('个人页头像上传后端','/media/' in avatar)
  check('头像可实际读取',page.request.get('http://127.0.0.1:8001'+avatar.replace('http://127.0.0.1:8001','')).status==200)
 run('profile_avatar_blur',profile)
 def navigation():
  go('pages/money/money');page.evaluate('YX.getPage().setData({__keep:"keep"});YX.goto("pages/profile/profile")');page.wait_for_timeout(200)
  page.go_back();wait("YX.route()==='pages/money/money'");check('浏览器后退保留页面状态',page.evaluate('YX.getPage().data.__keep')=='keep' and '#/pages/money/money' in page.url)
  page.go_forward();wait("YX.route()==='pages/profile/profile'");check('浏览器前进路由同步','#/pages/profile/profile' in page.url)
  page.evaluate('YX.back()');wait("YX.route()==='pages/money/money'");page.reload();wait("YX.route()==='pages/money/money'");check('小程序返回更新地址与刷新',True)
 run('navigation_history',navigation)
 def ledger():
  go('pages/money/money');page.get_by_text('记一笔',exact=True).click();page.locator('#action-sheet').get_by_text('记录支出',exact=True).click()
  page.locator('.category-item').first.click();fill('.amount-input','12.50');fill('.description-input','复刻验收买菜')
  page.locator('.panel-btn-confirm').click();wait("!YX.getPage().data.showAddPanel");page.wait_for_timeout(350)
  record=page.locator('.record-line').filter(has_text='复刻验收买菜');check('账本新增小数金额',record.count()==1 and '12.5' in record.inner_text() and any(x.get('title')=='复刻验收买菜' and x.get('amount')==12.5 for x in api('/ledger/summary')['records']))
  record.get_by_text('修改',exact=True).click();fill('.amount-input','18.75');page.locator('.panel-btn-confirm').click();wait('!YX.getPage().data.showAddPanel');page.wait_for_timeout(300)
  check('账本修改金额','18.75' in record.inner_text());record.get_by_text('删除',exact=True).click();page.locator('#dialog-okay').click();page.wait_for_timeout(400)
  check('账本删除持久化',record.count()==0)
 run('ledger_crud',ledger)
 def reminders():
  go('pages/health/health');page.get_by_text('+ 添加吃药提醒',exact=True).click();fill('input[placeholder="请输入药品名称"]','复刻验收提醒');page.locator('input[type=time]').fill('09:35');page.locator('input[type=time]').dispatch_event('change');fill('input[placeholder="如：1片、2粒、10ml"]','按测试方案')
  # Avoid exporting a calendar while testing reminder persistence.
  sw=page.locator('.add-panel .yx-switch');
  if sw.get_attribute('aria-checked')=='true':sw.click()
  page.locator('.panel-btn-confirm').click();wait('!YX.getPage().data.showPanel');page.wait_for_timeout(300)
  med=page.evaluate("YX.getPage().data.meds.find(m=>m.name==='复刻验收提醒')");check('用药时间选择与新增',med and med['time']=='09:35')
  sw=page.locator('.yx-switch[data-id="'+str(med['id'])+'"]');
  with page.expect_download() as dl:sw.click()
  check('开启提醒导出日历',dl.value.suggested_filename.endswith('.ics'));page.wait_for_timeout(250)
  check('提醒开关保存后端',any(str(x['id'])==str(med['id']) and x['alarm'] for x in api('/health/summary').get('meds',[])))
  page.locator('.med-delete-btn[data-id="'+str(med['id'])+'"]').click();page.locator('#dialog-okay').click();page.wait_for_timeout(350)
  check('提醒删除',not page.evaluate("YX.getPage().data.meds.some(m=>m.name==='复刻验收提醒')"))
 run('health_reminder',reminders)
 def phones():
  go('pages/service/service');page.get_by_text('+ 添加电话',exact=True).click();fill('input[placeholder="请输入联系人名称"]','验收联系人');fill('input[placeholder="请输入电话号码"]','01012345678');page.locator('.panel-btn-confirm').click();wait('!YX.getPage().data.showPanel');page.wait_for_timeout(250)
  row=page.locator('.phone-item').filter(has_text='验收联系人')
  if not row.count():row=page.locator('.phone-row').filter(has_text='验收联系人')
  check('常用电话新增',row.count()==1);row.get_by_text('删除',exact=True).click();page.locator('#dialog-okay').click();page.wait_for_timeout(300);check('常用电话删除',row.count()==0)
 run('service_phone',phones)
 def map_choose():
  go('pages/nearby/nearby');page.wait_for_timeout(500)
  if page.locator('#dialog-overlay').is_visible():page.locator('#dialog-cancel').click()
  else:page.get_by_text('地图选点',exact=True).click()
  check('地图选点打开交互窗',page.locator('.yx-location-cover').is_visible())
  page.locator('.yx-location-search input').fill('天津市');page.locator('.yx-location-search button').click();wait("!document.querySelector('.location-confirm').disabled")
  selected=page.locator('.yx-location-selected').inner_text();page.locator('.location-confirm').click();wait("!document.querySelector('.yx-location-cover')")
  check('地图地址搜索确认',bool(selected) and bool(page.evaluate('YX.getPage().data.latitude')))
  page.get_by_text('地图选点',exact=True).click();page.locator('.yx-location-cover').press('Escape');check('地图选点取消关闭',page.locator('.yx-location-cover').count()==0)
 run('map_selection',map_choose)
 def role_nav():
  inject('子女');go('pages/assistant/assistant');check('子女共享页保留身份导航',page.locator('#main-nav').get_by_text('子女端首页',exact=True).count()==1 and page.evaluate('document.documentElement.dataset.role')=='child')
  go('pages/family/family');check('子女家庭页保留身份导航',page.evaluate('document.documentElement.dataset.role')=='child')
 run('child_shared_navigation',role_nav)
 inject()
 def finance():
  go('pages/finance/finance');check('恢复原版理财页朗读',page.locator('.read-hot').is_visible() and page.locator('.read-hot').bounding_box()['height']>=44)
  page.evaluate('window.__read="";getApp().readText=t=>{window.__read=t}');page.locator('.read-hot').click();check('朗读按钮调用原处理函数','理财知识页' in page.evaluate('window.__read'))
 run('finance_read',finance)
 check('原版处理函数无运行时错误',not page.evaluate('YX.errors()'))
 for width,height in [(1440,1000),(768,1024),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.evaluate('wx.removeStorageSync("token");wx.removeStorageSync("rememberLoginUntil");getApp().globalData.token="";YX.goto("pages/login/login","relaunch")');page.wait_for_timeout(300);page.screenshot(path=str(OUT/f'login_fixed_{width}.png'),animations='disabled');inject();go('pages/finance/finance');page.screenshot(path=str(OUT/f'finance_fixed_{width}.png'),animations='disabled')
 browser.close()
(OUT/'parity_flow_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('PARITY_FLOWS',sum(x['passed'] for x in results),'/',len(results));sys.exit(0 if all(x['passed'] for x in results) else 1)
