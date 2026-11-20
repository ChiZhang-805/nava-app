/* One bounded horizontal deck; the companion and bottom actions never take part in scrolling. */
__fluffyModules["review-deck.js"] = (()=>{
 const Insights=__fluffyModules["review-insights.js"],C=__fluffyModules["catalog.js"],D=__fluffyModules["review-data.js"];
 const node=(tag,cls,text="")=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
 class ReviewDeck {
  constructor(root,hooks){
   this.h=hooks;this.index=0;this.key="";
   this.track=node("div","review-deck");this.track.id="review-deck";this.track.tabIndex=0;
   this.track.setAttribute("role","region");
   this.dots=node("nav","review-deck-dots");root.append(this.track,this.dots);
   this.track.addEventListener("scroll",()=>{cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.select(Math.round(this.track.scrollLeft/this.track.clientWidth)));},{passive:true});
   const keys=event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();this.go(event.key==="Home"?0:event.key==="End"?3:this.index+(event.key==="ArrowRight"?1:-1));};
   this.track.addEventListener("keydown",keys);this.dots.addEventListener("keydown",keys);
   this.track.addEventListener("pointerdown",event=>{if(event.pointerType!=="mouse"||event.button!==0||event.target.closest("button"))return;this.drag={x:event.clientX,left:this.track.scrollLeft,id:event.pointerId};this.track.setPointerCapture(event.pointerId);});
   this.track.addEventListener("pointermove",event=>{if(!this.drag||event.pointerId!==this.drag.id)return;this.track.classList.add("dragging");this.track.scrollLeft=this.drag.left+this.drag.x-event.clientX;});
   const end=event=>{if(!this.drag||event.pointerId!==this.drag.id)return;this.drag=null;this.track.classList.remove("dragging");if(this.track.hasPointerCapture(event.pointerId))this.track.releasePointerCapture(event.pointerId);this.go(Math.round(this.track.scrollLeft/this.track.clientWidth));};
   this.track.addEventListener("pointerup",end);this.track.addEventListener("pointercancel",end);
   new ResizeObserver(()=>{if(this.track.clientWidth)this.go(this.index,true);}).observe(this.track);
  }
  t(zh,en){return this.lang==="en"?en:zh;}
  select(index){this.index=Math.max(0,Math.min(3,index));[...this.track.children].forEach((slide,i)=>{slide.inert=i!==this.index;slide.setAttribute("aria-hidden",String(i!==this.index));});[...this.dots.children].forEach((dot,i)=>{dot.setAttribute("aria-current",i===this.index?"true":"false");});}
  go(index,instant=false){index=Math.max(0,Math.min(3,index));this.track.scrollTo({left:index*this.track.clientWidth,behavior:instant||matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});this.select(index);}
  render(view,lang){
   this.lang=lang;this.view=view;const model=Insights.build(view,lang),key=`${view.id}:${view.date}`;
   if(this.key!==key)this.index=0;this.key=key;
   this.track.setAttribute("aria-label",this.t("数据回顾，左右滑动查看","Review cards; swipe left or right"));this.track.setAttribute("aria-roledescription",this.t("轮播","carousel"));this.dots.setAttribute("aria-label",this.t("回顾分页","Review pages"));
   this.track.replaceChildren();this.dots.replaceChildren();
   model.pages.forEach((page,i)=>{
    const slide=node("article",`review-slide review-slide--${page.kind}`);slide.id=`review-slide-${i}`;slide.setAttribute("role","group");slide.setAttribute("aria-label",`${i+1}/4 ${page.title}`);
    const heading=node("header","review-slide-heading");heading.append(node("p","review-slide-kicker",page.kicker),node("h3","",page.title));slide.append(heading);
    if(page.kind==="overview"){
     const metric=node("div",`review-slide-metric${page.textMetric?" is-text":""}`);metric.append(node("strong","",page.metric),node("span","",page.unit));slide.append(metric,node("p","review-slide-description",page.description));
    }
    if(page.kind==="trend")this.chart(slide,page);
    if(page.facts?.length)this.facts(slide,page.facts);
    if(page.bars?.length)this.bars(slide,page.bars);
    if(page.timeline?.length)this.facts(slide,page.timeline,"review-slide-timeline");
    if(page.comparison){
     const compare=node("div","review-slide-compare");
     for(const record of page.comparison){const col=node("section","review-slide-comparison");col.append(node("h4","",record.date.slice(5)));this.facts(col,record.fields);compare.append(col);}
     if(page.comparison.length<2)compare.append(node("p","review-slide-empty",this.t("再留下一次观察，就能并排看看啦。","Another observation will make a side-by-side view possible.")));
     slide.append(compare);
    }
    if(page.kind==="details"&&!page.facts.length&&!page.bars.length&&!page.timeline?.length&&!page.comparison?.length)slide.append(node("p","review-slide-empty",this.t("这里还没有相应的记录，先留一点空白也很好。","There are no matching fields yet. It's fine to leave some room.")));
    if(page.records){
     const list=node("div","review-slide-records");
     for(const record of page.records){const button=node("button","review-slide-record"),summary=C.summary(record);button.type="button";button.append(node("time","",`${D.dateOf(record).slice(5)} · ${new Date(record.createdAt).toLocaleTimeString(lang==="en"?"en-GB":"zh-CN",{hour:"2-digit",minute:"2-digit"})}`),node("strong","",String(summary.value??"")),node("span","",String(summary.sub??"")));button.onclick=()=>this.h.record(record);list.append(button);}
     if(!page.records.length)list.append(node("p","review-slide-empty",this.t("还没有记录，和小猫说说吧。","No entries yet. Tell your cat a little about today.")));
     if(view.records.length>2){const more=node("button","review-slide-more",this.t(`查看全部 ${view.records.length} 条`,`See all ${view.records.length} entries`));more.type="button";more.onclick=()=>this.h.records(view.records);list.append(more);}
     slide.append(list);
    }
    slide.append(node("p","review-slide-note",page.note));
    this.track.append(slide);
    const dot=node("button","review-deck-dot");dot.type="button";dot.setAttribute("aria-label",this.t(`第${i+1}页：${page.title}`,`Page ${i+1}: ${page.title}`));dot.setAttribute("aria-controls",slide.id);dot.append(node("span",""));dot.onclick=()=>this.go(i);this.dots.append(dot);
   });
   this.select(this.index);requestAnimationFrame(()=>this.go(this.index,true));
  }
  facts(root,rows,className="review-slide-facts"){
   const list=node("dl",className);for(const row of rows){const line=node("div","");line.append(node("dt","",row.label),node("dd","",row.value));list.append(line);}root.append(list);
  }
  bars(root,rows){
   const max=Math.max(1,...rows.map(r=>r.value)),list=node("div","review-slide-distribution");
   for(const row of rows){const line=node("div","review-distribution-row"),label=node("p","");label.append(node("span","",row.label),node("strong","",`${D.format(row.value)} ${row.unit||""}`));const rail=node("div","review-distribution-rail"),paint=node("span","");paint.style.width=`${row.value/max*100}%`;rail.append(paint);line.append(label,rail);list.append(line);}root.append(list);
  }
  chart(root,page){
   const chart=node("div","review-value-chart"),max=Math.max(this.view.id==="mood"?10:1,...page.series.map(d=>d.value??0));
   chart.setAttribute("role","img");chart.setAttribute("aria-label",page.series.map(d=>`${d.date}: ${d.value===null?this.t("未记录","not recorded"):`${D.format(d.value)} ${page.unit}`}`).join("; "));
   for(const day of page.series){const col=node("div","review-value-column"),plot=node("div","review-value-plot"),bar=node("span","review-value-bar");if(day.value!==null){bar.style.height=`${day.value/max*100}%`;plot.append(bar);}plot.append(node("span","review-value-number",day.value===null?"—":D.format(day.value)));col.append(plot,node("span","review-value-date",day.date.slice(5)));chart.append(col);}
   root.append(chart,node("p","review-slide-chart-unit",page.unit));
  }
 }
 return {ReviewDeck};
})();
