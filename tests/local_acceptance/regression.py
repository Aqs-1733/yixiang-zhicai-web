import json,os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.getenv('YX_EVIDENCE_DIR',r'D:\Projects\YixiangZhicai_Execution_20261111'))
f=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
 page=b.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(8000)
 page.goto(os.getenv('YX_TEST_URL','http://127.0.0.1:8001')+'/site/',wait_until='domcontentloaded');page.wait_for_function('window.YX && YX.getPage()')
 page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role","elder");Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"});}',f['长辈'])
 page.evaluate("void wx.showModal({title:'绑定码测试',editable:true,placeholderText:'请输入6位绑定码',success:r=>window.__modalResult=r})")
 count=page.locator('#dialog-overlay input').count();print('editable_inputs='+str(count),flush=True)
 if count:page.locator('#dialog-overlay input').fill('123456')
 page.locator('#dialog-okay').click();content=page.evaluate('window.__modalResult.content') or '';print('modal_content='+str(content),flush=True)
 page.evaluate("YX.goto('pages/family/family')");page.wait_for_timeout(200);route=page.evaluate('YX.route()');print('family_route='+route,flush=True)
 ok=route=='pages/family/family' and count==1 and content=='123456'
 print('REGRESSION='+('PASS' if ok else 'FAIL'),flush=True);b.close();sys.exit(0 if ok else 1)


