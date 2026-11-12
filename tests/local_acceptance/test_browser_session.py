import os,json,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'))['长辈'];rows=[]
def rec(name,ok):
 rows.append({'test':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 ctx=b.new_context(viewport={'width':1440,'height':1050});p=ctx.new_page();p.set_default_timeout(15000);p.goto('http://127.0.0.1:8001/site/');p.wait_for_function('window.YX&&YX.getPage()')
 p.get_by_placeholder('请输入手机号').fill(F['phone']);p.get_by_placeholder('请输入密码',exact=True).fill(F['password'])
 if p.locator('.remember-row [role=switch]').get_attribute('aria-checked')=='true':p.locator('.remember-row [role=switch]').click()
 p.get_by_text('手机号登录',exact=True).click();p.get_by_text('进入颐享智财',exact=True).click();p.wait_for_function('YX.route()==="pages/index/index"')
 rec('未勾选七天免登录时仅保存标签页会话',p.evaluate('!!sessionStorage.getItem("yixiang_v3_token")&&!localStorage.getItem("yixiang_v3_token")'))
 p.reload();p.wait_for_function('window.YX&&YX.route()==="pages/index/index"');rec('同一标签页整页刷新维持登录',p.evaluate('!!getApp().globalData.token'))
 # A new browser session must not inherit a nonremembered tab token.
 ctx2=b.new_context(storage_state=ctx.storage_state());q=ctx2.new_page();q.goto('http://127.0.0.1:8001/site/');q.wait_for_function('window.YX&&YX.getPage()');rec('新会话不继承未勾选免登录的认证',q.evaluate('YX.route()==="pages/login/login"&&!getApp().globalData.token'));ctx2.close()
 p.evaluate('wx.setStorageSync("rememberLoginUntil",Date.now()-1)');p.reload();p.wait_for_function('window.YX&&YX.getPage()');rec('七天期限过期会清除两种认证存储',p.evaluate('YX.route()==="pages/login/login"&&!sessionStorage.getItem("yixiang_v3_token")&&!localStorage.getItem("yixiang_v3_token")'))
 p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role});getApp()._familyUnreadPrompted=true}',F)
 for w,h in [(1440,1050),(960,1000),(390,844)]:
  p.set_viewport_size({'width':w,'height':h});p.evaluate('YX.goto("pages/profile/profile","relaunch")');p.wait_for_timeout(950);p.screenshot(path=str(OUT/f'FINAL_PROFILE_{w}.png'),animations='disabled')
 p.set_viewport_size({'width':1440,'height':1050});p.evaluate('YX.goto("pages/finance/finance","relaunch")');p.wait_for_timeout(800);p.screenshot(path=str(OUT/'FINAL_FINANCE.png'),animations='disabled');p.evaluate('YX.goto("pages/news-detail/news-detail","relaunch")');p.wait_for_timeout(800);p.screenshot(path=str(OUT/'FINAL_NEWS_LIST.png'),animations='disabled');b.close()
(OUT/'session_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('BROWSER_SESSION',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)

