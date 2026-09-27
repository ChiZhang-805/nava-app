/* The shared scene owns presentation. The journal retains the real save,
 * Continue gate and review navigation; no reward is awarded from an animation. */
window.NavaGardenCelebration = class {
    constructor() {
        this.active=false;
        this.primary=document.getElementById('primary');
        this.label=document.getElementById('primary-label');
        this.marker=document.createComment('journal-primary');this.primary.before(this.marker);
        this.stage=document.querySelector('.stage');
        this.scene=new window.NavaCompletionScene(this.stage,this.primary);
    }
    prepare(record) {
        const id=window.NavaCompletionScenes.choose(record);
        if(this.preparedScene===id)return;
        this.preparedScene=id;
        const cat=window.NavaCompletionScenes.scenes[id].cat;
        this.prepared=[id==='01'?'assets/mint-garden-morning.png':`assets/completion/scene-${id}.png`,`assets/completion/${cat}`].map(src=>{
            const image=new Image();image.decoding='async';image.src=src;return image;
        });
    }
    update(scene,_time,record) {
        const active=scene==='celebrate';
        if(active!==this.active){
            this.active=active;this.stage.classList.toggle('has-garden-celebration',active);
            if(active){
                this.scene.show({scene:window.NavaCompletionScenes.choose(record),locale:__fluffyModules['entry-i18n.js'].language()});
                this.stage.scrollTop=0;
            }else{
                this.marker.after(this.primary);this.primary.classList.remove('scene-continue');
                this.primary.removeAttribute('aria-label');this.scene.hide();
            }
        }
        if(active&&this.label.textContent!=='Continue')this.label.textContent='Continue';
    }
};
