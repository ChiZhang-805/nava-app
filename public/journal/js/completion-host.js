/* Same-origin authenticated shell only. No points, records, tokens or identity
 * enter this presentation channel; dismiss is its sole outgoing action. */
(() => {
  let connected=false;
  window.addEventListener('message',event=>{
    if(connected||event.source!==parent||event.origin!==location.origin||event.data?.type!=='nava-completion-connect'||!event.ports[0])return;
    connected=true;
    const {scene,locale,safeTop,safeBottom}=event.data;
    document.documentElement.lang=locale==='en'?'en':'zh-CN';
    const viewport=data=>{for(const [key,value]of [['top',data.safeTop],['bottom',data.safeBottom]])document.documentElement.style.setProperty(`--journal-safe-${key}`,`${Math.min(100,Math.max(0,Number(value)||0))}px`);};
    viewport({safeTop,safeBottom});
    const port=event.ports[0],button=document.getElementById('continue');
    button.hidden=false;new window.NavaCompletionScene(document.body,button).show({scene,locale});
    button.addEventListener('click',()=>{button.disabled=true;port.postMessage({type:'continue'});});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')button.click();});
    port.onmessage=({data})=>{if(data?.type==='viewport')viewport(data);};
    button.focus({preventScroll:true});port.postMessage({type:'ready'});
  });
})();
