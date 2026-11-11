"""Measured UI samples; these are not an all-page accessibility certification."""
import json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(r'D:\Projects\YixiangZhicai_Execution_20261111');F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);page=b.new_page(viewport={'width':1440,'height':1000});page.goto('http://127.0.0.1:8001/site/');page.wait_for_function('window.YX && YX.getPage()');page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role","elder");Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"});}',F['长辈']);page.evaluate("YX.goto('pages/finance/finance')");page.wait_for_timeout(1000)
 rows=page.locator('.btn-primary,.finance-mode-tabs button,.section-title').evaluate_all('''els=>els.filter(e=>e.getBoundingClientRect().width>0).map(e=>{let x=e,bg='rgb(255,255,255)',gradient='none';while(x){const c=getComputedStyle(x);if(c.backgroundImage!=='none')gradient=c.backgroundImage;if(c.backgroundColor!=='rgba(0, 0, 0, 0)'&&c.backgroundColor!=='transparent'){bg=c.backgroundColor;break}x=x.parentElement}let s=getComputedStyle(e);return {text:e.innerText,color:s.color,bg,gradient,font:s.fontSize,weight:s.fontWeight}})''')
 page.emulate_media(reduced_motion='reduce');motion=page.locator('#yx-render *').evaluate_all("els=>els.filter(e=>e.getBoundingClientRect().width>0 && getComputedStyle(e).animationName!=='none').length")
 b.close()
def rgb(s):return [float(v) for v in s[s.find('(')+1:s.find(')')].split(',')[:3]]
def lum(c):
 x=[v/255 for v in c];x=[v/12.92 if v<=0.04045 else ((v+.055)/1.055)**2.4 for v in x];return .2126*x[0]+.7152*x[1]+.0722*x[2]
def ratio(a,b):
 x,y=sorted([lum(rgb(a)),lum(rgb(b))]);return (y+.05)/(x+.05)
for r in rows:
 stops=re.findall(r'rgba?\([^)]*\)',r['gradient']);ratios=[ratio(r['color'],s) for s in stops] if stops else [ratio(r['color'],r['bg'])];r['contrast_min']=round(min(ratios),2);r['sample_pass_4_5']=min(ratios)>=4.5
j={'samples':rows,'reduced_motion_visible_animated_elements':motion};(OUT/'visual_measurements.json').write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(j,ensure_ascii=False,indent=2))
