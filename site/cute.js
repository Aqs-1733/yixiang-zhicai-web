/* 仅装饰与快捷导航：不修改原页面的数据、请求与业务函数。 */
(() => {
  'use strict';
  const go = path => window.YX?.goto?.(path, 'navigate');
  function enhance() {
    const hero = document.querySelector('#yx-render .greet-hello');
    if (hero && !hero.querySelector('.cute-hero-actions')) {
      const row = document.createElement('div');
      row.className = 'cute-hero-actions';
      const specs = [
        ['💬 问小享', 'pages/assistant/assistant'],
        ['🛡️ 理财识别', 'pages/finance/finance']
      ];
      specs.forEach(([label,path])=>{
        const b=document.createElement('button');
        b.type='button';b.textContent=label;
        b.addEventListener('click',e=>{e.stopPropagation();go(path)});
        row.appendChild(b);
      });
      hero.appendChild(row);
    }
  }
  function init() {
    const logo = document.querySelector('.identity-logo');
    if(logo) logo.innerHTML='<img src="assets/cute/mascot.webp" alt="小享" />';
    const side=document.querySelector('.side-deco');
    if(side) side.innerHTML='<img class="cute-side-mascot" src="assets/cute/mascot.webp" alt="" aria-hidden="true"/>';
    const art=document.querySelector('.login-graphic img');
    if(art){art.src='assets/cute/elderly.webp';art.alt='卡通爷爷奶奶微笑相伴';}
    const main=document.getElementById('yx-render');
    if(main){const observer=new MutationObserver(enhance);main.addEventListener("yx:render",enhance);enhance();}
    const copyright=document.querySelector('.content-footer');
    if(copyright) copyright.innerHTML='颐享智财 · 守护您的养老生活 <span>仅提供信息辅助与风险提醒，不提供实际资金交易。</span>';
    const full=document.querySelector('.login-art h1');
    if(full) full.innerHTML='让养老生活<br><em>更安心、更开心。</em>';
    const loginCopy=document.querySelector('.login-art p');
    if(loginCopy) loginCopy.textContent='小享陪您记账、看理财、识风险，家人也能一起关心您。';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
