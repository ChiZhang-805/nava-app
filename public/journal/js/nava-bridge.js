/* Same-origin, parent-owned authenticated boundary. No tokens or health storage here. */
window.NavaJournal = (() => {
  let port, next=0;
  const pending=new Map();
  const api={initial:{settings:{},records:[],locale:'zh'}, context:{}, interrupt:null, notify:null};
  api.call=(method,payload={},signal)=>new Promise((resolve,reject)=>{
    if(!port || signal?.aborted) {reject(new DOMException('Canceled','AbortError'));return;}
    const id=++next;
    const abort=()=>{port.postMessage({cancel:id});pending.get(id)?.cleanup();pending.delete(id);reject(new DOMException('Canceled','AbortError'));};
    const timeout=setTimeout(()=>{abort();},95000);
    signal?.addEventListener('abort',abort,{once:true});
    pending.set(id,{resolve,reject,cleanup:()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}});
    port.postMessage({id,method,payload,context:api.context});
  });
  api.ready=new Promise(resolve=>{
    window.addEventListener('message',function connect(event){
      if(event.source!==parent || event.origin!==location.origin || event.data?.type!=='nava-journal-connect' || !event.ports[0] || port) return;
      port=event.ports[0];api.initial=event.data.initial;
      port.onmessage=({data})=>{
        if(data.type==='interrupt'){api.interrupt?.();return;}
        if(data.type==='viewport'){api.initial.viewport=data;api.viewport?.(data);return;}
        if(data.type?.startsWith('voice')){api.voiceEvent?.(data);return;}
        const item=pending.get(data.id);if(!item)return;
        pending.delete(data.id);item.cleanup();
        if(data.error)item.reject(Error(data.error));else item.resolve(data.result);
      };
      port.start();resolve(api.initial);
    });
  });
  window.addEventListener('pagehide',()=>{for(const item of pending.values()){item.cleanup();item.reject(new DOMException('Closed','AbortError'));}pending.clear();port?.close();});
  return api;
})();
