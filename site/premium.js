/* Visual enhancement for existing functional Mini Program pages. No business API overrides. */
(() => {
 'use strict';
 function updateIntro(){
  const route=window.YX?.route?.()||'';
  document.body.classList.toggle('is-home',route==='pages/index/index');
  document.body.classList.toggle('is-child-page',route.startsWith('pages/child/')||wx.getStorageSync('role')==='child');
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
