/* Original transparent senior-couple artwork, shared consistently across modules. */
(() => {
 'use strict';const root=document.getElementById('yx-render');
 const copy={finance:['读懂风险，再作决定','理财小课堂'],money:['把每一笔钱，记得明明白白','安心小账本'],family:['一家人的关心，随时送达','家庭协同'],health:['照顾好自己，也让家人安心','健康每一天'],service:['常用帮助，一眼就能找到','贴心生活'],nearby:['走得明白，出门更安心','身边的服务'],'family-messages':['想说的话，随时告诉家人','家庭留言'],'family-group-chat':['一家人，聊在一起','家庭群聊'],'news-detail':['重要的消息，不错过','政策与资讯']};
 function decorate(){
  const route=window.YX?.route?.()||'',key=route.split('/')[1],data=copy[key];if(!data)return;
  const host=root.firstElementChild;if(!host||host.querySelector(':scope>.module-welcome'))return;
  const card=document.createElement('section');card.className='module-welcome module-welcome-'+key;card.dataset.yxDecoration='true';card.setAttribute('aria-label',data[1]);
  const text=document.createElement('div'),tag=document.createElement('span'),title=document.createElement('h2'),art=document.createElement('img');tag.textContent=data[1];title.textContent=data[0];text.append(tag,title);art.src='assets/flow/elder-couple.png';art.alt='';art.setAttribute('aria-hidden','true');card.append(text,art);host.prepend(card);
 }
 root.addEventListener('yx:render',decorate);decorate();
})();
