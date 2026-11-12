"""Play every local lesson to its natural ended event, not just metadata or one second."""
import os,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'))['长辈'];rows=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True);p=b.new_page(viewport={'width':1440,'height':1000});p.goto('http://127.0.0.1:8001/site/');p.wait_for_function('window.YX&&YX.getPage()');p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role","elder");Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:"elder"});getApp()._familyUnreadPrompted=true}',F);p.evaluate('YX.goto("pages/index/index")');p.wait_for_function('YX.getPage().data.lessonList.length===10');p.wait_for_timeout(350)
 courses=p.evaluate('YX.getPage().data.lessonList')
 for index,course in enumerate(courses):
  try:
   p.locator('.lesson-picker-open').click();p.locator(f'.lesson-picker-item[data-index="{index}"]').click();p.wait_for_timeout(100);v=p.locator('#homeLessonVideo');poster=v.get_attribute('poster');r=p.request.get(poster if poster.startswith('http') else 'http://127.0.0.1:8001'+poster);assert r.status==200,('poster',r.status)
   v.evaluate('v=>{window.__courseCard=document.querySelector(".lesson-card");window.__courseErrors=[];v.addEventListener("error",()=>__courseErrors.push(v.error?.code));v.muted=true;v.playbackRate=4;return v.play()}');p.wait_for_function('document.querySelector("#homeLessonVideo")?.ended===true',timeout=65000)
   state=v.evaluate('v=>({time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,ended:v.ended,cardStable:__courseCard===document.querySelector(".lesson-card"),opacity:getComputedStyle(__courseCard).opacity,errors:__courseErrors})');ok=state['ended'] and state['time']>=state['duration']-.3 and state['cardStable'] and float(state['opacity'])==1 and not state['errors'] and '.m3u8' not in course['video_url'];rows.append({'course':course['title'],'passed':ok,'poster_http':r.status,**state});print(('PASS ' if ok else 'FAIL ')+course['title'],round(state['duration'],2),'seconds fully played at 4x',flush=True)
  except Exception as e:rows.append({'course':course['title'],'passed':False,'error':str(e)[:400]});print('FAIL',course['title'],type(e).__name__,flush=True)
  (OUT/'course_lifecycle_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
 b.close()
print('COURSE_LIFECYCLE',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if len(rows)==10 and all(x['passed'] for x in rows) else 1)
