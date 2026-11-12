/* Reusable view patterns decorate original nodes; data and business handlers stay intact. */
(() => {
 'use strict';
 const root=document.getElementById('yx-render');if(!root)return;
 const patterns={
  cover:'.greet-hello',editorial:'.home-news-card',weather:'.home-weather-card',course:'.lesson-card',services:'.common-func-panel',
  feature:'.common-func-item,.quick-card,.access-item',stat:'.m-summary,.metric',workbench:'.recognize-card,.track-card,.advice-card',
  ledger:'.totals-card,.record-line,.position-item',care:'.health-life-card,.med-item',identity:'.top-card,.data-card,.analysis-card',
  directory:'.phone-item,.place-card,.nearby-entry-card',family:'.family-card,.elder-card,.family-dashboard-card,.guard-card',
  child:'.child-weather-card,.child-news-card,.child-card',form:'.q-card,.register-card,.login-card'
 };
 const tabState=new Map();let scheduled=false;
 function enhance(){
  scheduled=false;
  for(const [name,selector]of Object.entries(patterns))for(const el of root.querySelectorAll(selector)){el.dataset.pattern=name;if(el.matches('button,[role=button]')||el.querySelector('button')===null&&el.matches('.common-func-item,.track-item,.place-card,.record-line'))el.dataset.patternInteractive='true'}
  for(const tabs of root.querySelectorAll('.finance-mode-tabs,.ledger-scope-tabs,.money-mode-tabs')){
   tabs.dataset.patternTabs='true';const buttons=[...tabs.children].filter(x=>x.tagName==='BUTTON'),active=buttons.find(x=>x.classList.contains('active'));if(!active)continue;
   for(const b of buttons)b.setAttribute('aria-pressed',String(b===active));
   const key=YX.route()+'|'+(tabs.dataset.yxKey||tabs.className),x=active.offsetLeft,w=active.offsetWidth,old=tabState.get(key);
   let bar=tabs.querySelector('.pattern-active-indicator');if(!bar){bar=document.createElement('span');bar.className='pattern-active-indicator';bar.setAttribute('aria-hidden','true');tabs.prepend(bar)}
   bar.style.left=x+'px';bar.style.width=w+'px';
   if(old&&Math.abs(old.x-x)>2&&!matchMedia('(prefers-reduced-motion: reduce)').matches)bar.animate([{left:old.x+'px',width:old.w+'px'},{left:x+'px',width:w+'px'}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'});
   tabState.set(key,{x,w});
  }
  const hero=root.querySelector('.greet-hello');if(hero&&!hero.querySelector('.pattern-name')){const nodes=[...hero.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()),text=nodes.map(n=>n.textContent).join('').trim(),comma=text.indexOf('，');if(comma>=0){const heading=document.createElement('div'),hello=document.createElement('span'),name=document.createElement('span');heading.className='pattern-hero-heading';hello.className='pattern-greeting';hello.textContent=text.slice(0,comma+1);name.className='pattern-name';name.textContent=text.slice(comma+1);heading.append(hello,name);for(const n of nodes)n.remove();hero.prepend(heading)}}
  const paths=['<path d="M5 5c10-1 16 5 14 12-7 2-13-4-14-12Z"/><path d="m6 18 9-9"/>','<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="3"/>','<circle cx="15" cy="4" r="2"/><path d="m9 10 3-3 4 4 4 1M12 7l-2 8-5 5M10 15l5 2 1 4M4 12l5-2"/>'];
  root.querySelectorAll('.health-life-actions>button').forEach((b,i)=>{if(b.querySelector('.pattern-function-icon'))return;const icon=document.createElement('span');icon.className='pattern-function-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[i%3]+'</svg>';b.prepend(icon)});
  // Browser profile editing does not depend on a WeChat nickname API.
  for(const input of root.querySelectorAll('input[type=text]'))if(input.placeholder==='点击获取微信昵称')input.placeholder='请输入昵称';
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(enhance)}}
 root.addEventListener("yx:render",schedule);addEventListener('resize',schedule);
 window.YXPatterns={names:Object.keys(patterns),refresh:schedule};schedule();
})();
