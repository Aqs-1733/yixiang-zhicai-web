/* Near-real-time foreground refresh, one bounded request per visible conversation. */
(() => {
 'use strict';let busy=false,owner=null,badgeAt=0,badgeBusy=false;
 function badge(label,count){
  for(const el of document.querySelectorAll('#main-nav .nav-item'))if(el.innerText.includes(label)){
   let b=el.querySelector('.nav-unread');if(!b){b=document.createElement('span');b.className='nav-unread';b.dataset.yxDecoration='true';el.append(b)}b.textContent=count>99?'99+':String(count);b.hidden=count<1;
  }
 }
 async function unread(){
  if(badgeBusy||Date.now()<badgeAt)return;badgeAt=Date.now()+4000;badgeBusy=true;
  try{
   const [direct,group]=await Promise.all([getApp().request({url:'/family/messages/unread',loading:false}),getApp().request({url:'/family/group-chat/unread',loading:false})]);
   badge('家庭留言',Number(direct.count||0));badge('家庭群聊',Number(group.count||0));
   const p=YX.getPage();if(p&&'groupUnreadCount' in p.data&&p.data.groupUnreadCount!==Number(group.count||0))p.setData({groupUnreadCount:Number(group.count||0)});
  }catch{}finally{badgeBusy=false}
 }
 async function sync(){
  if(busy||document.hidden||!window.YX||!wx.getStorageSync('token'))return;
  const page=YX.getPage(),route=YX.route();if(!page)return;
  let action=null;
  if(route==='pages/family-messages/family-messages'&&page.data.selectedPeerId&&!page.data.isRecording)action=()=>page.loadMessages();
  if(route==='pages/family-group-chat/family-group-chat'&&!page.data.recording&&!page.data.loading)action=()=>page.loadMessages(page.data.familyId);
  unread();if(!action)return;busy=true;owner=page;
  try{await action()}catch{}finally{busy=false}
 }
 setInterval(sync,1500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
 window.YXFamilySync={sync,get busy(){return busy},get owner(){return owner}};
})();
