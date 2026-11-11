/* All original business events stay mounted: visual enhancement only. */
(()=>{
'use strict';
const paths={
 '记账助手':'<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h5"/>',
 '找儿女':'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 16a5 5 0 0 1 5 4"/>',
 '家庭群聊':'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
 '守护健康':'<path d="M20.3 5.3a5.5 5.5 0 0 0-7.8 0L12 6l-.5-.7a5.5 5.5 0 0 0-7.8 7.8L12 21l8.3-7.9a5.5 5.5 0 0 0 0-7.8Z"/><path d="M6 12h3l2-3 2 6 2-3h3"/>',
 '附近服务':'<path d="M20 10c0 5.1-8 11-8 11S4 15.1 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'
};
const svg=(p)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
function decorate(){
  const route=window.YX?.route?.()||'';
  document.body.dataset.route=route.replace(/\//g,'-');
  document.body.classList.toggle('refined-home',route==='pages/index/index');
  document.querySelectorAll('#yx-render .common-func-item').forEach((item)=>{
    if(item.querySelector('.quick-icon'))return;
    const label=item.querySelector('.common-func-item-label');
    if(!label)return;
    const text=(item.getAttribute('data-label')||label.textContent||'').trim();
    const p=paths[text];
    if(!p)return;
    const icon=document.createElement('span');icon.className='quick-icon';icon.innerHTML=svg(p);
    item.insertBefore(icon,label);
    label.textContent=text;
    item.setAttribute('role','button');item.tabIndex=0;
    item.setAttribute('aria-label',text);
    item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();item.click();}});
  });
  document.querySelectorAll('#yx-render .home-news-refresh').forEach(el=>{
    if(el.dataset.decorated)return;
    el.dataset.decorated='1';el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label','刷新财经资讯');
    el.innerHTML=svg('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.7 9a7 7 0 0 1 12-2l2.3 3M4 14l2.3 3A7 7 0 0 0 18 15"/>');
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
  });
  document.querySelectorAll('#yx-render .lesson-video').forEach(el=>{
    if(!el.hasAttribute('poster'))el.setAttribute('poster','assets/illustrations/classroom.svg');
  });
}
let pending=false;
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;decorate();});}
function init(){
 const render=document.getElementById('yx-render');
 if(render){new MutationObserver(schedule).observe(render,{childList:true,subtree:false});}
 const subtitle=document.getElementById('page-subtitle');if(subtitle)new MutationObserver(schedule).observe(subtitle,{childList:true});
 schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
