import os,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'))['长辈'];rows=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--autoplay-policy=no-user-gesture-required']);page=b.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(12000);page.goto('http://127.0.0.1:8001/site/');page.wait_for_function('window.YX&&YX.getPage()');page.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role","elder");Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"})}',F);page.evaluate('YX.goto("pages/index/index","relaunch")');page.wait_for_function('YX.getPage().data.lessonList.length===9');page.wait_for_timeout(500)
 if page.locator('#dialog-overlay').is_visible():page.locator('#dialog-okay').click()
 courses=page.evaluate('YX.getPage().data.lessonList.map(x=>({title:x.video_title,url:x.video_url}))')
 for i,course in enumerate(courses):
  try:
   page.locator('.lesson-picker-open').click();page.locator('.lesson-picker-item[data-index="'+str(i)+'"]').click();page.wait_for_timeout(150);v=page.locator('#homeLessonVideo');v.evaluate('v=>{v.muted=true;return v.play()}');page.wait_for_function('document.querySelector("#homeLessonVideo")?.currentTime>1.0',timeout=35000)
   if i==0:page.wait_for_function('document.querySelector("#homeLessonVideo")?.currentTime>4',timeout=12000)
   state=v.evaluate('v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,duration:v.duration,paused:v.paused})');ok=state['width']>0 and state['duration']>30 and not state['paused'];rows.append({'course':i+1,'title':course['title'],'passed':ok,**state});print(('PASS' if ok else 'FAIL'),'COURSE',i+1,course['title'],flush=True);v.evaluate('v=>v.pause()')
   if i==1:page.screenshot(path=str(OUT/'original_course_native.png'),animations='disabled')
  except Exception as e:rows.append({'course':i+1,'title':course['title'],'passed':False,'error':str(e)[:500]});print('FAIL COURSE',i+1,type(e).__name__,flush=True)
 b.close()
(OUT/'all_courses_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('ALL_COURSES',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if len(rows)==9 and all(x['passed'] for x in rows) else 1)
