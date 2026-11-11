/* Small, non-invasive embellishments. Business functions and navigation stay inside compat.js and original page JS. */
(()=>{
 'use strict';
 const colors={"首页概览":"#ed9d48","问小享":"#ec9943","钱生钱 · 识别":"#679e73","管钱钱 · 账本":"#6da4b3","家庭协同":"#71966a","家庭留言":"#d58c6e","家庭群聊":"#a486c4","健康与提醒":"#78a77b","常用电话":"#e38c68"};
 const clean=()=>{
  const logo=document.querySelector('.identity small');if(logo)logo.remove();
  const sideEnd=document.querySelector('.side-end');if(sideEnd)sideEnd.setAttribute('aria-hidden','true');
  const role=document.querySelector('.role-pill');
  if(role&&!role.dataset.sunnyIcon){role.dataset.sunnyIcon='1';role.setAttribute('title','切换长辈端或子女端');const first=role.querySelector('span');if(first)first.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';}
  document.querySelectorAll('#yx-render .common-func-item').forEach(item=>{
   // Refined JS already adds an accessible SVG icon; keep original tap handler.
   const label=item.querySelector('.common-func-item-label');
   if(label&&label.textContent)label.textContent=label.textContent.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/u,'').trim();
  });
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const render=document.getElementById('yx-render');
  if(render){const obs=new MutationObserver(clean);obs.observe(render,{childList:true,subtree:false});}
  clean();
 });
})();
