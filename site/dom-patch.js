/* Keep native media, form focus and scroll containers connected across setData. */
(() => {
 'use strict';
 const preserved=new Set(['data-pattern','data-pattern-interactive','data-pattern-tabs','data-motion-key','data-flow-art','data-premium-active']);
 function dispose(node){
  if(node.nodeType!==1)return;
  for(const el of [node,...node.querySelectorAll('video,.yx-map')]){
   if(el.tagName==='VIDEO'){el.pause();window.YXMedia?.destroy(el)}
   if(el.__yxMap)el.__yxMap.destroy();
  }
 }
 const key=n=>n.nodeType===1?n.getAttribute('data-yx-key'):null;
 const decoration=n=>n?.nodeType===1&&n.hasAttribute('data-yx-decoration');
 const nextSource=n=>{while(decoration(n))n=n.nextSibling;return n};
 const compatible=(a,b)=>a&&a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&(!['INPUT'].includes(a.tagName)||a.type===b.type));
 function patchNode(old,fresh){
  if(old.nodeType===3){if(old.data!==fresh.data)old.data=fresh.data;return}
  if(old.nodeType!==1)return;
  const isVideo=old.tagName==='VIDEO',source=isVideo&&(fresh.dataset.yxSource||fresh.getAttribute('src'));
  const sameSource=isVideo&&(old.dataset.yxSource||old.getAttribute('src'))===source;
  for(const attr of [...old.attributes])if(!fresh.hasAttribute(attr.name)&&!preserved.has(attr.name)&&!(isVideo&&attr.name==='src'&&sameSource))old.removeAttribute(attr.name);
  for(const attr of [...fresh.attributes]){
   if(isVideo&&sameSource&&attr.name==='src')continue; // MSE owns the blob URL.
   if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  }
  old.__yxSetBindings?.(fresh.__yxBindingState);
  if(['INPUT','TEXTAREA','SELECT'].includes(old.tagName)){
   if(old.tagName==='SELECT')patchChildren(old,fresh);
   if(old.value!==fresh.value)old.value=fresh.value;
   if('checked' in old&&old.checked!==fresh.checked)old.checked=fresh.checked;
   if('disabled' in old)old.disabled=fresh.disabled;
   return;
  }
  if(isVideo){
   if(!sameSource){window.YXMedia?.destroy(old);old.dataset.yxSource=source;old.src=source;window.YXMedia?.mount(old)}
   return;
  }
  if(fresh.__yxMapOptions){
   if(JSON.stringify(old.__yxMapOptions)!==JSON.stringify(fresh.__yxMapOptions)){
    old.__yxMap?.destroy();old.__yxMap=null;old.replaceChildren();old.__yxMapOptions=fresh.__yxMapOptions;
   }
   return;
  }
  patchChildren(old,fresh);
 }
 function patchChildren(parent,freshParent){
  const children=[...parent.childNodes],byKey=new Map(children.filter(key).map(n=>[key(n),n])),used=new Set();let cursor=nextSource(parent.firstChild);
  for(const fresh of [...freshParent.childNodes]){
   const k=key(fresh);let current=k?byKey.get(k):cursor;
   if(!compatible(current,fresh)||used.has(current)||(!k&&key(current)))current=null;
   if(current){patchNode(current,fresh);if(current!==cursor)parent.insertBefore(current,cursor)}
   else {current=fresh;parent.insertBefore(current,cursor)}
   used.add(current);cursor=nextSource(current.nextSibling);
  }
  for(const node of [...parent.childNodes])if(!used.has(node)&&!decoration(node)){dispose(node);node.remove()}
 }
 window.YXDOM={patch:patchChildren,dispose};
})();
