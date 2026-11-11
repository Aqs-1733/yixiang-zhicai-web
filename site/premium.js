/* Visual enhancement for existing functional Mini Program pages. No business API overrides. */
(() => {
 'use strict';
 const descriptions = {
  'pages/assistant/assistant':'智能问答 · 多模态输入 · 语音陪伴',
  'pages/finance/finance':'理财识别、产品核验与稳健理财科普',
  'pages/money/money':'智能记账 · 资产跟踪 · 养老收支管理',
  'pages/family/family':'与亲人共享关怀，您拥有所有权限的决定权',
  'pages/family-messages/family-messages':'来自家人的问候，随时收发温暖消息',
  'pages/family-group-chat/family-group-chat':'让一家人的距离，更靠近一点',
  'pages/health/health':'健康记录、用药计划与生活提醒',
  'pages/service/service':'常用服务和紧急电话，一键联系',
  'pages/nearby/nearby':'发现附近的医院、银行和便民服务',
  'pages/profile/profile':'更懂您的画像，为您的养老规划服务',
  'pages/questionnaire/questionnaire':'了解自己的风险偏好，稳健做决定',
  'pages/news-detail/news-detail':'今日最新金融资讯与大白话解读',
  'pages/child/index/index':'家人的平安，是最大的安心',
  'pages/child/elder-list/elder-list':'管理已绑定的长辈和家庭关系',
  'pages/child/elder-dashboard/elder-dashboard':'授权范围内的长辈生活与资产概览',
  'pages/child/bind/bind':'安全建立家庭关系，守护长辈的隐私',
  'pages/child/positions/positions':'仅展示长辈主动授权的理财信息',
  'pages/child/ledger/ledger':'了解家人的收支情况与日常需求',
  'pages/child/alerts/alerts':'及时查看家人的安全风险提醒',
  'pages/child/health/health':'了解健康记录，关心每一天',
  'pages/child/location/location':'在授权范围内关怀家人的位置',
  'pages/child/weekly/weekly':'家人一周生活的温暖小结',
  'pages/child/permissions/permissions':'一切授权，由长辈自主决定',
  'pages/child/assist/assist':'耐心陪伴，远程指导家人操作',
  'pages/child/profile/profile':'管理子女身份与关联信息'
 };
 const auth = new Set(['pages/login/login','pages/register/register','pages/forgot-password/forgot-password','pages/security-question/security-question']);
 function updateIntro(){
  const route=window.YX?.route?.()||'';
  const title=document.querySelector('#page-subtitle')?.textContent || '颐享智财';
  const element=document.getElementById('page-intro');
  if(!element)return;
  const hidden=auth.has(route)||route==='pages/index/index';
  element.hidden=hidden;
  if(!hidden){document.getElementById('page-intro-title').textContent=title;
   document.getElementById('page-intro-copy').textContent=descriptions[route]||'让每一份陪伴与安心，都触手可及。';}
  document.body.classList.toggle('is-home',route==='pages/index/index');
  document.body.classList.toggle('is-child-page',route.startsWith('pages/child/'));
 }
 function updateService(){
  const label=document.getElementById('service-label');if(!label)return;
  fetch('/healthz',{signal:AbortSignal.timeout(4500)}).then(r=>{
   label.textContent=r.ok?'本地服务已连接':'本地服务异常';
   document.querySelector('.status-dot')?.classList.toggle('status-warn',!r.ok);
  }).catch(()=>{label.textContent='服务暂未连接';document.querySelector('.status-dot')?.classList.add('status-warn');});
 }
 function enhancePage(){
  updateIntro();
  const current=document.querySelector('#yx-render');
  if(current)current.setAttribute('data-premium-active','true');
 }
 function init(){
  const title=document.getElementById('page-subtitle');
  if(title)new MutationObserver(enhancePage).observe(title,{childList:true,subtree:true,characterData:true});
  enhancePage(); updateService();
  const logo=document.getElementById('logo-click');
  logo?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();logo.click()}});
  const userMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const art=document.querySelector('.login-graphic img');
  const loginPanel=document.querySelector('.login-art');
  if(art&&loginPanel){loginPanel.addEventListener('pointermove',e=>{
   if(userMotion.matches||e.pointerType==='touch')return;
   const r=loginPanel.getBoundingClientRect(), dx=(e.clientX-r.left)/r.width-.5,dy=(e.clientY-r.top)/r.height-.5;
   art.style.transform=`translate3d(${dx*13}px,${dy*13}px,0)`;
  });loginPanel.addEventListener('pointerleave',()=>art.style.transform='');}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
