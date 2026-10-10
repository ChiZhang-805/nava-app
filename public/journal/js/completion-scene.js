/* Shared presentation only: no storage, reward RPC, authentication or record mutation.
 * Art and actor use a single cover-sized coordinate space on every screen. */
(() => {
  const scenes = {
    '01': { title:'Great job!', cat:'../garden-cat.webp', box:[640,480,61,94,503,395], mirror:true, color:'#79bda4', motion:'petals', zh:'又完成了一项任务！\n继续保持这份美好～', en:'Another little step, complete.\nKeep this lovely feeling going.' },
    '02': { title:'Excellent!', cat:'home-read.webp', box:[640,480,42,71,540,412], color:'#e9bd73', motion:'light', zh:'专注的你，\n真的很棒！', en:'A little time, fully yours.\nYou did wonderfully.' },
    '03': { title:'Brilliant!', cat:'scene-03-cat-laptop.png', box:[1536,1024,0,0,1536,1024], color:'#5baceb', motion:'leaves', inkDuration:3.2, actorMotion:'typing', zh:'干得漂亮！\n每一份努力都在发光 ✧', en:'Beautifully done!\nEvery little effort shines. ✧' },
    '04': { title:'Amazing!', cat:'module-face.webp', box:[480,440,34,36,437,433], color:'#ad9bd9', motion:'lavender', zh:'照顾好自己，\n真的很了不起～', en:'Making room for yourself.\nThat is something to celebrate.' },
    '05': { title:'You did it!', cat:'module-diet.webp', box:[480,356,14,18,452,352], color:'#efbd77', motion:'light', zh:'吃得认真，\n也是在好好爱自己', en:'A nourishing little moment.\nA little kindness to yourself.' },
    '06': { title:'Well done!', cat:'module-exercise.webp', box:[480,381,28,31,452,380], color:'#ef9d9a', motion:'leaves', zh:'动起来的你，\n每一步都超棒！', en:'Look at you moving forward.\nEvery step is worth it!' },
    '07': { title:'Great job!', cat:'module-sleep.webp', box:[480,315,0,33,447,307], color:'#80b99b', motion:'leaves', zh:'休息得好，\n也是一种很棒的完成。', en:'Rest is a little victory, too.\nHere is to feeling renewed.' },
    '08': { title:'Excellent!', cat:'home-butterfly.webp', box:[640,480,4,65,550,406], mirror:true, color:'#eaa589', motion:'petals', zh:'你的情绪，\n也值得被温柔照顾。', en:'Your feelings matter.\nThey deserve a little tenderness.' },
    '09': { title:'Brilliant!', cat:'../garden-cat.webp', box:[640,480,61,94,503,395], mirror:true, color:'#7ea6da', motion:'stars', zh:'今天的努力，\n都值得被好好庆祝。', en:'All your little efforts today\nare worth celebrating.' },
  };
  // Handwriting centerlines. Each stroke follows its path, not a typewriter or
  // a rectangular wipe across printed text. The final underline ends the sequence.
  const glyphs = {
    G:[36,['M32 11C18-1 3 16 3 33C3 51 26 53 32 29L19 31']],
    E:[29,['M27 8L8 10L4 48L29 45','M7 28L23 27']],
    B:[34,['M7 48L11 9C42 2 36 28 9 29C43 20 43 48 7 48']],
    A:[37,['M0 49L25 7L35 48','M9 34L32 32']],
    Y:[34,['M3 9L15 29L33 8','M15 29L10 49']],
    W:[48,['M4 9L5 48L25 17L26 47L46 7']],
    a:[25,['M23 26C9 18 0 39 7 46C19 54 25 28 23 26L20 47L27 43']],
    b:[26,['M7 46L16 6C19-3 1 18 6 34C23 13 33 35 21 44C14 50 6 48 7 43']],
    c:[22,['M23 25C11 16-1 34 5 44C9 50 18 46 23 42']],
    d:[27,['M22 26C8 19 0 39 6 46C18 53 27 25 29 5L20 46L29 42']],
    e:[23,['M4 37C27 34 24 18 12 25C-2 33 1 55 24 43']],
    g:[27,['M24 26C10 18 0 39 7 46C20 52 25 27 24 26L19 57C16 69-4 65 3 57L28 42']],
    i:[12,['M8 27L4 44Q5 50 14 42','M11 15L11.3 14']],
    j:[14,['M10 26L5 57C3 65-6 65-5 59','M13 15L13.3 14']],
    l:[14,['M6 40C25 12 15-7 7 13L2 42Q3 52 15 42']],
    m:[39,['M5 27L1 47C9 18 21 22 15 46C23 17 35 23 29 44Q30 49 39 41']],
    n:[27,['M6 26L2 47C12 18 26 21 19 44Q21 49 29 41']],
    o:[25,['M20 25C4 17-4 45 10 47C24 49 30 26 20 25C13 25 18 37 27 32']],
    r:[23,['M5 27L1 47L11 24Q18 33 23 26']],
    t:[19,['M13 13L6 42Q5 53 20 42','M1 28L22 25']],
    u:[26,['M7 25C-3 52 13 53 24 25L20 44Q22 50 29 42']],
    x:[24,['M3 27C15 22 11 47 23 44','M24 25L1 48']],
    z:[24,['M3 28Q14 23 24 26L3 46Q15 41 25 44']],
    '!':[12,['M10 8L5 34','M3 45L3.3 44']],
    ' ':[14,[]],
  };
  const ns='http://www.w3.org/2000/svg';
  function inkTitle(title,targetDuration=3.2) {
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-hidden','true');
    let x=15;const strokes=[];
    for(const char of title){
      const [width,paths]=glyphs[char];
      for(const d of paths)strokes.push({d,x,duration:d.length<22?.10:.22});
      x+=width+3;
    }
    const baseDuration=strokes.reduce((sum,stroke)=>sum+stroke.duration,0)+.45;
    const scale=Math.max(.25,targetDuration/baseDuration);let delay=.15;
    for(const stroke of strokes){
      const path=document.createElementNS(ns,'path'),duration=stroke.duration*scale;
      path.setAttribute('d',stroke.d);path.setAttribute('transform',`translate(${stroke.x} 2) skewX(-8)`);
      path.setAttribute('pathLength','1');path.style.setProperty('--ink-delay',`${delay}s`);
      path.style.setProperty('--ink-duration',`${duration}s`);svg.append(path);delay+=duration;
    }
    svg.setAttribute('viewBox',`0 0 ${x+10} 74`);
    const underline=document.createElementNS(ns,'path');
    underline.setAttribute('d',`M12 68Q${x/2} 54 ${x-6} 63`);underline.setAttribute('pathLength','1');
    underline.classList.add('completion-underline');underline.style.setProperty('--ink-delay',`${delay}s`);underline.style.setProperty('--ink-duration',`${.45*scale}s`);svg.append(underline);
    return svg;
  }
  function choose(record={},hour=new Date().getHours()){
    const kind=record.category||record.eventKey?.split(':').pop();
    const mapped={mood:'08',food:'05',nutrition:'05',diet:'05',sport:'06',exercise:'06',face:'04','bare-face-bonus':'04',sleep:'07',ai:'03',task:'03'};
    if(mapped[kind])return mapped[kind];
    if(kind==='focus')return /电脑|编程|代码|工作|computer|cod(e|ing)|work/i.test(String(record.data?.task||''))?'03':'02';
    return hour>=19||hour<6?'09':'01';
  }
  class CompletionScene {
    constructor(host,button){
      this.button=button;this.root=document.createElement('section');
      this.root.className='celebration-garden';this.root.hidden=true;host.append(this.root);
    }
    show({scene='01',locale='zh'}={}){
      if(!Object.hasOwn(scenes,scene))scene='01';
      const spec=scenes[scene],inkDuration=spec.inkDuration||3.2;this.root.hidden=false;this.root.dataset.scene=scene;this.root.dataset.motion=spec.motion;this.root.dataset.ink='writing';
      this.root.style.setProperty('--scene-color',spec.color);this.root.style.setProperty('--scene-copy-delay',`${inkDuration+.2}s`);this.root.style.setProperty('--scene-copy-duration',`${Math.max(.65,inkDuration/5)}s`);
      this.root.innerHTML='<div class="scene-plane" aria-hidden="true"><img class="garden-backdrop" alt=""><div class="scene-canopy"></div><div class="scene-light"></div><div class="garden-breeze"><i></i><i></i><i></i><i></i><i></i></div><div class="garden-actor"><span class="garden-contact"></span><img class="garden-actor-base" alt=""><span class="garden-actor-motion"></span></div><div class="scene-foreground"></div></div><div class="scene-copy"><h1 id="garden-title"></h1><p class="garden-message"></p></div><div class="garden-action"></div>';
      this.root.setAttribute('aria-labelledby','garden-title');
      const bg=scene==='01'?'assets/mint-garden-morning.png':`assets/completion/scene-${scene}.png`;
      this.root.querySelector('.garden-backdrop').src=bg;
      this.root.querySelector('.scene-plane').style.setProperty('--scene-art',`url("${new URL(bg,document.baseURI).href}")`);
      const actor=this.root.querySelector('.garden-actor'),cat=actor.querySelector('.garden-actor-base');
      const [w,h,left,top,right,bottom]=spec.box,bw=right-left,bh=bottom-top;
      actor.style.aspectRatio=`${bw}/${bh}`;actor.style.setProperty('--actor-mirror',spec.mirror?-1:1);if(spec.actorMotion)actor.dataset.motion=spec.actorMotion;
      cat.style.cssText=`width:${w/bw*100}%;height:${h/bh*100}%;left:${-left/bw*100}%;top:${-top/bh*100}%`;
      cat.decoding='async';cat.loading='eager';cat.fetchPriority='high';cat.src=`assets/completion/${spec.cat}`;
      if(spec.actorMotion==='typing')for(const part of ['ear-left','ear-right','paw','fur']){const image=cat.cloneNode();image.className=`garden-actor-part garden-actor-${part}`;image.alt='';image.setAttribute('aria-hidden','true');actor.querySelector('.garden-actor-motion').append(image);}
      const title=this.root.querySelector('h1');title.setAttribute('aria-label',spec.title);title.append(inkTitle(spec.title,inkDuration));
      this.root.querySelector('.completion-underline').addEventListener('animationend',()=>{this.root.dataset.ink='finished';},{once:true});
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.root.dataset.ink='finished';this.root.style.setProperty('--scene-copy-delay','0s');}
      this.root.querySelector('.garden-message').textContent=spec[locale==='en'?'en':'zh'];
      this.root.querySelector('.garden-action').append(this.button);this.button.classList.add('scene-continue');
      this.button.setAttribute('aria-label',locale==='en'?'Continue':'继续');
    }
    hide(){this.root.hidden=true;this.root.querySelectorAll('img').forEach(img=>img.removeAttribute('src'));this.root.replaceChildren();}
    destroy(){this.root.remove();}
  }
  window.NavaCompletionScene=CompletionScene;
  window.NavaCompletionScenes={choose,scenes};
})();
