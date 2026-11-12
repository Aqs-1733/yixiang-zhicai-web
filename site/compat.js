/* 颐享智财 Web 兼容层：直接复用原小程序 Page/Component/数据逻辑，替换 wx 原生能力。 */
(() => {
'use strict';
const $ = (s,root=document)=>root.querySelector(s);
const storePrefix='yixiang_v3_';
const fileMap=new Map();
const moduleCache=new Map(), pageDefs=new Map(), componentDefs=new Map();
let appDef=null, page=null, stack=[], activePath='', activeParameters={}, updatePending=false;
let registering='', voiceStream=null, voiceRecorder=null, audioUrl='';
const timers=new Set();
const pages=[
 ['pages/index/index','首页概览','house'], ['pages/assistant/assistant','问小享','sparkles'],
 ['pages/finance/finance','钱生钱 · 识别','shield-check'], ['pages/money/money','管钱钱 · 账本','notebook-pen'],
 ['pages/family/family','家庭协同','heart-handshake'], ['pages/family-messages/family-messages','家庭留言','message-square'],
 ['pages/family-group-chat/family-group-chat','家庭群聊','messages-square'], ['pages/health/health','健康与提醒','heart-pulse'],
 ['pages/service/service','常用电话','phone'], ['pages/nearby/nearby','附近服务','map-pin'],
 ['pages/profile/profile','个人画像','user-round'], ['pages/questionnaire/questionnaire','风险测评','clipboard-check'],
 ['pages/news-detail/news-detail','政策与资讯','newspaper'],
 ['pages/child/index/index','子女端首页','house'],['pages/child/elder-list/elder-list','绑定长辈','users'],
 ['pages/child/elder-dashboard/elder-dashboard','长辈概览','layout-dashboard'],
 ['pages/child/bind/bind','家庭绑定','link'],['pages/child/positions/positions','理财持仓','chart-no-axes-combined'],
 ['pages/child/ledger/ledger','家庭账本','book-open'],['pages/child/alerts/alerts','安全提醒','bell-ring'],
 ['pages/child/health/health','长辈健康','activity'],['pages/child/location/location','位置关怀','map'],
 ['pages/child/weekly/weekly','家庭周报','calendar-days'],['pages/child/permissions/permissions','授权管理','lock-keyhole'],
 ['pages/child/assist/assist','远程协助','hand-heart'],['pages/child/profile/profile','子女资料','contact'],
 ['pages/login/login','账号登录','log-in'], ['pages/register/register','注册账号','user-plus'],
 ['pages/forgot-password/forgot-password','找回密码','key-round'],['pages/security-question/security-question','密保验证','shield-question']
];
const pageName=Object.fromEntries(pages.map(([p,n])=>[p,n]));
const authPaths=new Set(['pages/login/login','pages/register/register','pages/forgot-password/forgot-password','pages/security-question/security-question']);
const childPaths=new Set(pages.filter(([p])=>p.startsWith('pages/child/')).map(x=>x[0]));
const activeList = (p)=> childPaths.has(p)||storageGet('role')==='child' ? pages.filter(([x])=>childPaths.has(x) || x==='pages/assistant/assistant'||x==='pages/family/family'||x==='pages/family-group-chat/family-group-chat'||x==='pages/family-messages/family-messages') : pages.filter(([x])=>!childPaths.has(x)&&!authPaths.has(x));
function storageGet(k){try{const session=k==='token'?sessionStorage.getItem(storePrefix+k):null;const v=session===null?localStorage.getItem(storePrefix+k):session;return v===null?'':JSON.parse(v)}catch{return ''}}
function storageSet(k,v){try{const encoded=JSON.stringify(v);localStorage.setItem(storePrefix+k,encoded);if(k==='token')sessionStorage.setItem(storePrefix+k,encoded);if(k==='rememberLoginUntil'&&!Number(v)&&sessionStorage.getItem(storePrefix+'token'))localStorage.removeItem(storePrefix+'token')}catch(e){console.warn('Local storage',e)}}
function storageRemove(k){localStorage.removeItem(storePrefix+k);sessionStorage.removeItem(storePrefix+k)}
function storageClear(){for(const st of [localStorage,sessionStorage])Object.keys(st).filter(k=>k.startsWith(storePrefix)).forEach(k=>st.removeItem(k))}
function normalizeUrl(s){let p=String(s||'').replace(/^\//,'');return p.replace(/\.js$/,'')}
function pathModule(parent,relative){if(!relative.startsWith('.'))return relative; const seg=parent.split('/');seg.pop();for(const x of relative.split('/')){if(x==='..')seg.pop();else if(x!=='.')seg.push(x)}return seg.join('/')+(relative.endsWith('.js')?'':'.js')}
function loadModule(path){if(!path.endsWith('.js'))path+='.js';if(moduleCache.has(path))return moduleCache.get(path).exports;
  const fn=window.__yx_modules?.[path]; if(!fn){console.warn('Source module not found:',path);return {}};
  const m={exports:{}};moduleCache.set(path,m);const old=registering;registering=path;
  try{fn(rel=>loadModule(pathModule(path,rel)),m,m.exports)}catch(e){console.error('Original module failed:',path,e);recordError(path+': '+e.message)}finally{registering=old}return m.exports;
}
window.App=(config)=>{appDef=config;window.__yx_app=config;};
window.Page=(config)=>pageDefs.set(registering.replace(/\.js$/,''),config);
window.Component=(config)=>componentDefs.set(registering.replace(/\.js$/,''),config);
window.getApp=()=>appDef || {};
window.getCurrentPages=()=>stack.map(x=>x.instance).filter(Boolean).concat(page?.instance?[page.instance]:[]);
function assignByPath(obj,k,v){const parts=String(k).replace(/\[(\d+)\]/g,'.$1').split('.');let x=obj;for(let i=0;i<parts.length-1;i++){const key=parts[i];if(x[key]===undefined||x[key]===null)x[key]=/^\d+$/.test(parts[i+1])?[]:{};x=x[key]}x[parts.at(-1)]=v;}
function createInstance(cfg,isComponent=false){const instance={data:structuredClone(cfg.data||{}),properties:{},__config:cfg,__isComponent:isComponent,_components:new Map(),setData(patch,done){if(!patch)return;for(const [k,v] of Object.entries(patch))assignByPath(this.data,k,v);refresh();if(done)queueMicrotask(done)},triggerEvent(){}};
 for(const [k,v] of Object.entries(cfg)){if(typeof v==='function')instance[k]=v.bind(instance)}
 for(const [k,v] of Object.entries(cfg.methods||{}))if(typeof v==='function')instance[k]=v.bind(instance);
 return instance;}
// Browser entries retain the original Page instance, including form/component state.
let routeSerial=0, routeEntry=null, activeGesture=null;
const routeEntries=new Map();
function snapshotRoute(){if(routeEntry&&page)routeEntries.set(routeEntry,{page,stack:[...stack]})}
function unloadPage(p){if(!p)return;try{p.instance.onUnload?.()}catch(e){console.warn(e)}for(const comp of p.instance._components.values())try{comp.__config?.lifetimes?.detached?.call(comp)}catch(e){console.warn(e)}}
function goto(href,kind='navigate'){
 const [raw,q='']=String(href).split('?'),path=normalizeUrl(raw);
 if(!pageName[path]){toast('尚未定义页面：'+path);return}
 const params=Object.fromEntries(new URLSearchParams(q));snapshotRoute();activeGesture=null;recorderManager.cancel();
 if(page){try{page.instance.onHide?.()}catch(e){console.warn(e)}if(kind==='navigate')stack.push(page);else unloadPage(page)}
 if(kind==='relaunch'){for(const old of stack)unloadPage(old);stack=[];routeEntries.clear()}
 const prev=page;page=null;activePath=path;activeParameters=params;
 if(!pageDefs.has(path))loadModule(path+'.js');const cfg=pageDefs.get(path);
 if(!cfg){recordError('页面不存在:'+path);return}
 const instance=createInstance(cfg);instance.route=path;instance.options=params;
 page={path,params,instance,oldPage:prev};routeEntry=++routeSerial;
 const hash=`#/${path}${q?'?'+q:''}`;
 history[kind==='navigate'?'pushState':'replaceState']({yxEntry:routeEntry},'',hash);snapshotRoute();
 document.title=(pageName[path]||'颐享智财')+' · 颐享智财';
 updateShell();refreshImmediate();try{instance.onLoad?.(params);if(page?.instance===instance)instance.onShow?.()}catch(e){console.error('Page initialization failed:',path,e);recordError(path+' 初始化:'+e.message)}refresh();
 $('#main-scroll')?.scrollTo(0,0);
}
function back(delta=1){if(stack.length)history.go(-Math.min(Math.max(1,Number(delta)||1),stack.length));else goto(storageGet('role')==='child'?'pages/child/index/index':'pages/index/index','redirect')}
function restoreBrowserRoute(){
 const target=location.hash.replace(/^#\//,'');if(!target||!pageName[target.split('?')[0]])return;
 if(!storageGet('token')&&!authPaths.has(target.split('?')[0])){goto('pages/login/login','relaunch');return}
 if(history.state?.yxEntry===routeEntry&&target===activePath+(Object.keys(activeParameters).length?'?'+new URLSearchParams(activeParameters):''))return;
 const saved=routeEntries.get(history.state?.yxEntry);snapshotRoute();activeGesture=null;
 if(saved){try{page?.instance.onHide?.()}catch(e){}page=saved.page;stack=[...saved.stack];routeEntry=history.state.yxEntry;activePath=page.path;activeParameters=page.params;document.title=(pageName[page.path]||'颐享智财')+' · 颐享智财';updateShell();refreshImmediate();page.instance.onShow?.();refresh()}
 else goto(target,'history');
}
addEventListener('popstate',restoreBrowserRoute);addEventListener('hashchange',restoreBrowserRoute);
function eventPayload(node,type,original){
 const dataset={};for(const [k,v] of Object.entries(node.dataset||{}))if(k!=='yxKey')dataset[k]=v;
 let value=original?.target?.value;if(type==='change'&&node.tagName==='INPUT'&&node.type==='checkbox')value=!!node.checked;
 if(type==='change'&&node.tagName==='SELECT')value=String(node.value);
 const detail={value,source:'web',...(typeof original?.detail==='object'?original.detail:{})};
 if(node.tagName==='VIDEO')Object.assign(detail,{currentTime:node.currentTime||0,duration:Number.isFinite(node.duration)?node.duration:0,width:node.videoWidth,height:node.videoHeight,fullScreen:document.fullscreenElement===node});
 const touch=original&&'clientX' in original?{identifier:original.pointerId||0,clientX:original.clientX,clientY:original.clientY,pageX:original.pageX,pageY:original.pageY}:null;
 return {type,timeStamp:Date.now(),detail,markerId:detail.markerId,target:{dataset},currentTarget:{dataset},changedTouches:original?.changedTouches||(touch?[touch]:[]),touches:original?.touches||(touch&&!['touchend','touchcancel'].includes(type)?[touch]:[]),preventDefault(){original?.preventDefault?.()},stopPropagation(){original?.stopPropagation?.()}};
}
const nativeEvents={tap:'click',input:'input',change:'change',blur:'blur',focus:'focus',confirm:'keydown',longpress:'contextmenu',touchstart:'pointerdown',touchend:'pointerup',touchcancel:'pointercancel',touchmove:'pointermove',markertap:'markertap',scroll:'scroll',error:'error',chooseavatar:'chooseavatar',play:'play',pause:'pause',ended:'ended',timeupdate:'timeupdate',fullscreenchange:'fullscreenchange',loadedmetadata:'loadedmetadata'};
function callBinding(binding,node,owner,e){if(binding.type==='blur'&&node.__yxMoving)return;if(binding.type==='confirm'&&e.key!=='Enter')return;if(binding.type==='longpress')e.preventDefault();if(binding.catch)e.stopPropagation();try{owner[binding.handler](eventPayload(node,binding.type,e))}catch(ex){console.error(ex);recordError((page?.path||'')+':'+binding.handler+' '+ex.message)}}
function bindEvents(origin,el,owner,scope){
 const bindings=[];for(const attr of [...origin.attributes]){const m=attr.name.match(/^(bind|catch)(?::)?([a-z]+)$/);if(m&&nativeEvents[m[2]]){const handler=asText(interpolated(attr.value,scope));if(typeof owner?.[handler]==='function')bindings.push({type:m[2],handler,catch:m[1]==='catch'})}}
 const installed=new Set();
 el.__yxSetBindings=state=>{
  el.__yxBindingState=state||{bindings:[],owner};
  for(const binding of el.__yxBindingState.bindings){const name=nativeEvents[binding.type];if(installed.has(name))continue;installed.add(name);
   el.addEventListener(name,e=>{const state=el.__yxBindingState;for(const b of state.bindings.filter(x=>nativeEvents[x.type]===name)){
    if(['touchmove','touchend','touchcancel'].includes(b.type)&&activeGesture?.id===e.pointerId)continue;
    if(b.type==='touchstart'){activeGesture={id:e.pointerId,node:el,owner:state.owner,bindings:state.bindings};if(state.bindings.some(x=>x.type==='touchmove'))el.style.touchAction='none'}
    callBinding(b,el,state.owner,e);
   }},{passive:false});
  }
 };
 el.__yxSetBindings({bindings,owner});
 if(bindings.some(x=>x.type==='touchmove'))el.style.touchAction='none';
 const tap=bindings.find(x=>x.type==='tap');if(tap&&(el.tagName!=='SPAN'||el.dataset.term)){el.dataset.yxAction=tap.handler;if(!['BUTTON','INPUT','TEXTAREA','SELECT','A'].includes(el.tagName)){el.setAttribute('role',el.tagName==='SPAN'?'link':'button');el.tabIndex=0;el.addEventListener('keydown',e=>{if(e.target===el&&['Enter',' '].includes(e.key)){e.preventDefault();el.click()}})}}
}

for(const [event,type] of [['pointermove','touchmove'],['pointerup','touchend'],['pointercancel','touchcancel']])document.addEventListener(event,e=>{
 const g=activeGesture;if(!g||g.id!==e.pointerId)return;
 for(const b of g.bindings.filter(x=>x.type===type))callBinding(b,g.node,g.owner,e);
 if(type!=='touchmove')activeGesture=null;
},{passive:false});
function wxBoolean(v){return v!==false&&v!==null&&v!==undefined&&v!==0&&v!=='false'&&v!=='0'}
const exprCache=new Map();
function evalExpr(raw,scope){const str=String(raw||'').replace(/^\s*\{\{/,'').replace(/\}\}\s*$/,'').trim();if(!str)return '';
 try{let fn=exprCache.get(str);if(!fn){fn=new Function('$ctx','with($ctx){return ('+str+')}');exprCache.set(str,fn)}return fn(scope)}catch(e){return undefined;}}
function interpolated(input,scope){const s=String(input??'');if(/^\s*\{\{[\s\S]*\}\}\s*$/.test(s)&&s.indexOf('}}')===s.lastIndexOf('}}'))return evalExpr(s,scope);
 return s.replace(/\{\{([\s\S]*?)\}\}/g,(_,ex)=>{let v=evalExpr(ex,scope);return v===undefined||v===null?'':typeof v==='object'?JSON.stringify(v):String(v)})}
function asText(s){return s===undefined||s===null?'':String(s)}
function condition(node,scope){return !!evalExpr(node.getAttribute('wx:if'),scope)}
function transformChildren(parent,into,owner,scope,key){const nodes=[...parent.childNodes];let branches=false;
 nodes.forEach((node,i)=>{if(node.nodeType===1){if(node.hasAttribute('wx:if')){branches=condition(node,scope);if(!branches)return;}else if(node.hasAttribute('wx:elif')){if(branches)return;branches=!!evalExpr(node.getAttribute('wx:elif'),scope);if(!branches)return;}else if(node.hasAttribute('wx:else')){if(branches)return;branches=true;}else branches=false;}else if(node.nodeType===3&&node.textContent.trim())branches=false;
 const childKey=key+'/'+i;
 if(node.nodeType===3){const text=interpolated(node.textContent,scope);if(text!==undefined&&text!==null)into.append(document.createTextNode(asText(text)));return;}
 if(node.nodeType!==1)return;
 if(node.hasAttribute('wx:for')){
  let arr=interpolated(node.getAttribute('wx:for'),scope);if(typeof arr==='number')arr=Array.from({length:arr},(_,k)=>k);if(!Array.isArray(arr))arr=arr&&typeof arr==='object'?Object.values(arr):[];
  const itemName=node.getAttribute('wx:for-item')||'item';const indexName=node.getAttribute('wx:for-index')||'index';
  arr.forEach((val,j)=>{const s=Object.create(scope);s[itemName]=val;s[indexName]=j;renderOne(node,into,owner,s,childKey+':'+j) });return;
 }
 renderOne(node,into,owner,scope,childKey);
 });
}
function renderOne(node,into,owner,scope,key){let tag=node.tagName.toLowerCase();
 if(tag==='block'||tag==='template'){transformChildren(node,into,owner,scope,key);return}
 if(tag.includes('-')&&!['scroll-view','rich-text','swiper-item','movable-area','movable-view'].includes(tag)&&componentDefs.has('components/'+tag+'/'+tag)||tag==='voice-input'||tag==='term-popups'||tag==='child-bottom-nav'||tag==='family-message-modal'||tag==='family-care-modal'){
  renderComponent(node,into,owner,scope,key,tag);return;
 }
 const convert={'view':'div','text':'span','scroll-view':'div','image':'img','picker':'select','switch':'button','radio':'input','radio-group':'div','checkbox':'input','checkbox-group':'div','rich-text':'div','map':'div','swiper':'div','swiper-item':'div','icon':'span','navigator':'a','block':'div'};
 const pickerMode=tag==='picker'?asText(interpolated(node.getAttribute('mode')||'selector',scope)):'';
 const el=document.createElement(tag==='picker'&&['time','date'].includes(pickerMode)?'input':convert[tag]||tag);el.setAttribute('data-yx-key',key);
 if(tag==='view'||tag==='scroll-view')el.classList.add('yx-view');
 if(tag==='text')el.classList.add('yx-text');
 if(tag==='scroll-view')el.classList.add('yx-scroll');
 if(tag==='map')el.classList.add('yx-map');
 for(const a of [...node.attributes]){
  const attr=a.name; if(attr.startsWith('wx:')||attr.startsWith('bind')||attr.startsWith('catch')||['hover-class','placeholder-class','scroll-y','scroll-x','show-scrollbar','enhanced','mode','range','range-key','selector','checked','value','password','type','maxlength'].includes(attr))continue;
  let val=interpolated(a.value,scope);if(val===undefined||val===null)continue;
  if(attr==='class')el.className+=' '+String(val);else if(attr==='style')el.setAttribute('style',String(val).replace(/(-?(?:\d*\.)?\d+)rpx\b/g,'calc($1 * var(--yx-rpx))'));
  else if(['disabled','hidden','controls','autoplay','loop','muted','multiple','required','readonly'].includes(attr)){const enabled=wxBoolean(val);if(enabled)el.setAttribute(attr,'');else el.removeAttribute(attr);if(attr==='muted')el.muted=enabled;}
  else if(attr.startsWith('data-'))el.setAttribute(attr,asText(val));
  else if(attr==='src'&&tag==='image')el.src=assetUrl(String(val));
  else if(attr==='src'&&tag==='video'){const src=assetUrl(String(val));el.dataset.yxSource=src;if(!/\.m3u8(?:[?#]|$)/i.test(src)||el.canPlayType('application/vnd.apple.mpegurl'))el.src=src;}
  else if(attr==='src')el.setAttribute(attr,assetUrl(String(val)));
  else if(attr==='id')el.id=asText(val);
  else if(attr==='url'&&tag==='navigator')el.href='#/'+String(val).replace(/^\//,'');
  else if(/^[a-z\-]+$/.test(attr))el.setAttribute(attr,asText(val));
 }
 if(el.matches('.term-popup-card,.guide-dialog'))for(const prop of ['left','top'])if(el.style[prop])el.style.setProperty(prop,`calc(${el.style[prop]} + var(${prop==='left'?'--yx-panel-offset':'--yx-panel-top'},0px))`,'important');
 if(tag==='image'){if(!el.getAttribute('src'))el.src=assetUrl(asText(interpolated(node.getAttribute('src'),scope)));el.loading='lazy';el.alt=node.getAttribute('alt')||'';}
 if(tag==='input'||tag==='textarea'){
  if(tag==='input'){const t=node.getAttribute('type')||'';el.type=node.getAttribute('password')==='true'?'password':t==='number'?'tel':t==='digit'?'number':'text';const max=node.getAttribute('maxlength');if(max!==null&&Number(max)>0)el.maxLength=Number(max);}
  const val=interpolated(node.getAttribute('value')||'',scope);if(val!==undefined&&val!==null)el.value=String(val);
  el.placeholder=asText(interpolated(node.getAttribute('placeholder')||'',scope));
 }
 if(tag==='switch'){
  el.type='button';el.className+=' yx-switch';el.setAttribute('role','switch');
  const checked=node.hasAttribute('checked')&&wxBoolean(interpolated(node.getAttribute('checked'),scope));
  el.setAttribute('aria-checked',String(checked));el.setAttribute('aria-label',asText(interpolated(node.getAttribute('aria-label')||'',scope))||node.parentElement?.textContent?.replace(/\{\{.*?\}\}/g,'').trim().slice(0,60)||'开关');
  el.style.setProperty('--switch-color',asText(interpolated(node.getAttribute('color')||'#f2b632',scope)));
  const track=document.createElement('span');track.className='yx-switch-track';const thumb=document.createElement('span');thumb.className='yx-switch-thumb';track.append(thumb);el.append(track);
  el.addEventListener('click',()=>{const value=el.getAttribute('aria-checked')!=='true';el.setAttribute('aria-checked',String(value));el.dispatchEvent(new CustomEvent('change',{detail:{value}}))});
 }
 if(tag==='checkbox'||tag==='radio'){
  el.type=tag==='checkbox'?'checkbox':'radio';el.className+=' yx-'+tag;el.checked=node.hasAttribute('checked')&&wxBoolean(interpolated(node.getAttribute('checked'),scope));el.value=asText(interpolated(node.getAttribute('value')||'',scope));
 }
 if(tag==='picker'){
  el.className+=' yx-picker';const val=interpolated(node.getAttribute('value')||'0',scope);
  if(['time','date'].includes(pickerMode)){el.type=pickerMode;el.value=asText(val);el.className+=' yx-native-date';for(const [a,b]of [['start','min'],['end','max']])if(node.hasAttribute(a))el.setAttribute(b,asText(interpolated(node.getAttribute(a),scope)))}
  else{const arr=interpolated(node.getAttribute('range')||'',scope);if(Array.isArray(arr)){const rangeKey=node.getAttribute('range-key');arr.forEach((v,j)=>{const op=document.createElement('option');op.value=String(j);op.textContent=asText(rangeKey?v[rangeKey]:v);el.append(op)});el.value=String(val||0)}else{const op=document.createElement('option');op.textContent=asText(interpolated(node.textContent,scope)).trim()||'请选择';op.value='';el.append(op)}}
 }
 if(tag==='rich-text'){const rich=interpolated(node.getAttribute('nodes')||'',scope);el.textContent=Array.isArray(rich)?rich.map(x=>x.text||'').join(''):asText(rich)}
 if(tag==='map'){
  const options={};for(const a of ['latitude','longitude','scale','markers'])options[a]=interpolated(node.getAttribute(a)||'',scope);
  // Reuse a map across setData; do not refetch tiles or lose a user's pan position.
  el.__yxMapOptions=options;
 }
 if(tag==='button'){el.type='button';if(node.getAttribute('open-type')?.toLowerCase()==='chooseavatar')el.addEventListener('click',()=>chooser({count:1,mediaType:['image'],success:r=>{if(r.tempFilePaths?.[0])el.dispatchEvent(new CustomEvent('chooseavatar',{detail:{avatarUrl:r.tempFilePaths[0]}}))}}));}
 if(tag==='video'){if(!node.hasAttribute('controls'))el.controls=true;el.playsInline=true;el.preload='metadata';const poster=interpolated(node.getAttribute('poster')||'',scope)||(el.id==='homeLessonVideo'?owner?.data?.lesson?.video_poster:'');if(poster)el.poster=assetUrl(poster);}
 if(tag==='scroll-view'){el.style.overflowY=node.hasAttribute('scroll-y')?'auto':'';el.style.overflowX=node.hasAttribute('scroll-x')?'auto':'';}
 bindEvents(node,el,owner,scope);
 if(tag!=='map'&&tag!=='image'&&tag!=='input'&&tag!=='switch'&&tag!=='checkbox'&&tag!=='radio'&&tag!=='rich-text'&&tag!=='picker')transformChildren(node,el,owner,scope,key);
 if(tag==='radio-group'){el.setAttribute('role','radiogroup');for(const radio of el.querySelectorAll('input[type=radio]'))radio.name='yx-radio-'+key}
 if(tag==='scroll-view'&&node.hasAttribute('scroll-into-view')){const id=asText(interpolated(node.getAttribute('scroll-into-view'),scope));if(id)queueMicrotask(()=>el.querySelector('[id="'+CSS.escape(id)+'"]')?.scrollIntoView({block:'nearest'}))}
 if(tag==='navigator')el.addEventListener('click',e=>{e.preventDefault();goto(el.getAttribute('href')?.replace('#/','')||'pages/index/index')});
 into.append(el);
}
function renderComponent(node,into,parent,scope,key,tag){const path='components/'+tag+'/'+tag;
 if(!componentDefs.has(path))loadModule(path+'.js');const cfg=componentDefs.get(path);if(!cfg){console.warn('Missing component:',tag);return;}
 let instance=page?.instance?._components?.get(key);let isNew=!instance;
 if(!instance){instance=createInstance(cfg,true);if(page?.instance)page.instance._components.set(key,instance);}
 const p={};for(const [name,def] of Object.entries(cfg.properties||{}))p[name]=def?.value;
 for(const a of [...node.attributes])if(!a.name.startsWith('bind')&&!a.name.startsWith('catch')&&!a.name.startsWith('wx:')&&!['class','style'].includes(a.name)){
 const camel=a.name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());p[camel]=interpolated(a.value,scope);
 }
 instance.__parent=parent;instance.properties=p;
 instance.triggerEvent=(name,detail)=>{const h=node.getAttribute('bind:'+name)||node.getAttribute('bind'+name);if(h&&typeof parent[h]==='function')parent[h]({detail:detail||{},currentTarget:{dataset:{}},target:{dataset:{}}})};
 for(const [k,v] of Object.entries(p)){
  const prior=instance.__prevProperties?.[k];if(JSON.stringify(prior)!==JSON.stringify(v)){
   const obs=cfg.properties?.[k]?.observer;
   if(typeof obs==='function')try{obs.call(instance,v,prior)}catch(e){console.warn('Observer',e)}
  }
 }
 instance.__prevProperties=structuredClone(p);
 const data={...instance.data,...instance.properties};
 const scoped=Object.assign(Object.create(scope),data);
 const source=window.__yx_templates?.[path];if(source){const doc=parsedTemplate(source);const wrapper=document.createElement('div');wrapper.className='yx-component yx-component-'+tag;if(node.hasAttribute('class'))wrapper.className+=' '+asText(interpolated(node.getAttribute('class'),scope));transformChildren(doc.body,wrapper,instance,scoped,key);into.append(wrapper)}
 if(isNew){try{cfg.lifetimes?.attached?.call(instance);cfg.attached?.call(instance);cfg.lifetimes?.ready?.call(instance)}catch(e){console.warn('Component attach',tag,e)}}
}
function assetUrl(v){if(!v)return '';if(window.__yx_asset_data&&window.__yx_asset_data[v])return window.__yx_asset_data[v];if(v.startsWith('data:')||v.startsWith('blob:')||v.startsWith('http')||v.startsWith('//'))return v;
 if(v.startsWith('/assets/'))return './'+v.slice(1);
 if(v.startsWith('/media/'))return v;
 return v;
}
function refresh(){if(updatePending)return;updatePending=true;queueMicrotask(()=>{updatePending=false;refreshImmediate()})}
function parsedTemplate(s){return new DOMParser().parseFromString(String(s).replace(/<([A-Za-z][\w-]*)([^<>]*?)\s*\/>/g, (_,name,attrs)=>['input','img','br','hr'].includes(name.toLowerCase())?`<${name}${attrs}>`:`<${name}${attrs}></${name}>`),'text/html')}
function refreshImmediate(){const dest=$('#yx-render');if(!dest||!page)return;
 const sameOwner=dest.__yxOwner===page.instance;dest.dataset.route=page.path;
 const focus=document.activeElement;const focusKey=dest.contains(focus)?focus?.getAttribute('data-yx-key'):null;const cursor=focusKey&&['INPUT','TEXTAREA'].includes(focus?.tagName)?[focus.selectionStart,focus.selectionEnd]:null;
 const scrolls=[...dest.querySelectorAll('.yx-scroll')].map(el=>[el.getAttribute('data-yx-key'),el.scrollTop,el.scrollLeft]).filter(x=>x[1]||x[2]);
 const source=window.__yx_templates?.[page.path];if(!source){recordError('页面模板缺失：'+page.path);return}
 const doc=parsedTemplate(source);const frag=document.createDocumentFragment();const scope=Object.create(null);Object.assign(scope,page.instance.data);scope.$page=page.instance;
 try{transformChildren(doc.body,frag,page.instance,scope,page.path)}catch(e){console.error('WXML rendering failed',e);recordError('渲染失败：'+e.message)}
 // Patch the original keyed tree in place. Reparenting an HTMLVideoElement, even
 // reusing the same object, aborts playback and retriggers metadata/time events.
 if(sameOwner&&window.YXDOM)window.YXDOM.patch(dest,frag);
 else {for(const el of [...dest.children])window.YXDOM?.dispose(el);dest.replaceChildren(frag)}
 dest.__yxOwner=page.instance;

 for(const video of dest.querySelectorAll('video')){window.YXMedia?.mount(video);if(!video.poster)video.poster='assets/illustrations/classroom.svg'}
 for(const el of dest.querySelectorAll('input,textarea,select'))el.__yxMoving=false;
 for(const host of dest.querySelectorAll('.yx-map'))if(!host.__yxMap)host.__yxMap=window.YXMaps?.mount(host,host.__yxMapOptions);

 for(const [key,y,x] of scrolls){const el=[...dest.querySelectorAll('.yx-scroll')].find(x=>x.getAttribute('data-yx-key')===key);if(el){el.scrollTop=y;el.scrollLeft=x}}
 if(focusKey){const match=[...dest.querySelectorAll('input,textarea,select,button')].find(x=>x.getAttribute('data-yx-key')===focusKey);if(match){match.focus({preventScroll:true});if(cursor){try{match.setSelectionRange(...cursor)}catch{}}}}
 dest.dispatchEvent(new CustomEvent('yx:render',{detail:{route:page.path,sameOwner}}));
 $('#page-subtitle').textContent=pageName[page.path]||'颐享智财';
 document.documentElement.dataset.role=childPaths.has(activePath)||storageGet('role')==='child'?'child':'elder';
}
function updateShell(){const auth=authPaths.has(activePath);const role=childPaths.has(activePath)||storageGet('role')==='child'?'child':'elder';document.body.classList.toggle('is-auth',auth);
 $('#role-label').textContent=role==='child'?'子女关怀端':'长辈安心端';
 const nav=$('#main-nav');nav.innerHTML='';
 const navItems=auth?[]:activeList(activePath);
 const cats=role==='child'?['首页与家人','账本与资产','生活与安全','账户与设置']:['日常首页','理财与财务','家庭与生活','我的账户'];
 navItems.forEach(([path,name,icon],i)=>{if(i===0||i===4||i===9||i===13){const label=document.createElement('div');label.className='nav-section';label.textContent=cats[i===0?0:i===4?1:i===9?2:3]||'常用功能';nav.append(label)}
 const el=document.createElement('button');el.className='nav-item'+(path===activePath?' active':'');el.type='button';el.innerHTML='<span class="nav-icon">'+(iconSymbols[icon]||'✦')+'</span><span>'+name+'</span>';
 el.onclick=()=>goto(path,'redirect');nav.append(el)});
 const mob=$('#mobile-nav');mob.innerHTML='';
 const items=role==='child'?pages.filter(([p])=>['pages/child/index/index','pages/child/elder-list/elder-list','pages/child/alerts/alerts','pages/child/profile/profile'].includes(p)):pages.filter(([p])=>['pages/index/index','pages/assistant/assistant','pages/finance/finance','pages/money/money','pages/profile/profile'].includes(p));
 items.forEach(([path,name,icon])=>{const b=document.createElement('button');b.className=(activePath===path?' active':'');b.innerHTML=`<span>${iconSymbols[icon]||'✦'}</span><small>${name.split(' · ')[0]}</small>`;b.onclick=()=>goto(path,'redirect');mob.append(b)});
 $('#side-nav').style.display=auth?'none':'';
 $('#login-chrome').style.display=auth?'':'none';
 $('#top-head').classList.toggle('auth-head',auth);
}
const ICON_PATHS={
 'house':'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 'sparkles':'<path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z"/><path d="m19 17 .7 1.3L21 19l-1.3.7L19 21l-.7-1.3L17 19l1.3-.7z"/>',
 'shield-check':'<path d="m12 22 7.5-4.2V6L12 2 4.5 6v11.8z"/><path d="m8.3 12 2.4 2.5 5-5"/>',
 'notebook-pen':'<path d="M5 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 3v18M10 8h6M10 13h4"/>',
 'heart-handshake':'<path d="M10.2 19.8 3.7 13.4a5 5 0 0 1 7-7l1.3 1.3 1.3-1.3a5 5 0 0 1 7 7l-6.5 6.4a2.4 2.4 0 0 1-3.6 0Z"/><path d="m9 12 3 3 3-3"/>',
 'message-square':'<path d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"/><path d="M7 9h9M7 13h6"/>',
 'messages-square':'<path d="M18 9a4 4 0 0 1 4 4v8l-4-3h-5a4 4 0 0 1-4-4v-1"/><path d="M16 10a4 4 0 0 1-4 4H7l-5 3V6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4z"/>',
 'heart-pulse':'<path d="m20 13.5-7.3 7-7.6-7.2a5.3 5.3 0 1 1 7.6-7.4 5.3 5.3 0 0 1 7.8 7.4"/><path d="M2 12h5l2-4 3 8 2-4h8"/>',
 'phone':'<path d="M5 2h4l2 5-3 2a16 16 0 0 0 7 7l2-3 5 2v4a3 3 0 0 1-3 3C10 22 2 14 2 5a3 3 0 0 1 3-3"/>',
 'map-pin':'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 'user-round':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 'clipboard-check':'<rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="m9 15 2 2 4-4"/>',
 'newspaper':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h7M7 12h7M7 16h4M17 8h1v7h-1"/>',
 'users':'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1"/>',
 'layout-dashboard':'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>',
 'link':'<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
 'chart-no-axes-combined':'<path d="M3 20V4M3 20h18M6 16l5-6 4 3 5-8"/><path d="M16 5h4v4"/>',
 'book-open':'<path d="M12 7C9 5 6 5 3 6v14c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1Zm0 0v14"/>',
 'bell-ring':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4M3 4 1 6M21 4l2 2"/>',
 'activity':'<path d="M2 12h4l3-7 4 14 3-7h6"/>',
 'map':'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
 'calendar-days':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/>',
 'lock-keyhole':'<rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1"/>',
 'hand-heart':'<path d="M12 21 3 16v-5a3 3 0 0 1 3-3h4M12 21l9-5v-5a3 3 0 0 0-3-3h-4M12 14 7 9a3 3 0 0 1 5-4 3 3 0 0 1 5 4z"/>',
 'contact':'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 18a5 5 0 0 1 10 0"/>',
 'log-in':'<path d="M10 17l5-5-5-5M15 12H3M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
 'user-plus':'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v7M15.5 11.5h7"/>',
 'key-round':'<circle cx="8" cy="9" r="5"/><path d="M12 13 21 22M16 17l3-3"/>',
 'shield-question':'<path d="m12 22 8-5V6l-8-4-8 4v11z"/><path d="M9.5 9a2.5 2.5 0 1 1 4.1 2l-1.6 1.5V14M12 18h.01"/>'
};
const iconSvg=(name)=>'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON_PATHS[name]||ICON_PATHS.sparkles)+'</svg>';
const iconSymbols=Object.fromEntries(Object.keys(ICON_PATHS).map(name=>[name,iconSvg(name)]));
function recordError(s){const issues=JSON.parse(sessionStorage.getItem('yx_errors')||'[]');issues.push({time:new Date().toISOString(),text:s});sessionStorage.setItem('yx_errors',JSON.stringify(issues.slice(-100)));$('#error-indicator').title=s}
function toast(s){const box=$('#toast');box.textContent=String(s||'操作已完成');box.classList.add('show');clearTimeout(box._tid);box._tid=setTimeout(()=>box.classList.remove('show'),3600)}
function loading(on,label='正在处理'){const el=$('#loading-overlay');el.classList.toggle('hidden',!on);el.querySelector('span').textContent=label}
function dialog({title='温馨提示',content='',showCancel=true,confirmText='确定',cancelText='取消',editable=false,placeholderText='',success}){
 const mask=$('#dialog-overlay');const previousFocus=document.activeElement;
 $('#dialog-title').textContent=title;$('#dialog-desc').textContent=content;
 mask.querySelector('#dialog-input')?.remove();
 let input=null;
 if(editable){input=document.createElement('input');input.id='dialog-input';input.type='text';input.value=content;input.placeholder=placeholderText;input.setAttribute('aria-label',placeholderText||title);input.style.cssText='box-sizing:border-box;width:100%;padding:12px;border:1px solid #b4c8bc;border-radius:12px;font:inherit;color:#25382d;background:#fff';$('#dialog-desc').after(input)}
 const ok=$('#dialog-okay'),no=$('#dialog-cancel');ok.textContent=confirmText;no.textContent=cancelText;no.hidden=!showCancel;mask.classList.remove('hidden');
 return new Promise(resolve=>{
  function finish(confirmed){mask.classList.add('hidden');ok.removeEventListener('click',yes);no.removeEventListener('click',n);mask.removeEventListener('keydown',key);const result={confirm:confirmed,cancel:!confirmed,...(editable?{content:input.value}:{})};input?.remove();previousFocus?.focus?.({preventScroll:true});success?.(result);resolve(result)}
  function yes(){finish(true)}function n(){finish(false)}function key(e){if(e.key==='Escape'&&showCancel)n();if(e.key==='Enter'&&editable)yes()}
  ok.addEventListener('click',yes);no.addEventListener('click',n);mask.addEventListener('keydown',key);(input||ok).focus();
 });
}
function chooser(opts={}){const input=document.createElement('input');input.type='file';input.accept=opts.type==='video'?'video/*':opts.mediaType?.includes('video')?'image/*,video/*':'image/*';input.multiple=(opts.count||1)>1;input.hidden=true;document.body.append(input);
 input.onchange=()=>{const files=[...input.files];const result=files.map(f=>{const url=URL.createObjectURL(f);fileMap.set(url,f);return {tempFilePath:url,path:url,size:f.size,fileType:f.type.startsWith('video')?'video':'image',file:f}});input.remove();opts.success?.({tempFiles:result,tempFilePaths:result.map(x=>x.path)})};input.click();}
const recorderClients=new Map();
function recorderClient(){
 const id=(registering||page?.path||'app').replace(/\.js$/,'');
 if(!recorderClients.has(id)){
  const client={id,__listenersReady:false,_listeners:{},onStart(fn){this._listeners.start=fn},onStop(fn){this._listeners.stop=fn},onError(fn){this._listeners.error=fn},start(options){recorderManager._consumer=this;return recorderManager.start(options)},stop(){if(recorderManager._consumer===this)recorderManager.stop()}};
  recorderClients.set(id,client);
 }
 return recorderClients.get(id);
}
function recorderEmit(consumer,type,value){consumer?._listeners?.[type]?.(value)}
async function toWav(blob){const buf=await blob.arrayBuffer();const ctx=new (window.AudioContext||window.webkitAudioContext)();try{const decoded=await ctx.decodeAudioData(buf.slice(0));const rate=16000;const outLen=Math.ceil(decoded.duration*rate);const wav=new ArrayBuffer(44+outLen*2);const view=new DataView(wav);const str=(p,s)=>{for(let i=0;i<s.length;i++)view.setUint8(p+i,s.charCodeAt(i))};str(0,'RIFF');view.setUint32(4,36+outLen*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,outLen*2,true);for(let i=0;i<outLen;i++){const sample=decoded.getChannelData(0)[Math.min(decoded.length-1,Math.floor(i*decoded.sampleRate/rate))]||0;view.setInt16(44+i*2,Math.max(-1,Math.min(1,sample))*32767,true)}return new Blob([wav],{type:'audio/wav'})}finally{ctx.close()}}
const recorderManager={
 async start({duration=30000}={}){
  if(this._pending||voiceRecorder?.state==='recording')return;
  const generation=(this._generation||0)+1;this._generation=generation;this._pending=true;this._stopRequested=false;const consumer=this._consumer;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('需要 localhost 或 HTTPS 才能使用麦克风');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(this._generation!==generation||this._stopRequested){stream.getTracks().forEach(t=>t.stop());return}
   voiceStream=stream;const recorder=new MediaRecorder(stream);voiceRecorder=recorder;let chunks=[];
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());try{let blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});try{blob=await toWav(blob)}catch(e){console.warn('WAV conversion',e)}const key=URL.createObjectURL(blob);fileMap.set(key,new File([blob],blob.type.includes('wav')?'voice.wav':'voice.webm',{type:blob.type}));if(this._generation===generation)recorderEmit(consumer,'stop',{tempFilePath:key,duration:Date.now()-this._started})}catch(e){recorderEmit(consumer,'error',{errMsg:e.message})}finally{if(voiceRecorder===recorder)voiceRecorder=null}};
   recorder.onerror=e=>{stream.getTracks().forEach(t=>t.stop());recorderEmit(consumer,'error',{errMsg:e.error?.message||'录音失败'})};
   recorder.start();this._started=Date.now();recorderEmit(consumer,'start');clearTimeout(this._timer);this._timer=setTimeout(()=>this.stop(),duration);
  }catch(e){recorderEmit(consumer,'error',{errMsg:e.message});toast('麦克风不可用：'+e.message)}finally{if(this._generation===generation)this._pending=false}
 },
 cancel(){this._generation=(this._generation||0)+1;this._pending=false;this.stop()},
 stop(){clearTimeout(this._timer);this._stopRequested=true;if(voiceRecorder?.state==='recording')voiceRecorder.stop()}

};
function getReqURL(url,data,method){if(/^https?:\/\//.test(url)&&url.includes('yixiangzhicai.com'))url=window.location.origin+new URL(url).pathname+new URL(url).search;
 if((method||'GET').toUpperCase()==='GET'&&data&&typeof data==='object'&&Object.keys(data).length){let u=new URL(url,location.href);for(const [k,v]of Object.entries(data))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));return u.toString()}return url}
const wx={
 getStorageSync:storageGet,setStorageSync:storageSet,removeStorageSync:storageRemove,clearStorageSync:storageClear,hasActiveBrowserSession:token=>{try{return JSON.parse(sessionStorage.getItem(storePrefix+'token'))===token}catch{return false}},
 getAccountInfoSync:()=>({miniProgram:{envVersion:'develop',appId:'wx-web-adapter'}}),getSystemInfoSync:()=>({platform:'devtools',windowWidth:innerWidth,windowHeight:innerHeight,system:'Web',screenWidth:screen.width,screenHeight:screen.height}),
 request(opts){const method=String(opts.method||'GET').toUpperCase();const headers=opts.header||{};const url=getReqURL(opts.url,opts.data,method);
 const init={method,headers:{...headers}};if(method!=='GET'&&method!=='HEAD')init.body=typeof opts.data==='string'?opts.data:JSON.stringify(opts.data||{});
 const controller=new AbortController();init.signal=controller.signal;const tm=setTimeout(()=>controller.abort(),opts.timeout||20000);
 fetch(url,init).then(async res=>{const ct=res.headers.get('content-type')||'';const data=ct.includes('json')?await res.json():ct.includes('audio')?await res.blob():await res.text();opts.success?.({statusCode:res.status,data,header:Object.fromEntries(res.headers.entries()),errMsg:'request:ok'})}).catch(e=>opts.fail?.({errMsg:'request:fail '+e.message})).finally(()=>{clearTimeout(tm);opts.complete?.()});
 },
 uploadFile(opts){const f=fileMap.get(opts.filePath);if(!f){opts.fail?.({errMsg:'未找到本地文件，请重新选择'});opts.complete?.();return}const form=new FormData();form.append(opts.name||'file',f,f.name||'image.jpg');for(const[k,v]of Object.entries(opts.formData||{}))form.append(k,v);const headers={...(opts.header||{})};delete headers['content-type'];delete headers['Content-Type'];const url=getReqURL(opts.url,null,'POST');fetch(url,{method:'POST',body:form,headers}).then(async r=>opts.success?.({statusCode:r.status,data:await r.text()})).catch(e=>opts.fail?.({errMsg:e.message})).finally(()=>opts.complete?.())},
 showToast:({title})=>toast(title),hideToast:()=>$('#toast').classList.remove('show'),showModal:dialog,showLoading:({title})=>loading(true,title),hideLoading:()=>loading(false),
 showActionSheet:({itemList=[],success,fail})=>{const host=$('#action-sheet');host.innerHTML='';itemList.forEach((x,i)=>{const b=document.createElement('button');b.textContent=x;b.onclick=()=>{host.classList.add('hidden');success?.({tapIndex:i})};host.append(b)});const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>{host.classList.add('hidden');fail?.({errMsg:'cancel'})};host.append(cancel);host.classList.remove('hidden')},
 navigateTo:({url,success})=>{goto(url);success?.()},redirectTo:({url,success})=>{goto(url,'redirect');success?.()},reLaunch:({url,success})=>{goto(url,'relaunch');success?.()},switchTab:({url})=>goto(url,'redirect'),navigateBack:({delta=1}={})=>back(delta),
 chooseMedia:chooser,chooseImage:(opts)=>chooser({...opts,mediaType:['image']}),
 setClipboardData:({data,success})=>navigator.clipboard?.writeText(String(data)).then(()=>{toast('已复制');success?.()}).catch(()=>{toast('复制失败，请手动选择文字')}),
 vibrateShort:()=>navigator.vibrate?.(50),previewImage:({urls=[],current})=>{const u=current||urls[0];if(u)window.open(assetUrl(u),'_blank')},
 makePhoneCall:({phoneNumber})=>{if(phoneNumber)window.location.href='tel:'+phoneNumber},
 getRecorderManager:()=>recorderClient(),
 createInnerAudioContext:()=>{const audio=new Audio();return {set src(x){audio.src=assetUrl(x)},get src(){return audio.src},set obeyMuteSwitch(x){},set autoplay(x){audio.autoplay=x},play:()=>audio.play().catch(()=>{}),pause:()=>audio.pause(),stop:()=>{audio.pause();audio.currentTime=0},destroy:()=>audio.pause(),onError:fn=>audio.addEventListener('error',fn),onEnded:fn=>audio.addEventListener('ended',fn),onPlay:fn=>audio.addEventListener('play',fn),onStop:fn=>audio.addEventListener('pause',fn)}},
 async getSetting({success,fail}){const authSetting={};for(const [key,name] of [['scope.record','microphone'],['scope.userLocation','geolocation']]){try{const result=await navigator.permissions.query({name});if(result.state!=='prompt')authSetting[key]=result.state==='granted'}catch{}}success?.({authSetting})},authorize:({scope,success,fail})=>{if(scope==='scope.record')navigator.mediaDevices?.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());success?.()}).catch(fail);else success?.()},openSetting:({success})=>{toast('请使用浏览器地址栏的权限设置');success?.({authSetting:{}})},
 getLocation:opts=>window.YXMaps.locate(opts),
 chooseLocation:opts=>window.YXMaps.choose(opts),
 openLocation:opts=>window.YXMaps.navigate(opts),
 navigateToMiniProgram:()=>dialog({title:'网页模式说明',content:'此操作需要在微信小程序中打开，浏览器版保留入口但无法调用微信跳转。',showCancel:false}),
 login:({fail})=>fail?.({errMsg:'微信小程序免密授权仅在微信内可用，请使用手机号和密码登录网页。'}),
 createVideoContext:(id)=>({play:()=>document.getElementById(id)?.play(),pause:()=>document.getElementById(id)?.pause(),seek:time=>{const el=document.getElementById(id);if(el)el.currentTime=time}}),
 addPhoneCalendar:({title,startTime,description='',alarm=false,alarmOffset=0,success,fail})=>{try{
 const date=typeof startTime==='number'?new Date(startTime*(startTime<1e12?1000:1)):new Date(startTime);if(!Number.isFinite(date.getTime()))throw Error('提醒时间无效');
 const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const esc=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,'\\$&');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yixiang//Medication//ZH','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@yixiang.local','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(date),'DTEND:'+stamp(new Date(date.getTime()+600000)),'SUMMARY:'+esc(title||'提醒'),'DESCRIPTION:'+esc(description)];
 if(/^吃药/.test(title||''))lines.push('RRULE:FREQ=DAILY');if(alarm)lines.push('BEGIN:VALARM','TRIGGER:-PT'+Math.max(0,Number(alarmOffset)||0)+'M','ACTION:DISPLAY','DESCRIPTION:'+esc(title||'提醒'),'END:VALARM');lines.push('END:VEVENT','END:VCALENDAR');
 const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='颐享智财提醒.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);success?.({errMsg:'addPhoneCalendar:ok'})
 }catch(e){fail?.({errMsg:e.message})}},
 getFileSystemManager:()=>({readFile:({filePath,encoding,success,fail})=>{const file=fileMap.get(filePath);if(!file){fail?.({errMsg:'找不到文件'});return}file.arrayBuffer().then(buf=>{const binary=new Uint8Array(buf);let s='';for(let i=0;i<binary.length;i+=8192)s+=String.fromCharCode(...binary.subarray(i,i+8192));success?.({data:encoding==='base64'?btoa(s):buf})}).catch(fail)}})
};
window.wx=wx;
document.addEventListener('visibilitychange',()=>{if(document.hidden)recorderManager.stop()});
function clearSession(){for(const key of ['token','user','profile','rememberLoginUntil','wechatPasswordFreeUntil'])wx.removeStorageSync(key);Object.assign(appDef.globalData,{token:'',user:null,profile:null})}
function switchRole(){clearSession();goto('pages/login/login','relaunch');toast('请在登录页选择长辈或子女账号登录')}
function firstVisit(){const hp=location.hash.replace(/^#\//,'');if(hp&&pageName[hp.split('?')[0]]&&(storageGet('token')||authPaths.has(hp.split('?')[0])))return hp;
 if(storageGet('token'))return storageGet('role')==='child'?'pages/child/index/index':'pages/index/index';return 'pages/login/login'}
function auditBindings(){const missing=[],unsupported=[];let declarations=0,pagesCount=0,componentsCount=0;for(const path of Object.keys(window.__yx_templates||{}))if(!pageDefs.has(path)&&!componentDefs.has(path))loadModule(path+'.js');
 for(const [path,source] of Object.entries(window.__yx_templates||{})){
  if(!pageDefs.has(path)&&!componentDefs.has(path))loadModule(path+'.js');
  const cfg=pageDefs.get(path)||componentDefs.get(path);if(!cfg)continue;
  if(path.startsWith('pages/'))pagesCount++;else componentsCount++;
  const handlers={...cfg,...cfg.methods},doc=parsedTemplate(source);
  for(const el of doc.querySelectorAll('*'))for(const a of el.attributes){const match=a.name.match(/^(bind|catch)(?::)?([a-z]+)$/);if(!match)continue;declarations++;
   const names=a.value.includes('{{')?[...a.value.matchAll(/['"]([A-Za-z_$][\w$]*)['"]/g)].map(m=>m[1]):[a.value];
   for(const name of names)if(typeof handlers[name]!=='function')missing.push({path,event:match[2],handler:name});
   if(!nativeEvents[match[2]]&&!componentDefs.has('components/'+el.tagName.toLowerCase()+'/'+el.tagName.toLowerCase()))unsupported.push({path,event:match[2],tag:el.tagName});
  }
 }
 return {pages:pagesCount,components:componentsCount,declarations,missing,unsupported};
}
window.YX={goto,back,pages,auditBindings,getPage:()=>page?.instance,route:()=>activePath,errors:()=>JSON.parse(sessionStorage.getItem('yx_errors')||'[]'),navigate:goto};
function bootstrap(){loadModule('app.js');appDef.globalData.baseUrl=location.origin;try{appDef.onLaunch?.()}catch(e){recordError('App.onLaunch '+e.message)}
 // Avoid mini-program hard-coded HTTPS host when running locally; keep data under same-origin API.
 appDef.globalData.baseUrl=location.origin;
 storageSet('baseUrl',location.origin);
 $('#logo-click').onclick=()=>goto(storageGet('role')==='child'?'pages/child/index/index':'pages/index/index','redirect');
 $('#nav-mobile-toggle').onclick=()=>document.body.classList.toggle('nav-open');
 $('#nav-scrim').onclick=()=>document.body.classList.remove('nav-open');
 $('#roleswitch').onclick=switchRole;
 $('#logout-top').onclick=()=>{clearSession();goto('pages/login/login','relaunch')};
 $('#font-change').onclick=()=>{const f=appDef.cycleGlobalFontSize?.();const mode=f?.mode||'normal';document.documentElement.dataset.font=mode;toast('已切换为 '+(f?.label||'标准字'));refresh()};
 $('#site-search').addEventListener('input',e=>{const key=e.target.value.trim();for(const b of $('#main-nav').querySelectorAll('button'))b.hidden=!!key&&!b.textContent.includes(key)});
 goto(firstVisit(),'relaunch');}
 const boot=()=>Promise.resolve(window.YXRelease?.ready).then(redirected=>{if(!redirected)bootstrap()});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
