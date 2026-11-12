import os,json,sys,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));rows=[]
def record(name,ok,**kw):rows.append({'test':name,'passed':bool(ok),**kw});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);ctx=b.new_context(viewport={'width':1440,'height':1000});p=ctx.new_page();p.set_default_timeout(15000);requests=[];p.on('request',lambda r:requests.append(r.url));p.goto('http://127.0.0.1:8001/site/');p.wait_for_function('window.YX&&YX.getPage()')
 record('原小享头像字节一致', (ROOT/'site/assets/brand/xiaoxiang-original.png').read_bytes()==(ROOT/'miniprogram/assets/ui/assistant_avatar.png').read_bytes())
 for route in ['pages/assistant/assistant','pages/family-group-chat/family-group-chat','pages/profile/profile','pages/money/money','pages/child/ledger/ledger','pages/register/register','pages/login/login']:
  f=F['子女' if '/child/' in route else '长辈'];p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("rememberLoginUntil",0);wx.setStorageSync("role",f.user.role);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role});getApp()._familyUnreadPrompted=true}',f);p.evaluate('r=>YX.goto(r,"relaunch")',route+('?elder_id='+str(F['meta']['elder_id']) if '/child/' in route else ''));p.wait_for_timeout(320)
  for _ in range(3):
   if p.evaluate('getApp().globalData.fontSizeMode')=='normal':break
   p.locator('#font-change').click();p.wait_for_timeout(80)
  samples=[]
  for mode in ['normal','large','xlarge']:
   target=p.locator('#yx-render button:visible, #yx-render input:visible, #yx-render textarea:visible').first
   samples.append({'mode':p.evaluate('getApp().globalData.fontSizeMode'),'html_mode':p.locator('html').get_attribute('data-font'),'font':float(target.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)'))})
   if mode!='xlarge':p.locator('#font-change').click();p.wait_for_timeout(120)
  ok=[x['mode'] for x in samples]==['normal','large','xlarge'] and [x['html_mode'] for x in samples]==['normal','large','xlarge'] and samples[0]['font']<samples[1]['font']<samples[2]['font'];record(route+' 实际按钮切换三档字号',ok,samples=samples)
  p.reload();p.wait_for_function('window.YX&&YX.getPage()');p.wait_for_timeout(300);record(route+' 刷新保留字号',p.locator('html').get_attribute('data-font')=='xlarge' and p.locator('#font-change').get_attribute('data-mode')=='xlarge')
 f=F['长辈'];p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"});getApp()._familyUnreadPrompted=true;YX.goto("pages/finance/finance","relaunch")}',f);p.wait_for_timeout(400)
 record('导航和品牌使用原小享，不请求机器人图片',all('xiaoxiang-original.png' in p.locator(s).get_attribute('src') for s in ['.identity-logo img','.cute-side-mascot']) and not any('mascot.webp' in x for x in requests))
 record('奶油白背景配色',p.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(255, 250, 240)')
 scenes=set()
 for route in ['pages/finance/finance','pages/health/health','pages/nearby/nearby','pages/family-group-chat/family-group-chat']:
  p.evaluate('r=>YX.goto(r,"relaunch")',route);p.wait_for_timeout(250);img=p.locator('.module-welcome>img');scenes.add(img.get_attribute('src'));img.evaluate('e=>e.decode()');record(route+' 对应场景图片加载',img.evaluate('e=>e.naturalWidth>0&&getComputedStyle(e).objectFit==="contain"'))
 record('四张不同场景贴图',len(scenes)==4,assets=sorted(scenes));b.close()
(OUT/'brand_font_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('BRAND_FONT',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
