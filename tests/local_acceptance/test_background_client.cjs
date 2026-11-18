/* Background visibility and reconnection unit fixture. Does not launch/control a browser. */
const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.resolve(__dirname,'../../site/family-sync.js'),'utf8');
let now=Date.now(),token='test-only-token',tick,requests=[],closers=[],listeners={};
class Clock extends Date{constructor(...v){super(...(v.length?v:[now]))}static now(){return now}}
const body={dataset:{}},document={hidden:true,body,querySelectorAll:()=>[],addEventListener:(n,fn)=>listeners[n]=fn};
const wx={getStorageSync:()=>token},YX={getPage:()=>null,route:()=>''};
const navigator={onLine:true};
const context={document,wx,YX,navigator,Date:Clock,TextDecoder,TextEncoder,AbortController,setInterval:fn=>{tick=fn},getApp:()=>({request:()=>new Promise(()=>{})}),fetch:async(url,opts)=>{
 requests.push({url,auth:opts.headers.Authorization,signal:opts.signal});let initial=true;
 return {ok:true,body:{getReader:()=>({read:()=>initial?(initial=false,Promise.resolve({done:false,value:new TextEncoder().encode('data: '+JSON.stringify({message_count:1,group_count:requests.length+1})+'\n\n')})):new Promise(resolve=>closers.push(()=>resolve({done:true})))})}};
}};
context.window={wx,YX,addEventListener:(n,fn)=>listeners[n]=fn};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
(async()=>{
 vm.runInNewContext(source,context);await flush();
 assert.equal(document.hidden,true);assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/family/events');assert.equal(requests[0].auth,'Bearer test-only-token');
 assert.equal(body.dataset.familyUnread,'3');assert.equal(body.dataset.familyTransport,'stream');
 closers.shift()();await flush();now+=35000;tick();await flush();assert.equal(requests.length,2);assert.equal(body.dataset.familyUnread,'4');
 const old=requests[1];token='rotated-test-token';tick();await flush();assert(old.signal.aborted);assert.equal(requests[2].auth,'Bearer rotated-test-token');
 navigator.onLine=false;token='offline-test-token';tick();await flush();assert.equal(requests.length,3);
 navigator.onLine=true;listeners.online();await flush();assert.equal(requests.length,4);
 console.log('BACKGROUND_CLIENT: 6/6; hidden-tab events, auth, reconnect, rotation and online recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
