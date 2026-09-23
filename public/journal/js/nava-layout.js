/** Portrait layout: preserve legibility when height is reduced; scroll instead of crushing the scene. */
export function journalLayout(width,height,safeTop=0,safeBottom=0){
 const widthScale=Math.max(1,width)/393;
 const scale=Math.max(widthScale*.94,Math.min(widthScale,Math.max(1,height)/852));
 const top=Math.max(0,safeTop-62*scale);
 const bottom=Math.max(0,safeBottom-44*scale);
 return {scale,top,bottom,contentHeight:852*scale+top+bottom,scroll:852*scale+top+bottom>height+1};
}

export function installJournalLayout(api){
 let viewport={};
 const resize=()=>{
  const height=Math.min(innerHeight,viewport.visibleHeight||innerHeight);
  const layout=journalLayout(innerWidth,height,viewport.safeTop||0,viewport.safeBottom||0);
  const root=document.documentElement;
  root.style.setProperty('--design-scale',String(layout.scale));
  root.style.setProperty('--journal-safe-offset',`${layout.top}px`);
  root.style.setProperty('--journal-safe-tail',`${layout.bottom}px`);
  root.style.setProperty('--journal-visible-height',`${height}px`);
  root.dataset.journalScroll=String(layout.scroll);
  return layout;
 };
 api.viewport=data=>{viewport=data;resize();
  if(document.activeElement?.matches('input,textarea,select'))requestAnimationFrame(()=>document.activeElement.scrollIntoView({block:'nearest'}));
 };
 api.layout={resize};api.viewport(api.initial.viewport||{});
 window.addEventListener('resize',resize);
 window.visualViewport?.addEventListener('resize',resize);
 document.addEventListener('focusin',event=>{if(event.target.matches('input,textarea,select'))setTimeout(()=>event.target.isConnected&&event.target.scrollIntoView({block:'nearest'}),250);});
 return api.layout;
}
