/* Yixiang Atelier V6: unobtrusive interactions, original business JS untouched. */
(()=>{
 'use strict';
 const root=document.getElementById('yx-render');
 if(!root)return;
 const noMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let observer=null;
 let scheduled=false;
 let lastSignature='';
 function initMotion(){
  if(observer)observer.disconnect();
  observer=null;
  if(noMotion.matches)return;
  const nodes=[];
  // Significant content sections only; avoid animating inputs, dialogs, or dynamic chat messages.
  const route=window.YX?.route?.()||'';
  const selectors=route==='pages/index/index'?
    '.home-weather-card,.home-news-card,.lesson-card,.common-func-panel,.home-message-mini':
    '.yx-page > view > .card,.yx-page .summary-card,.yx-page .health-life-card,.yx-page .m-summary,.yx-page .child-card,.yx-page .finance-card';
  root.querySelectorAll(selectors).forEach((el,i)=>{if(i<12&&el.getBoundingClientRect().width>0){el.style.setProperty('--studio-delay',Math.min(i*85,400)+'ms');nodes.push(el)}});
  if(!nodes.length)return;
  observer=new IntersectionObserver(entries=>{
   for(const en of entries){if(en.isIntersecting){en.target.classList.add('motion-visible');observer.unobserve(en.target)}}
  },{threshold:.06,rootMargin:'0px 0px -16px 0px'});
  nodes.forEach(el=>{el.classList.add('motion-pending');observer.observe(el)});
  // Safety fallback: no content remains hidden if an embedded scroll container confuses intersection.
  window.setTimeout(()=>nodes.forEach(el=>{el.classList.add('motion-visible')}),1400);
 }
 function refresh(){
  const path=window.YX?.route?.()||'';
  const content=root.firstElementChild;
  const sig=path+'|'+(content?.className||'');
  if(!content)return;
  if(sig!==lastSignature || !root.classList.contains('motion-page-enter')){
   lastSignature=sig;
   root.classList.remove('motion-page-enter');void root.offsetWidth;
   root.classList.add('motion-page-enter');
   initMotion();
  }
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh()})}
 new MutationObserver(schedule).observe(root,{childList:true,subtree:false});
 const title=document.getElementById('page-subtitle');if(title)new MutationObserver(schedule).observe(title,{childList:true});
 // Ripple is decorative and only responds to user clicks; stop before submitting or modifying handlers.
 root.addEventListener('pointerdown',ev=>{
  if(noMotion.matches||ev.pointerType==='touch')return;
  const target=ev.target.closest('button,.common-func-item,.home-news-item');
  if(!target||!root.contains(target))return;
  if(!target.matches('button,.common-func-item'))return;
  const rect=target.getBoundingClientRect();
  if(rect.width>360||rect.height>140)return;
  if(getComputedStyle(target).position==='static')target.style.position='relative';
  if(getComputedStyle(target).overflow==='visible')target.style.overflow='hidden';
  const span=document.createElement('span');span.className='cue-ripple';
  span.style.left=(ev.clientX-rect.left-17)+'px';span.style.top=(ev.clientY-rect.top-17)+'px';
  target.appendChild(span);span.addEventListener('animationend',()=>span.remove(),{once:true});
 });
 // Micro-parallax only inside the home banner: mouse motion never changes navigation or click targets.
 root.addEventListener('pointermove',ev=>{
  if(noMotion.matches||ev.pointerType==='touch')return;
  const banner=ev.target.closest('.greet-hello');if(!banner)return;
  const r=banner.getBoundingClientRect();const frac=(ev.clientX-r.left)/Math.max(1,r.width);
  banner.style.setProperty('--studio-shift',((frac-.5)*16).toFixed(1)+'px');
 },{passive:true});
 noMotion.addEventListener?.('change',schedule);
 schedule();
})();
