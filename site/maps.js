/* WXML map + chooseLocation. All provider requests are authenticated and same-origin. */
(() => {
 'use strict';
 const cache=new Map();
 const project=(lat,lng,z)=>{const size=256*2**z,s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return {x:(lng+180)/360*size,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*size}};
 const unproject=(x,y,z)=>{const size=256*2**z;return {latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI,longitude:x/size*360-180}};
 function fitRoute(points,width=640,height=320){
  const valid=points.filter(p=>Array.isArray(p)&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]))&&Math.abs(Number(p[0]))<=85&&Math.abs(Number(p[1]))<=180);
  if(valid.length<2)throw Error('路线缺少坐标');
  let zoom=4,bounds;
  for(let z=18;z>=4;z--){const projected=valid.map(p=>project(Number(p[0]),Number(p[1]),z));const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};zoom=z;if(bounds.right-bounds.left<=width*.78&&bounds.bottom-bounds.top<=height*.74)break;}
  return {...unproject((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2,zoom),scale:zoom};
 }
 async function imageURL(lat,lng,z,w,h,signal){
  const url='/lbs/static-map?'+new URLSearchParams({latitude:lat,longitude:lng,zoom:z,width:w,height:h});
  if(cache.has(url))return cache.get(url);
  const r=await fetch(url,{signal,headers:{Authorization:'Bearer '+wx.getStorageSync('token')}});if(!r.ok)throw Error('地图加载失败');
  const value=URL.createObjectURL(await r.blob());cache.set(url,value);if(cache.size>40){const key=cache.keys().next().value;URL.revokeObjectURL(cache.get(key));cache.delete(key)}return value;
 }
 function mount(host,options){
  const state={latitude:Number(options.latitude)||39.12,longitude:Number(options.longitude)||117.2,zoom:Math.max(4,Math.min(18,Number(options.scale)||14))};
  host.classList.add('yx-real-map');const image=document.createElement('img');image.className='yx-map-image';image.alt='地图';image.draggable=false;
  const routeLayer=document.createElementNS('http://www.w3.org/2000/svg','svg');routeLayer.classList.add('yx-map-route');routeLayer.setAttribute('aria-hidden','true');
  const overlay=document.createElement('div');overlay.className='yx-map-markers';
  const controls=document.createElement('div');controls.className='yx-map-controls';
  const status=document.createElement('button');status.type='button';status.className='yx-map-status';status.textContent='地图加载中';status.hidden=true;
  const credit=document.createElement('span');credit.className='yx-map-credit';credit.textContent='腾讯地图';
  host.append(image,routeLayer,overlay,controls,status,credit);let size={width:640,height:360},controller=null,drag=null,dragged=false;
  function routePoints(){routeLayer.replaceChildren();routeLayer.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);const center=project(state.latitude,state.longitude,state.zoom);const points=(options.polyline||[]).map(p=>{const q=project(Number(p[0]),Number(p[1]),state.zoom);return `${q.x-center.x+size.width/2},${q.y-center.y+size.height/2}`}).join(' ');if(!points)return;for(const [color,width] of [['#fff',10],['#467b64',6]]){const path=document.createElementNS('http://www.w3.org/2000/svg','polyline');path.setAttribute('points',points);path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width',width);path.setAttribute('stroke-linejoin','round');path.setAttribute('stroke-linecap','round');routeLayer.append(path)}}
  function points(){overlay.replaceChildren();const center=project(state.latitude,state.longitude,state.zoom);for(const m of options.markers||[]){if(!Number.isFinite(Number(m.latitude))||!Number.isFinite(Number(m.longitude)))continue;const p=project(Number(m.latitude),Number(m.longitude),state.zoom),x=(p.x-center.x+size.width/2)/size.width*100,y=(p.y-center.y+size.height/2)/size.height*100;if(x<0||x>100||y<0||y>100)continue;const b=document.createElement('button');b.type='button';b.className='yx-map-marker';b.textContent=m.id===1?'●':'📍';b.title=m.title||m.callout?.content||'地点';b.setAttribute('aria-label',b.title);b.style.left=x+'%';b.style.top=y+'%';b.addEventListener('click',e=>{e.stopPropagation();host.dispatchEvent(new CustomEvent('markertap',{detail:{markerId:m.id}}))});overlay.append(b)}}
  async function paint(){controller?.abort();const current=new AbortController();controller=current;const rect=host.getBoundingClientRect();size={width:Math.max(280,Math.min(1000,Math.round(rect.width)||640)),height:Math.max(180,Math.min(800,Math.round(rect.height)||360))};points();routePoints();status.hidden=true;try{const url=await imageURL(state.latitude,state.longitude,state.zoom,size.width,size.height,current.signal);if(controller===current&&!current.signal.aborted)image.src=url}catch(e){if(e.name!=='AbortError'&&controller===current){status.hidden=false;status.textContent='重新加载地图'}}}
  function button(text,label,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.addEventListener('click',e=>{e.stopPropagation();action()});controls.append(b)}
  button('+','放大地图',()=>{state.zoom=Math.min(18,state.zoom+1);paint()});button('−','缩小地图',()=>{state.zoom=Math.max(4,state.zoom-1);paint()});
  status.onclick=()=>paint();host.style.touchAction='none';
  image.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,center:project(state.latitude,state.longitude,state.zoom)};dragged=false;image.setPointerCapture(e.pointerId)});
  image.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;image.style.transform=`translate(${dx}px,${dy}px)`});
  image.addEventListener('pointerup',e=>{if(!drag)return;const r=host.getBoundingClientRect(),sx=size.width/r.width,sy=size.height/r.height,dx=(e.clientX-drag.x)*sx,dy=(e.clientY-drag.y)*sy;if(dragged){Object.assign(state,unproject(drag.center.x-dx,drag.center.y-dy,state.zoom));paint()}else if(options.select){options.select(unproject(drag.center.x+(e.clientX-r.left-r.width/2)*sx,drag.center.y+(e.clientY-r.top-r.height/2)*sy,state.zoom))}drag=null;image.style.transform=''});
  image.addEventListener('pointercancel',()=>{drag=null;image.style.transform=''});
  const resize=new ResizeObserver(()=>paint());resize.observe(host);
  return {state,center(p){Object.assign(state,p);paint()},mark(p){options.markers=[{id:2,...p,title:'所选位置'}];points()},destroy(){controller?.abort();resize.disconnect()}};
 }
 async function choose(options={}){
  const previous=document.activeElement,cover=document.createElement('div');cover.className='yx-location-cover';cover.setAttribute('role','dialog');cover.setAttribute('aria-modal','true');cover.setAttribute('aria-label','选择位置');
  cover.innerHTML='<section class="yx-location-dialog"><header><h2>选择位置</h2><button type="button" class="location-cancel" aria-label="关闭">×</button></header><form class="yx-location-search"><input aria-label="搜索地址" placeholder="输入街道、小区或城市地址"><button>查找</button></form><div class="yx-location-map"></div><div class="yx-location-selected" role="status"></div><footer><button type="button" class="location-current">当前位置</button><button type="button" class="location-confirm">确定位置</button></footer></section>';
  document.body.append(cover);const status=cover.querySelector('.yx-location-selected'),confirm=cover.querySelector('.location-confirm');let selected=null,closed=false,searchId=0;
  const setSelected=p=>{selected={...p,name:p.name||p.address||'所选位置',address:p.address||`${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`};status.textContent=selected.address;confirm.disabled=false;map.mark(p)};confirm.disabled=true;
  const map=mount(cover.querySelector('.yx-location-map'),{latitude:options.latitude||YX.getPage()?.data.latitude,longitude:options.longitude||YX.getPage()?.data.longitude,scale:15,markers:[],select:p=>{setSelected(p);reverse(p)}});
  async function reverse(p){const id=++searchId;try{const res=await getApp().request({url:'/lbs/reverse-geocode',data:p,loading:false});if(!closed&&id===searchId)setSelected({...p,address:res.address})}catch{}}
  function close(result){if(closed)return;closed=true;searchId++;map.destroy();cover.remove();previous?.focus?.();if(result)options.success?.(result);else options.fail?.({errMsg:'chooseLocation:fail cancel'});options.complete?.(result||{errMsg:'chooseLocation:fail cancel'})}
  cover.querySelector('.location-cancel').onclick=()=>close();cover.addEventListener('click',e=>{if(e.target===cover)close()});
  cover.querySelector('.yx-location-search').onsubmit=async e=>{e.preventDefault();const address=cover.querySelector('input').value.trim();if(!address)return;status.textContent='正在查找';const id=++searchId;try{const r=await getApp().request({url:'/lbs/geocode',data:{address},loading:false});const loc=r.location||{};const latitude=Number(loc.latitude??loc.lat),longitude=Number(loc.longitude??loc.lng);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!r.success)throw Error();if(!closed&&id===searchId){setSelected({latitude,longitude,address:r.address||address});map.center({latitude,longitude})}}catch{if(!closed&&id===searchId)status.textContent='未找到该地址，请重新输入'}};
  cover.querySelector('.location-current').onclick=()=>wx.getLocation({type:'gcj02',success:p=>{if(closed)return;setSelected(p);map.center(p);reverse(p)},fail:()=>{status.textContent='暂未取得准确定位，请搜索地址'}});
  confirm.onclick=()=>{if(selected)close(selected)};
  cover.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const nodes=[...cover.querySelectorAll('input,button:not(:disabled)')],i=nodes.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();nodes.at(-1).focus()}else if(!e.shiftKey&&i===nodes.length-1){e.preventDefault();nodes[0].focus()}}});cover.querySelector('input').focus();
 }
 async function locate(opts={}){
  try{
   const p=await new Promise((resolve,reject)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:30000}):reject(Error('浏览器未提供定位')));
   let result={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,coordinate_system:'wgs84'};
   if(opts.type==='gcj02')result={...result,...await getApp().request({url:'/lbs/convert-coordinates',data:{latitude:result.latitude,longitude:result.longitude},loading:false})};
   if(result.coordinate_system==='gcj02')window.YXMaps.lastLocation=result;
   opts.success?.(result);opts.complete?.(result);return result;
  }catch(e){const error={errMsg:e.message||'暂未取得准确定位，请搜索地址'};opts.fail?.(error);opts.complete?.(error);return null}
 }
 async function navigate(opts={}){
  const cover=document.createElement('div');cover.className='yx-location-cover';cover.setAttribute('role','dialog');cover.setAttribute('aria-modal','true');cover.setAttribute('aria-label','步行导航');
  cover.innerHTML='<section class="yx-location-dialog yx-route-dialog"><header><h2>步行路线</h2><button type="button" aria-label="关闭">×</button></header><h3></h3><p class="route-status" role="status">正在获取出发位置…</p><div class="yx-route-map" aria-label="步行路线地图" hidden></div><ol class="route-steps"></ol><footer><button class="route-origin" type="button">选择起点</button><button class="route-retry" type="button" hidden>重新查询</button></footer></section>';
  const previous=document.activeElement;document.body.append(cover);cover.querySelector('h3').textContent=opts.name||'目的地';let closed=false,map=null,routeId=0,lastOrigin=null;
  const close=()=>{closed=true;routeId++;map?.destroy();cover.remove();previous?.focus?.();opts.complete?.({})};cover.querySelector('header button').onclick=close;cover.addEventListener('click',e=>{if(e.target===cover)close()});
  const status=cover.querySelector('.route-status'),list=cover.querySelector('ol'),mapHost=cover.querySelector('.yx-route-map'),retry=cover.querySelector('.route-retry');
  cover.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...cover.querySelectorAll('button:not([hidden])')].filter(e=>e.getClientRects().length);if(!nodes.length)return;const index=nodes.indexOf(document.activeElement);if(e.shiftKey&&index===0){e.preventDefault();nodes.at(-1).focus()}else if(!e.shiftKey&&index===nodes.length-1){e.preventDefault();nodes[0].focus()}}};
  async function route(origin){if(closed)return;if(!origin){status.textContent='未取得定位，请选择起点。';return}const id=++routeId;lastOrigin=origin;window.YXMaps.lastLocation=origin;const params={start_latitude:origin.latitude,start_longitude:origin.longitude,latitude:opts.latitude,longitude:opts.longitude};
   status.textContent='正在查询步行路线…';retry.hidden=true;list.replaceChildren();map?.destroy();map=null;mapHost.replaceChildren();mapHost.hidden=true;
   try{const data=await getApp().request({url:'/lbs/route',data:params,loading:false});if(closed||id!==routeId)return;if(data.source!=='tencent_directions'||!data.polyline||data.polyline.length<2)throw Error('路线未返回');mapHost.hidden=false;const rect=mapHost.getBoundingClientRect(),fit=fitRoute(data.polyline,Math.max(280,rect.width),Math.max(260,rect.height));map=mount(mapHost,{...fit,polyline:data.polyline,markers:[{id:1,latitude:origin.latitude,longitude:origin.longitude,title:'起点'},{id:2,latitude:opts.latitude,longitude:opts.longitude,title:opts.name||'终点'}]});for(const step of data.steps||[]){const li=document.createElement('li');li.textContent=step.instruction;list.append(li)}status.textContent=`步行约${Math.round(data.distance)}米，预计${Math.ceil(data.duration)}分钟`;cover.dataset.routeSource=data.source;retry.hidden=false;opts.success?.(data)}catch(e){if(!closed&&id===routeId){status.textContent='路线暂时加载失败，请重新查询或更换起点。';retry.hidden=false}}
  }
  cover.querySelector('.route-origin').onclick=()=>choose({success:route});
  retry.onclick=()=>route(lastOrigin);
  const origin=window.YXMaps.lastLocation||await locate({type:'gcj02'});await route(origin);cover.querySelector('header button')?.focus();
 }
 window.YXMaps={mount,choose,locate,navigate,geometry:{project,unproject,fitRoute}};
})();
