/* Migrate the retired local 8000 preview only after verifying the new local app. */
(() => {
 'use strict';const release='20261112-reliable';
 window.YXRelease={release,ready:Promise.resolve(false)};
 if(!['127.0.0.1','localhost'].includes(location.hostname)||location.port!=='8000')return;
 window.YXRelease.ready=(async()=>{
  try{
   const origin=location.protocol+'//'+location.hostname+':8004';
   const r=await fetch(origin+'/app/release',{signal:AbortSignal.timeout(2500),cache:'no-store'});
   const value=await r.json();
   if(r.ok&&value.application==='yixiang-zhicai'&&value.release===release){location.replace(origin+location.pathname+location.search+location.hash);return true}
  }catch{}
  return false;
 })();
})();
