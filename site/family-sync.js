/* Same-origin authenticated updates keep an open desktop tab current, including in background. */
(() => {
 'use strict';let busy=false,owner=null,badgeAt=0,badgeBusy=false,stream=null,streamToken='',retryAt=0,failures=0;
 const body=document.body;
 function badge(label,count){for(const el of document.querySelectorAll('#main-nav .nav-item'))if(el.innerText.includes(label)){let b=el.querySelector('.nav-unread');if(!b){b=document.createElement('span');b.className='nav-unread';b.dataset.yxDecoration='true';el.append(b)}b.textContent=count>99?'99+':String(count);b.hidden=count<1;}}
 function counts(direct,group){badge('家庭留言',direct);badge('家庭群聊',group);body.dataset.familyUnread=String(direct+group);body.dataset.familySyncedAt=new Date().toISOString();const p=YX.getPage();if(p&&'groupUnreadCount' in p.data&&p.data.groupUnreadCount!==group)p.setData({groupUnreadCount:group});}
 async function unread(){if(badgeBusy||Date.now()<badgeAt)return;badgeAt=Date.now()+(document.hidden?15000:4000);badgeBusy=true;try{const [d,g]=await Promise.all([getApp().request({url:'/family/messages/unread',loading:false}),getApp().request({url:'/family/group-chat/unread',loading:false})]);counts(Number(d.count||0),Number(g.count||0))}catch{}finally{badgeBusy=false}}
 async function sync(){if(busy||!window.YX||!wx.getStorageSync('token'))return;unread();if(document.hidden)return;const page=YX.getPage(),route=YX.route();if(!page)return;let action=null;if(route==='pages/family-messages/family-messages'&&page.data.selectedPeerId&&!page.data.isRecording)action=()=>page.loadMessages();if(route==='pages/family-group-chat/family-group-chat'&&!page.data.recording&&!page.data.loading)action=()=>page.loadMessages(page.data.familyId);if(!action)return;busy=true;owner=page;try{await action()}catch{}finally{busy=false}}
 async function connect(token){
  const controller=new AbortController();stream=controller;streamToken=token;body.dataset.familyTransport='connecting';
  try{
   const response=await fetch('/family/events',{headers:{Authorization:'Bearer '+token,Accept:'text/event-stream'},signal:controller.signal,cache:'no-store'});
   if(!response.ok||!response.body)throw Error('stream');
   body.dataset.familyTransport='stream';failures=0;const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
   while(true){const part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});let end;
    while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);const line=frame.split('\n').find(s=>s.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));counts(Number(data.message_count||0),Number(data.group_count||0));if(!document.hidden)sync();}
    if(pending.length>20000)throw Error('frame');
   }
  }catch(e){if(e.name!=='AbortError'){failures++;body.dataset.familyTransport='polling';}}
  finally{if(stream===controller){stream=null;retryAt=Date.now()+Math.min(30000,1000*2**Math.min(failures,5));}}
 }
 function tick(){const token=window.wx?.getStorageSync('token')||'';if(stream&&streamToken!==token){stream.abort();stream=null;retryAt=0;}if(token&&!stream&&Date.now()>=retryAt&&navigator.onLine!==false)connect(token);if(!token){body.dataset.familyTransport='signed-out';return;}sync();}
 setInterval(tick,1500);document.addEventListener('visibilitychange',()=>{badgeAt=0;tick()});window.addEventListener('online',()=>{retryAt=0;badgeAt=0;tick()});window.addEventListener('pagehide',()=>{stream?.abort()});
 window.YXFamilySync={sync,get busy(){return busy},get owner(){return owner}};tick();
})();
