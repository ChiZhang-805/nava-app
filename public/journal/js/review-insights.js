/* Read-only views of confirmed fields. No health score, inferred emotion, or missing-to-zero fill. */
__fluffyModules["review-insights.js"] = (() => {
    const D=__fluffyModules["review-data.js"], C=__fluffyModules["catalog.js"];
    const text=value=>value==null?"":String(value).trim();
    const known=value=>D.number(value);
    const sum=values=>{const present=values.map(known).filter(v=>v!==null);return present.length?present.reduce((a,b)=>a+b,0):null;};
    const average=values=>{const present=values.map(known).filter(v=>v!==null);return present.length?sum(present)/present.length:null;};
    const intensity=record=>{const n=known(record.data.intensity??record.data.moodIntensity);return n!==null&&n>=1&&n<=10?n:null;};
    const short=value=>C.shortTime(value);
    const minutes=value=>{const t=short(value);return t?Number(t.slice(0,2))*60+Number(t.slice(3)):null;};
    const clockSpread=values=>{
        const a=values.filter(v=>v!==null).sort((x,y)=>x-y);
        if(a.length<3)return null;
        const gaps=a.map((v,i)=>(i===a.length-1?a[0]+1440:a[i+1])-v);
        return 1440-Math.max(...gaps);
    };
    const groups=values=>{
        const counts=new Map();
        for(const value of values){const label=text(value);if(label)counts.set(label,(counts.get(label)||0)+1);}
        return [...counts].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
    };
    function build(view,lang="zh") {
        const t=(zh,en)=>lang==="en"?en:zh, fmt=D.format;
        const records=view.records, today=records.filter(r=>D.dateOf(r)===view.date), latest=today.at(-1), data=latest?.data||{};
        const days=view.week.filter(d=>d.count).length;
        const unit=t({sleep:"小时",sport:"分钟",focus:"分钟",food:"kcal",mood:"/ 10",face:"次"}[view.id],{sleep:"h",sport:"min",focus:"min",food:"kcal",mood:"/ 10",face:"entries"}[view.id]);
        const rows=(items)=>items.filter(item=>item.value!==null&&item.value!==undefined&&text(item.value)!=="");
        const facts=items=>rows(items).map(item=>({...item,value:String(item.value)}));
        const recent=[...records].reverse();
        const overview={kind:"overview",title:t("这一天的小记","This day's moments"),kicker:t("已确认的记录","Your confirmed entries"),metric:"",unit:"",description:"",facts:[],note:t(`当天 ${today.length} 条 · 近7天记录了 ${days} 天`,`Today: ${today.length} entries · Logged on ${days} of 7 days`)};
        const trend={kind:"trend",title:t("最近 7 天","The last 7 days"),kicker:"",unit,series:[],note:t("未记录的日子留空，不算作 0。","Unrecorded days stay empty, not zero.")};
        const detail={kind:"details",title:"",kicker:t("只看实际留下的信息","Only what you recorded"),facts:[],bars:[],note:""};
        const history={kind:"history",title:t("把这些片刻留住","Keep these little moments"),kicker:t("近7天的记录","Entries from the last 7 days"),records:recent.slice(0,3),note:t("点开一条，看看完整内容。","Tap an entry to read it in full.")};
        if(view.id==="sleep") {
            overview.metric=fmt(view.today.value);overview.unit=unit;
            overview.description=text(data.quality)||t("记下这晚的休息","A little record of your rest");
            overview.facts=facts([{label:t("入睡","Bedtime"),value:short(data.bedtime)},{label:t("醒来","Wake-up"),value:short(data.wakeTime)}]);
            trend.kicker=t("已记录睡眠时长","Logged sleep duration");
            detail.title=t("作息的节奏","Your sleep timing");
            const nights=view.week.map(day=>records.filter(r=>D.dateOf(r)===day.date).sort((a,b)=>(D.sleepTotal([b]).hours??-1)-(D.sleepTotal([a]).hours??-1))[0]).filter(Boolean);
            const beds=nights.map(r=>minutes(r.data.bedtime)),wakes=nights.map(r=>minutes(r.data.wakeTime));
            detail.facts=facts([{label:t("入睡时刻跨度","Bedtime spread"),value:clockSpread(beds)===null?null:`${fmt(clockSpread(beds))} ${t("分钟","min")}`},{label:t("醒来时刻跨度","Wake-up spread"),value:clockSpread(wakes)===null?null:`${fmt(clockSpread(wakes))} ${t("分钟","min")}`},{label:t("有时长的日均","Average logged duration"),value:average(view.week.map(d=>d.value))===null?null:`${fmt(average(view.week.map(d=>d.value)))} ${unit}`}]);
            detail.timeline=nights.slice(-3).reverse().map(r=>({label:D.dateOf(r).slice(5),value:[short(r.data.bedtime),short(r.data.wakeTime)].filter(Boolean).join(" → ")}));
            detail.note=clockSpread(beds)===null?t("再有3天的入睡时刻，就能看看作息跨度啦。","With bedtime records on 3 days, timing variation can be shown."):t("取每天最长睡眠段；跨度是记录时刻的差异，不是睡眠质量评分。","Uses each day's longest sleep segment. Timing variation is not a sleep-quality score.");
        } else if(view.id==="food") {
            overview.metric=today.length?String(today.length):"—";overview.unit=t("条饮食记录","meal entries");
            overview.description=text(data.foods)||t("今天的美味，慢慢记","A little space for today's meals");
            const calories=today.filter(r=>known(r.data.calories)!==null).length;
            overview.facts=facts([{label:t("已记录热量","Logged energy"),value:view.today.value===null?null:`${fmt(view.today.value)} kcal`},{label:t("已记餐次","Meal labels"),value:[...new Set(today.map(r=>text(r.data.meal)).filter(Boolean))].join(" · ")}]);
            overview.note+=calories? t(` · ${calories}/${today.length} 条有热量`,` · Energy recorded for ${calories}/${today.length}`):"";
            trend.kicker=t("已记录热量 · 含估算值","Logged energy · may include estimates");
            detail.title=t("这一餐的搭配","What went into your meals");
            detail.bars=[["protein","蛋白质","Protein"],["carbs","碳水","Carbs"],["fat","脂肪","Fat"]].map(([key,zh,en])=>({label:t(zh,en),value:sum(today.map(r=>r.data[key])),unit:"g",sample:today.filter(r=>known(r.data[key])!==null).length})).filter(row=>row.value!==null);
            detail.facts=facts([{label:t("自己的评价","Your assessment"),value:data.selfAssessment},{label:t("最近用餐时间","Latest meal time"),value:short(data.mealTime)}]);
            detail.note=detail.bars.length?t("只合计已填营养量，不代表全天摄入或健康评分。","Supplied nutrients only; not full-day intake or a health score."):t("知道的营养量可以补上，不知道也没关系。","Add known nutrient amounts; blanks are fine.");
        } else if(view.id==="focus") {
            overview.metric=fmt(view.today.value);overview.unit=unit;overview.description=text(data.task)||t("每一点认真，都留在这里","Every focused moment counts");
            const timed=today.filter(r=>known(r.focus?.elapsedMs)!==null),planned=timed.filter(r=>r.focus.provenance!=="self-reported"&&known(r.focus.plannedMs)>0),reached=planned.filter(r=>r.focus.elapsedMs>=r.focus.plannedMs).length;
            overview.facts=facts([{label:t("记录段数","Sessions logged"),value:today.length||null},{label:t("达到原定时长","Reached planned time"),value:planned.length?`${reached} / ${planned.length}`:null},{label:t("自述补记","Self-reported sessions"),value:timed.filter(r=>r.focus.provenance==="self-reported").length||null}]);
            trend.kicker=t("实际专注时长","Actual focused minutes");
            detail.title=t("时间留给了哪里","Where your time went");
            const bands=[{label:t("清晨 · 0—6时","Night · 00–06"),value:0},{label:t("上午 · 6—12时","Morning · 06–12"),value:0},{label:t("下午 · 12—18时","Afternoon · 12–18"),value:0},{label:t("晚上 · 18—24时","Evening · 18–24"),value:0}];
            let usable=0;
            for(const r of records){const iso=r.focus?.startedAt,start=typeof iso==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(iso)?Date.parse(iso):NaN,elapsed=known(r.focus?.elapsedMs);if(Number.isFinite(start)&&elapsed!==null&&r.focus?.provenance!=="self-reported"){bands[Math.floor(new Date(start).getHours()/6)].value+=elapsed/60000;usable++;}}
            detail.bars=usable?bands.filter(row=>row.value>0).map(row=>({...row,unit:t("分钟","min")})):[];
            detail.note=usable?t(`按开始时段归组 · ${usable}/${records.length} 段；计时结束不等于任务完成。`,`Start-time groups: ${usable}/${records.length}. A finished timer is not a finished task.`):t("还没有真实开始时间，先不推测时段分布。","No start times recorded; no time distribution inferred.");
        } else if(view.id==="sport") {
            overview.metric=fmt(view.today.value);overview.unit=unit;overview.description=text(data.activity)||t("每一步都算数","Every little step counts");
            overview.facts=facts([{label:t("强度 · 自评","Intensity · self-rated"),value:data.intensity},{label:t("运动后","Afterwards"),value:data.recovery},{label:t("手动记录步数","Manually logged steps"),value:sum(today.map(r=>r.data.steps))}]);
            trend.kicker=t("已记录运动时长","Logged activity duration");detail.title=t("强度与恢复","Effort and recovery");
            detail.bars=groups(records.map(r=>r.data.intensity)).slice(0,3).map(row=>({...row,unit:t("次","entries")}));
            detail.facts=facts([{label:t("最近运动后的感受","Latest feeling afterwards"),value:recent.find(r=>text(r.data.recovery))?.data.recovery},{label:t("最近时间段","Latest time window"),value:[short(data.startTime),short(data.endTime)].filter(Boolean).join(" → ")}]);
            detail.note=t("强度与恢复均为自评，不推测心率或消耗。","Your own ratings; no heart rate or calories inferred.");
        } else if(view.id==="mood") {
            overview.metric=text(data.mood)||t("给心情留个位置","Room for your feelings");overview.description=text(data.reason)||text(data.notes)||t("什么样的心情，都可以说","Every feeling has a place here");
            overview.textMetric=true;overview.facts=facts([{label:t("强度 · 自评","Intensity · self-rated"),value:latest&&intensity(latest)!==null?`${intensity(latest)} / 10`:null},{label:t("和什么有关","Related to"),value:data.reasonTags}]);
            trend.kicker=t("每天末次自评强度 · 不分好坏","Last self-rated intensity each day · no good/bad ranking");
            detail.title=t("心情背后的小事","Little things behind the feeling");
            detail.bars=groups(records.flatMap(r=>text(r.data.reasonTags).split(/[、,，]/).filter(Boolean))).slice(0,4).map(row=>({...row,unit:t("次","entries")}));
            detail.note=t("只统计你选过的原因，不替你猜测情绪。","Only your selected reasons are counted.");
        } else {
            overview.metric=text(data.feeling)||t("轻轻看看自己","A gentle look at yourself");overview.textMetric=true;
            overview.description=t("自己的感受和外观观察，值得好好留住。","Your own feelings and observations are worth keeping.");
            overview.facts=facts([{label:t("眼周观察","Eye-area observation"),value:data.eyeArea},{label:t("皮肤观察","Skin observation"),value:data.skinAppearance},{label:t("拍摄情境 · 自选","Photo context · self-chosen"),value:data.captureMode}]);
            trend.kicker=t("留下观察的日子","Days with observations");
            detail.title=t("前后两次，慢慢看","Two moments, side by side");
            detail.comparison=recent.slice(0,2).reverse().map(r=>({date:D.dateOf(r),fields:facts([{label:t("自我感受","Your feeling"),value:r.data.feeling},{label:t("眼周","Eye area"),value:r.data.eyeArea},{label:t("皮肤","Skin"),value:r.data.skinAppearance}])}));
            detail.note=t("原话并排看，不生成健康或外貌评分。","Your own words; no health or beauty scores.");
        }
        trend.series=view.week.map(day=>{const entries=records.filter(r=>D.dateOf(r)===day.date);return {date:day.date,value:view.id==="mood"?(entries.map(intensity).filter(v=>v!==null).at(-1)??null):view.id==="face"?(day.count||null):day.value,detail:view.id==="mood"?day.text:day.count?`${day.count} ${t("条记录","entries")}`:t("尚未记录","No entry")};});
        if(!today.length){overview.metric=t("今天还没记","Nothing here yet");overview.unit="";overview.textMetric=true;overview.description=t("想记的时候，我在这里。","I'm here whenever you feel like recording.");overview.facts=[];}
        if(!records.length)history.note=t("第一条记录，会从这里开始。","Your first entry will appear here.");
        return {pages:[overview,trend,detail,history],days,records:records.length};
    }
    return {build,intensity,clockSpread,groups,sum,average};
})();
