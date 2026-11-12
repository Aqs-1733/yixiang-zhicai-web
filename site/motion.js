/* Motion is progressive enhancement. It never hides content or intercepts business input. */
(() => {
 'use strict';const root=document.getElementById('yx-render'),scroll=document.getElementById('main-scroll');if(!root)return;
 const preference=matchMedia('(prefers-reduced-motion: reduce)'),seen=new Set();let owner=null,scheduled=false,observer=null;let visibleModals=new Set();
 const active=new Set();
 function animate(el,frames,options){if(preference.matches||!el.animate)return;const a=el.animate(frames,options);active.add(a);a.finished.catch(()=>{}).finally(()=>active.delete(a));return a}
 function refresh(){
  scheduled=false;const next=window.YX?.getPage?.();if(next!==owner){owner=next;seen.clear();observer?.disconnect();observer=null;for(const a of active)a.cancel();active.clear();if(!preference.matches)animate(root,[{translate:'0 5px'},{translate:'0 0'}],{duration:220,easing:'ease-out'})}
  if(preference.matches)return;
  observer?.disconnect();observer=new IntersectionObserver(entries=>{let stagger=0;for(const en of entries)if(en.isIntersecting){const key=en.target.dataset.motionKey;if(!seen.has(key)){seen.add(key);animate(en.target,[{translate:'0 8px'},{translate:'0 0'}],{duration:450,delay:Math.min(stagger++*45,180),easing:'cubic-bezier(.22,1,.36,1)'})}observer.unobserve(en.target)}},{root:scroll,threshold:.04});
  for(const el of root.querySelectorAll('[data-pattern],.chat-row,.history-item,.analysis-product-card,.recognized-ledger-card,.analysis-box')){
   const key=YX.route()+'|'+(el.dataset.yxKey||el.className);el.dataset.motionKey=key;if(!seen.has(key))observer.observe(el);
  }
  const nextModals=new Set();for(const el of root.querySelectorAll('.add-panel,.edit-panel,.detail-panel,.lesson-picker-panel,.message-dialog,.history-panel,.term-popup-card')){
   if(el.getBoundingClientRect().height<5||getComputedStyle(el).visibility==='hidden'||getComputedStyle(el).display==='none')continue;
   const key='modal|'+(el.dataset.yxKey||el.className)+'|'+(el.classList.contains('panel-show')?'shown':'open');
   nextModals.add(key);if(!visibleModals.has(key)){animate(el,[{opacity:.5,translate:'0 16px',scale:.985},{opacity:1,translate:'0 0',scale:1}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'})}
  }
  visibleModals=nextModals;
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(refresh)}}
 root.addEventListener("yx:render",schedule);
 root.addEventListener('pointerdown',e=>{
  if(preference.matches||e.button!==0)return;const moving=e.target.closest('.term-popup-card,.guide-dialog');if(moving)for(const a of moving.getAnimations())a.cancel();const b=e.target.closest('button');if(!b||b.disabled||b.matches('.yx-switch,.yx-map-marker,.avatar-btn,.register-avatar'))return;const r=b.getBoundingClientRect();if(r.width>450||r.height>150)return;
  const dot=document.createElement('span');dot.className='pattern-ripple';dot.setAttribute('aria-hidden','true');dot.style.left=(e.clientX-r.left)+'px';dot.style.top=(e.clientY-r.top)+'px';if(getComputedStyle(b).position==='static')b.style.position='relative';b.style.overflow='hidden';b.append(dot);
  const a=animate(dot,[{scale:0,opacity:.5},{scale:Math.max(r.width,r.height)/8,opacity:0}],{duration:520,easing:'ease-out'});a?.finished.then(()=>dot.remove(),()=>dot.remove());
 },{passive:true});
 preference.addEventListener('change',()=>{if(preference.matches){observer?.disconnect();for(const a of root.getAnimations({subtree:true}))a.cancel();for(const a of active)a.cancel();active.clear()}schedule()});
 window.YXMotion={refresh:schedule,get activeCount(){return active.size},get reduced(){return preference.matches}};schedule();
})();
