/* Original transparent senior-couple artwork, shared consistently across modules. */
(() => {
 'use strict';const root=document.getElementById('yx-render');
 const copy={finance:['看清产品信息，再决定','理财识别'],money:['查看收支，也可以拍照记账','收支账本'],family:['绑定家人，设置共享范围','家庭协同'],health:['记录身体情况和用药时间','健康记录'],service:['常用电话和附近服务','生活服务'],nearby:['查找地点，查看怎么走','附近服务'],'family-messages':['给家人留句话','家庭留言'],'family-group-chat':['给家人发条消息','家庭群聊'],'news-detail':['查看最近的政策和新闻','政策资讯']};
 function decorate(){
  const route=window.YX?.route?.()||'',key=route.split('/')[1],data=copy[key];if(!data)return;
  const host=root.firstElementChild;if(!host||host.querySelector(':scope>.module-welcome'))return;
  const card=document.createElement('section');card.className='module-welcome module-welcome-'+key;card.dataset.yxDecoration='true';card.setAttribute('aria-label',data[1]);
  const text=document.createElement('div'),tag=document.createElement('span'),title=document.createElement('h2'),art=document.createElement('img');tag.textContent=data[1];title.textContent=data[0];text.append(tag,title);const scenes={finance:'ledger',money:'ledger',family:'chat',health:'health',service:'nearby',nearby:'nearby','family-messages':'chat','family-group-chat':'chat','news-detail':'ledger'};art.src='assets/flow/seniors-'+scenes[key]+'.png';art.width=320;art.height=280;art.decoding='async';art.alt='';art.setAttribute('aria-hidden','true');card.append(text,art);host.prepend(card);
 }
 root.addEventListener('yx:render',decorate);decorate();
})();
