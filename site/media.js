/* Native MP4 + original HLS courses, without recreating a playing video on setData. */
(() => {
 'use strict';
 function mount(video){
  const source=video.dataset.yxSource||video.getAttribute('src')||'';if(!source||video.__yxMedia?.source===source)return;
  video.__yxMedia?.destroy();let hls=null,recovered=false;
  const api={source,destroy(){hls?.destroy();video.__yxMedia=null}};video.__yxMedia=api;
  if(/\.m3u8(?:[?#]|$)/i.test(source)&&!video.canPlayType('application/vnd.apple.mpegurl')&&window.Hls?.isSupported()){
   video.removeAttribute('src');hls=new Hls({enableWorker:true,maxBufferLength:18,backBufferLength:12,autoStartLoad:false});
   hls.on(Hls.Events.ERROR,(_,data)=>{if(!data.fatal)return;if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&!recovered){recovered=true;hls.recoverMediaError()}else{hls.destroy();video.dispatchEvent(new CustomEvent('error',{detail:{errMsg:'课程暂时未加载'}}))}});
   hls.loadSource(source);hls.attachMedia(video);
   // Metadata is loaded on attachment; video segments start on an intentional play.
   const play=()=>hls?.startLoad();video.addEventListener('play',play,{once:true});const destroy=api.destroy;api.destroy=()=>{video.removeEventListener('play',play);destroy()};
   api.hls=hls;
  }
 }
 window.YXMedia={mount,destroy:video=>video.__yxMedia?.destroy()};
})();
