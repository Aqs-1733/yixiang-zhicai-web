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
    if(logo) logo.innerHTML='<img src="assets/brand/xiaoxiang-original.png" alt="小享" />';
    const side=document.querySelector('.side-deco');
    if(side) side.innerHTML='<img class="cute-side-mascot" src="assets/brand/xiaoxiang-original.png" alt="" aria-hidden="true"/>';
    const art=document.querySelector('.login-graphic img');
    if(art){art.src='assets/cute/elderly.webp';art.alt='卡通爷爷奶奶微笑相伴';}
    const main=document.getElementById('yx-render');
    if(main){const observer=new MutationObserver(enhance);main.addEventListener("yx:render",enhance);enhance();}
    const copyright=document.querySelector('.content-footer');
    if(copyright) copyright.remove();
    const full=document.querySelector('.login-art h1');
    if(full) full.innerHTML='记账、看资讯<br><em>也能和家人聊聊。</em>';
    const loginCopy=document.querySelector('.login-art p');
    if(loginCopy) loginCopy.textContent='记收支、查路线、看资讯，也可以给家人发消息。';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
