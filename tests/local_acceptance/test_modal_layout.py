import os,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
O=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((O/'ui_fixtures.json').read_text(encoding='utf-8'))['长辈'];rows=[]
cases=[('ledger','pages/money/money','.add-panel','ledger'),('medicine','pages/health/health','.add-panel.panel-show','medicine'),('phone','pages/service/service','.add-panel.panel-show','phone'),('group_history','pages/family-group-chat/family-group-chat','.history-panel','history'),('permissions','pages/profile/profile','.child-permission-panel','permissions'),('location','pages/nearby/nearby','.yx-location-dialog','location'),('term','pages/finance/finance','.term-popup-card','term')]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);p=b.new_page();p.set_default_timeout(10000);p.goto('http://127.0.0.1:8001/site/');p.wait_for_function('window.YX&&YX.getPage()')
 for width,height in [(1440,1000),(390,844)]:
  p.set_viewport_size({'width':width,'height':height})
  for font in ['normal','xlarge']:
   for name,route,selector,action in cases:
    try:
     p.goto('http://127.0.0.1:8001/site/');p.wait_for_function('window.YX&&YX.getPage()')
     p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"});getApp()._familyUnreadPrompted=true}',F);p.evaluate('r=>YX.goto(r,"relaunch")',route);p.wait_for_timeout(250)
     for _ in range(3):
      if p.evaluate('getApp().globalData.fontSizeMode')==font:break
      p.locator('#font-change').click();p.wait_for_timeout(60)
     if action=='ledger':p.get_by_text('记一笔',exact=True).click();p.locator('#action-sheet').get_by_text('记录支出',exact=True).click()
     elif action=='medicine':p.get_by_text('+ 添加吃药提醒',exact=True).click()
     elif action=='phone':p.get_by_text('+ 添加电话',exact=True).click()
     elif action=='history':p.get_by_text('记录',exact=True).click()
     elif action=='permissions':p.locator('[data-key="child_support"]').first.click()
     elif action=='location':p.evaluate('wx.chooseLocation({success(){}})')
     elif action=='term':p.evaluate('YX.getPage().setData({termExplainPopups:[{id:"layout-qa",term:"测试术语",explanation:"这段文字只用于检查弹窗的换行和滚动。",top:150,left:20}]})')
     p.locator(selector).wait_for(state='visible');p.wait_for_timeout(120);state=p.locator(selector).evaluate('e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,scroll:e.scrollHeight,client:e.clientHeight,overflow:getComputedStyle(e).overflowY}}');ok=state['x']>=-1 and state['y']>=-1 and state['right']<=width+1 and state['bottom']<=height+1
     rows.append({'test':name,'width':width,'font':font,'passed':ok,**state});print(('PASS ' if ok else 'FAIL ')+name,str(width),font,flush=True);p.screenshot(path=str(O/f'modal_{name}_{width}_{font}.png'),animations='disabled')
     if action=='location':p.locator('.location-cancel').click()
     elif action in ['ledger','medicine','phone']:p.locator(selector).get_by_text('取消',exact=True).click()
     elif action=='history':p.locator('.history-close').click()
     elif action=='permissions':p.locator('.child-permission-panel .edit-cancel').click()
     elif action=='term':p.locator('.term-popup-close').click()
    except Exception as e:rows.append({'test':name,'width':width,'font':font,'passed':False,'error':str(e)[:1000]});print('FAIL',name,width,font,type(e).__name__,flush=True)
    (O/'modal_layout_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
 b.close()
print('MODAL_LAYOUT',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
