import json
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(r'D:\Projects\YixiangZhicai_Execution_20261111');F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));rows=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);page=b.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(10000);page.goto('http://127.0.0.1:8001/site/');page.wait_for_function('window.YX && YX.getPage()');page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role","elder");Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"});}',F['长辈']);page.evaluate("YX.goto('pages/finance/finance')");page.wait_for_timeout(300)
 try:
  page.locator('.product-input').fill('验收文本：购买中国银行理财10000元，风险等级R2，期限180天，业绩比较基准3%，本金不保证。');page.wait_for_timeout(100);page.get_by_text('文字识别',exact=True).click();page.wait_for_function('!!YX.getPage().data.analysis');rows.append({'test':'理财文字识别UI','passed':True})
  page.locator('.explainable-finance[data-term]').first.wait_for();page.locator('.explainable-finance[data-term]').first.click();page.locator('.term-popup-card').first.wait_for();rows.append({'test':'术语高亮点击解释弹窗','passed':True})
  page.locator('.term-popup-ask').first.click();page.locator('.term-chat-input').first.fill('风险在哪里？');page.wait_for_timeout(80);page.locator('.term-chat-send').first.click();page.wait_for_timeout(600)
  rows.append({'test':'术语弹窗追问本地链路','passed':'风险在哪里？' in page.locator('.term-popup-card').first.inner_text()})
  page.screenshot(path=r'D:\Projects\YixiangZhicai_Web\tests\local_acceptance\interaction_term_followup.png',animations='disabled')
  page.locator('.term-popup-close').first.click();page.wait_for_timeout(100);rows.append({'test':'术语弹窗关闭','passed':page.locator('.term-popup-card').count()==0})
 except Exception as e:rows.append({'test':'术语UI流程','passed':False,'error':type(e).__name__})
 b.close()
(OUT/'term_ui_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(rows,ensure_ascii=False),flush=True)
