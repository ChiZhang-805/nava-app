/** Portrait layout: preserve legibility when height is reduced; scroll instead of crushing the scene. */
export function journalLayout(width,height,safeTop=0,safeBottom=0){
 const widthScale=Math.max(1,width)/393;
 const scale=Math.max(widthScale*.94,Math.min(widthScale,Math.max(1,height)/852));
 const top=Math.max(0,safeTop-62*scale);
 const bottom=Math.max(0,safeBottom-44*scale);
 return {scale,top,bottom,contentHeight:852*scale+top+bottom,scroll:852*scale+top+bottom>height+1};
}

export function installJournalLayout(api){
 const preventNativeTextMenu=event=>{
  const target=event.target instanceof Element?event.target:event.target?.parentElement;
  if(target?.closest('input,textarea')||target?.isContentEditable)return;
  event.preventDefault();
 };
 document.addEventListener('contextmenu',preventNativeTextMenu);
 document.addEventListener('selectstart',preventNativeTextMenu);
 let viewport={};
 const stage=document.querySelector('.stage');
 const revealField=()=>{
  const field=document.activeElement;
  if(!field?.matches('input,textarea,select')||!stage)return;
  const viewportBounds=stage.getBoundingClientRect();
  for(let region=field.parentElement;region&&stage.contains(region);region=region.parentElement){
   if(region.scrollHeight<=region.clientHeight+1||!['auto','scroll'].includes(getComputedStyle(region).overflowY))continue;
   const bounds=region.getBoundingClientRect(),rect=field.getBoundingClientRect();
   const bottom=rect.bottom-Math.min(viewportBounds.bottom,bounds.bottom)+12;
   const top=rect.top-Math.max(viewportBounds.top,bounds.top)-12;
   const delta=bottom>1?bottom:Math.min(0,top);
   const scale=bounds.height/(region.offsetHeight||bounds.height)||1;
   if(Math.abs(delta)>1)region.scrollTop+=delta/scale;
  }
 };
 const resize=()=>{
  const height=Math.min(innerHeight,viewport.visibleHeight||innerHeight);
  const layout=journalLayout(innerWidth,height,viewport.safeTop||0,viewport.safeBottom||0);
  const root=document.documentElement;
  root.style.setProperty('--design-scale',String(layout.scale));
  root.style.setProperty('--journal-safe-offset',`${layout.top}px`);
  root.style.setProperty('--journal-safe-tail',`${layout.bottom}px`);
  root.style.setProperty('--journal-visible-height',`${height}px`);
  root.style.setProperty('--journal-viewport-top',`${viewport.visibleOffset||0}px`);
  root.style.setProperty('--journal-safe-top',`${Math.max(0,viewport.safeTop||0)}px`);
  root.style.setProperty('--journal-safe-bottom',`${Math.max(0,viewport.safeBottom||0)}px`);
  // Keep the writing cat and paper top anchored. Short screens shorten only
  // the paper's reading window, leaving Continue above the home indicator.
  const sceneHeight=(height-layout.top-layout.bottom)/layout.scale;
  const actionTail=Math.max(44,((viewport.safeBottom||0)-layout.bottom+12)/layout.scale);
  const recordActionTop=Math.min(744,sceneHeight-actionTail-64);
  root.style.setProperty('--record-action-top',`${recordActionTop}px`);
  root.style.setProperty('--record-paper-height',`${Math.max(80,Math.min(290,recordActionTop-16-414-14))}px`);
  root.dataset.journalScroll=String(layout.scroll);
  return layout;
 };
 api.viewport=data=>{viewport=data;resize();requestAnimationFrame(revealField);};
 api.layout={resize};api.viewport(api.initial.viewport||{});
 window.addEventListener('resize',resize);
 window.visualViewport?.addEventListener('resize',resize);
 document.addEventListener('focusin',event=>{if(event.target.matches('input,textarea,select'))setTimeout(revealField,250);});
 return api.layout;
}
