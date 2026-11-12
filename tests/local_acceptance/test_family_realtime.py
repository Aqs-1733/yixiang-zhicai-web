import os,json,time,sys,httpx,wave,math,struct
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ['YX_EVIDENCE_DIR']);F=json.loads((OUT/'ui_fixtures.json').read_text(encoding='utf-8'));rows=[];BASE='http://127.0.0.1:8001';http=httpx.Client(base_url=BASE,timeout=20);bid=F['meta']['binding_id'];headers={'Authorization':'Bearer '+F['长辈']['token']}
# Deterministic local recording fixture; no account-specific file or cloud service needed.
FAKE_AUDIO=OUT/'family_microphone_fixture.wav'
with wave.open(str(FAKE_AUDIO),'wb') as wav:
 wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(48000);wav.writeframes(b''.join(struct.pack('<h',int(3000*math.sin(2*math.pi*440*i/48000))) for i in range(144000)))

def record(name,ok,**kw):rows.append({'test':name,'passed':bool(ok),**kw});print(('PASS ' if ok else 'FAIL ')+name,flush=True);(OUT/'family_realtime_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
def go(p,route):p.evaluate('r=>YX.goto(r,"relaunch")',route);p.wait_for_timeout(250)
def group_text(p,text):
 if not p.locator('.ask-input-v2').count():p.locator('.mode-switch-btn').first.click()
 p.locator('.ask-input-v2').fill(text);p.locator('.send-btn-v2').click()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+str(FAKE_AUDIO)]);pages=[]
 for actor in ['长辈','子女']:
  ctx=b.new_context(viewport={'width':1440,'height':1000},permissions=['microphone']);ctx.add_init_script('window.__played=[];const p=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.tagName==="AUDIO")window.__played.push(this);return p.call(this)}');p=ctx.new_page();p.set_default_timeout(15000);p.goto(BASE+'/site/');p.wait_for_function('window.YX&&YX.getPage()');p.evaluate('f=>{for(const k of ["token","user","profile"])wx.setStorageSync(k,f[k]);wx.setStorageSync("role",f.user.role);Object.assign(getApp().globalData,{token:f.token,user:f.user,profile:f.profile,role:f.user.role});getApp()._familyUnreadPrompted=true}',F[actor]);pages.append(p)
 elder,child=pages
 for p in pages:go(p,'pages/family-group-chat/family-group-chat');p.wait_for_function('YX.getPage().data.familyId>0')
 nonce=str(time.time_ns());text='长辈群聊同步-'+nonce;t=time.monotonic();group_text(elder,text);child.get_by_text(text,exact=True).wait_for(timeout=8000);record('长辈发群消息自动到达子女',True,latency_seconds=round(time.monotonic()-t,3))
 if not child.locator('.ask-input-v2').count():child.locator('.mode-switch-btn').first.click()
 child.locator('.ask-input-v2').fill('未发送的草稿');child.locator('.ask-input-v2').evaluate('e=>window.__draftNode=e');text2='长辈第二条-'+nonce;group_text(elder,text2);child.get_by_text(text2,exact=True).wait_for(timeout=8000);record('收到消息不打断草稿或更换输入框',child.locator('.ask-input-v2').input_value()=='未发送的草稿' and child.evaluate('window.__draftNode===document.querySelector(".ask-input-v2")'))
 reply='子女回复-'+nonce;group_text(child,reply);elder.get_by_text(reply,exact=True).wait_for(timeout=8000);record('子女回复自动到达长辈',True)
 r=http.put(f'/family/bindings/{bid}/permissions',headers=headers,json={'permissions':{'view_group_chat':False}});child.wait_for_function('YX.getPage().data.messages.length===0',timeout=8000);record('撤销群聊权限后停止展示历史',r.status_code==200 and http.get('/family/group-chat',headers={'Authorization':'Bearer '+F['子女']['token']}).status_code==403)
 if child.locator('#dialog-overlay').is_visible():child.locator('#dialog-okay').click()
 http.put(f'/family/bindings/{bid}/permissions',headers=headers,json={'permissions':{'view_group_chat':True}});child.get_by_text(reply,exact=True).wait_for(timeout=8000);record('恢复授权后自动恢复会话',True)
 for p,peer in [(elder,F['子女']['user']['id']),(child,F['长辈']['user']['id'])]:go(p,'pages/family-messages/family-messages?peer_id='+str(peer));p.wait_for_function('YX.getPage().data.selectedPeerId>0')
 message='一对一留言-'+nonce;elder.locator('.message-textarea').fill(message);elder.get_by_text('发送留言',exact=True).click();child.get_by_text(message,exact=True).wait_for(timeout=8000);record('私信发送与接收无需刷新',True)
 # Upload a recorded WAV through the actual record/stop controls; then play it in the other account.
 with elder.expect_response(lambda r:'/family/voice-message?' in r.url and r.request.method=='POST',timeout=30000) as upload:
  elder.get_by_text('语音留言',exact=True).click();elder.wait_for_timeout(1900);elder.locator('.message-tools').get_by_text('停止录音',exact=True).click()
 j=upload.value.json();voice_id=(j.get('data') or j.get('item') or j).get('id');assert voice_id
 child.wait_for_function('id=>YX.getPage().data.messages.some(x=>x.isVoice&&x.id===id)',arg=voice_id,timeout=8000);voice=child.locator('.history-voice[data-id="'+str(voice_id)+'"]');voice.click();child.wait_for_function('window.__played.some(a=>a.currentTime>.2)',timeout=10000);received=http.get('/family/messages',params={'peer_id':F['长辈']['user']['id']},headers={'Authorization':'Bearer '+F['子女']['token']}).json();meta=next(x for x in received['items'] if x['id']==voice_id);record('语音留言录制上传跨账号到达并实际播放',upload.value.status==200 and bool(meta.get('voice_url')) and meta.get('voice_duration',0)>0,voice_id=voice_id,duration=meta.get('voice_duration'))
 child.reload();child.wait_for_function('window.YX&&YX.getPage()');child.get_by_text(message,exact=True).wait_for(timeout=10000);record('接收账号整页刷新后消息持久存在',True)
 child.screenshot(path=str(OUT/'family_realtime_child.png'),animations='disabled');b.close()
print('FAMILY_REALTIME',sum(x['passed'] for x in rows),'/',len(rows));sys.exit(0 if all(x['passed'] for x in rows) else 1)
