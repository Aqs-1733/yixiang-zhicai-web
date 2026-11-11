/* WXML map + chooseLocation. All provider requests are authenticated and same-origin. */
(() => {
 'use strict';
 const cache=new Map();
 const project=(lat,lng,z)=>{const size=256*2**z,s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return {x:(lng+180)/360*size,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*size}};
 const unproject=(x,y,z)=>{const size=256*2**z;return {latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI,longitude:x/size*360-180}};
 async function imageURL(lat,lng,z,w,h,signal){
  const url='/lbs/static-map?'+new URLSearchParams({latitude:lat,longitude:lng,zoom:z,width:w,height:h});
  if(cache.has(url))return cache.get(url);
  const r=await fetch(url,{signal,headers:{Authorization:'Bearer '+wx.getStorageSync('token')}});if(!r.ok)throw Error('地图加载失败');
  const value=URL.createObjectURL(await r.blob());cache.set(url,value);if(cache.size>40){const key=cache.keys().next().value;URL.revokeObjectURL(cache.get(key));cache.delete(key)}return value;
 }
 function mount(host,options){
  const state={latitude:Number(options.latitude)||39.12,longitude:Number(options.longitude)||117.2,zoom:Math.max(4,Math.min(18,Number(options.scale)||14))};
  host.classList.add('yx-real-map');const image=document.createElement('img');image.className='yx-map-image';image.alt='地图';image.draggable=false;
  const overlay=document.createElement('div');overlay.className='yx-map-markers';
  const controls=document.createElement('div');controls.className='yx-map-controls';
  const status=document.createElement('button');status.type='button';status.className='yx-map-status';status.textContent='地图加载中';status.hidden=true;
  const credit=document.createElement('span');credit.className='yx-map-credit';credit.textContent='腾讯地图';
  host.append(image,overlay,controls,status,credit);let size={width:640,height:360},controller=null,drag=null,dragged=false;
  function points(){overlay.replaceChildren();const center=project(state.latitude,state.longitude,state.zoom);for(const m of options.markers||[]){if(!Number.isFinite(Number(m.latitude))||!Number.isFinite(Number(m.longitude)))continue;const p=project(Number(m.latitude),Number(m.longitude),state.zoom),x=(p.x-center.x+size.width/2)/size.width*100,y=(p.y-center.y+size.height/2)/size.height*100;if(x<0||x>100||y<0||y>100)continue;const b=document.createElement('button');b.type='button';b.className='yx-map-marker';b.textContent=m.id===1?'●':'📍';b.title=m.title||m.callout?.content||'地点';b.setAttribute('aria-label',b.title);b.style.left=x+'%';b.style.top=y+'%';b.addEventListener('click',e=>{e.stopPropagation();host.dispatchEvent(new CustomEvent('markertap',{detail:{markerId:m.id}}))});overlay.append(b)}}
  async function paint(){controller?.abort();controller=new AbortController();const rect=host.getBoundingClientRect();size={width:Math.max(280,Math.min(1000,Math.round(rect.width)||640)),height:Math.max(180,Math.min(800,Math.round(rect.height)||360))};points();status.hidden=true;try{const url=await imageURL(state.latitude,state.longitude,state.zoom,size.width,size.height,controller.signal);if(!controller.signal.aborted)image.src=url}catch(e){if(e.name!=='AbortError'){status.hidden=false;status.textContent='重新加载地图'}}}
  function button(text,label,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.addEventListener('click',e=>{e.stopPropagation();action()});controls.append(b)}
  button('+','放大地图',()=>{state.zoom=Math.min(18,state.zoom+1);paint()});button('−','缩小地图',()=>{state.zoom=Math.max(4,state.zoom-1);paint()});
  status.onclick=()=>paint();host.style.touchAction='none';
  image.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,center:project(state.latitude,state.longitude,state.zoom)};dragged=false;image.setPointerCapture(e.pointerId)});
  image.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;image.style.transform=`translate(${dx}px,${dy}px)`});
  image.addEventListener('pointerup',e=>{if(!drag)return;const rect=image.getBoundingClientRect(),dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(dragged){Object.assign(state,unproject(drag.center.x-dx,drag.center.y-dy,state.zoom));paint()}else if(options.select){const r=host.getBoundingClientRect();options.select(unproject(drag.center.x+(e.clientX-r.left-r.width/2),drag.center.y+(e.clientY-r.top-r.height/2),state.zoom))}drag=null;image.style.transform=''});
  image.addEventListener('pointercancel',()=>{drag=null;image.style.transform=''});
  const resize=new ResizeObserver(()=>paint());resize.observe(host);
  return {state,center(p){Object.assign(state,p);paint()},destroy(){controller?.abort();resize.disconnect()}};
 }
 async function choose(options={}){
  const previous=document.activeElement,cover=document.createElement('div');cover.className='yx-location-cover';cover.setAttribute('role','dialog');cover.setAttribute('aria-modal','true');cover.setAttribute('aria-label','选择位置');
  cover.innerHTML='<section class="yx-location-dialog"><header><h2>选择位置</h2><button type="button" class="location-cancel" aria-label="关闭">×</button></header><form class="yx-location-search"><input aria-label="搜索地址" placeholder="输入街道、小区或城市地址"><button>查找</button></form><div class="yx-location-map"></div><div class="yx-location-selected" role="status"></div><footer><button type="button" class="location-current">当前位置</button><button type="button" class="location-confirm">确定位置</button></footer></section>';
  document.body.append(cover);const status=cover.querySelector('.yx-location-selected'),confirm=cover.querySelector('.location-confirm');let selected=null,closed=false,searchId=0;
  const setSelected=p=>{selected={...p,name:p.name||p.address||'所选位置',address:p.address||`${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`};status.textContent=selected.address;confirm.disabled=false};confirm.disabled=true;
  const map=mount(cover.querySelector('.yx-location-map'),{latitude:options.latitude||YX.getPage()?.data.latitude,longitude:options.longitude||YX.getPage()?.data.longitude,scale:15,markers:[],select:p=>{setSelected(p);reverse(p)}});
  async function reverse(p){const id=++searchId;try{const res=await getApp().request({url:'/lbs/reverse-geocode',data:p,loading:false});if(!closed&&id===searchId)setSelected({...p,address:res.address})}catch{}}
  function close(result){if(closed)return;closed=true;searchId++;map.destroy();cover.remove();previous?.focus?.();if(result)options.success?.(result);else options.fail?.({errMsg:'chooseLocation:fail cancel'});options.complete?.(result||{errMsg:'chooseLocation:fail cancel'})}
  cover.querySelector('.location-cancel').onclick=()=>close();cover.addEventListener('click',e=>{if(e.target===cover)close()});
  cover.querySelector('.yx-location-search').onsubmit=async e=>{e.preventDefault();const address=cover.querySelector('input').value.trim();if(!address)return;status.textContent='正在查找';const id=++searchId;try{const r=await getApp().request({url:'/lbs/geocode',data:{address},loading:false});const loc=r.location||{};const latitude=Number(loc.latitude??loc.lat),longitude=Number(loc.longitude??loc.lng);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!r.success)throw Error();if(!closed&&id===searchId){setSelected({latitude,longitude,address:r.address||address});map.center({latitude,longitude})}}catch{if(!closed&&id===searchId)status.textContent='未找到该地址，请重新输入'}};
  cover.querySelector('.location-current').onclick=()=>wx.getLocation({success:p=>{if(closed)return;setSelected(p);map.center(p);reverse(p)},fail:()=>{status.textContent='定位未开启，请搜索地址'}});
  confirm.onclick=()=>{if(selected)close(selected)};
  cover.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const nodes=[...cover.querySelectorAll('input,button:not(:disabled)')],i=nodes.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();nodes.at(-1).focus()}else if(!e.shiftKey&&i===nodes.length-1){e.preventDefault();nodes[0].focus()}}});cover.querySelector('input').focus();
 }
 window.YXMaps={mount,choose};
})();
