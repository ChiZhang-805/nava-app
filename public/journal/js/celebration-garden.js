/* Scene 01: original GIF-derived animation, full-viewport garden and one-shot ink.
 * Presentation only: the existing confirmed-save transition and Continue handler own navigation. */
window.NavaGardenCelebration = class {
    constructor(title) {
        this.title = title;
        this.active = false;
        this.inkFinished = false;
        this.primary = document.getElementById('primary');
        this.buttonMarker = document.createComment('journal-primary');
        this.primary.before(this.buttonMarker);
        this.stage = document.querySelector('.stage');
        this.root = document.createElement('section');
        this.root.className = 'celebration-garden';
        this.root.hidden = true;
        this.root.setAttribute('aria-labelledby', 'garden-title');
        this.root.innerHTML = `
          <img class="garden-backdrop" src="assets/mint-garden-morning.png" alt="" decoding="async">
          <div class="garden-breeze" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="garden-composition">
            <div class="garden-sky-space" aria-hidden="true"></div>
            <h1 id="garden-title"><span class="sr-only">Great job!</span><canvas width="600" height="210" aria-hidden="true"></canvas></h1>
            <p class="garden-message"></p>
            <div class="garden-ground" aria-hidden="true">
              <div class="garden-actor"><span class="garden-contact"></span><img src="assets/garden-cat.webp" alt="" decoding="async"></div>
            </div>
            <div class="garden-grass-space" aria-hidden="true"></div>
            <div class="garden-action"></div>
          </div>`;
        this.stage.append(this.root);
        this.canvas = this.root.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.message = this.root.querySelector('.garden-message');
        this.label = document.getElementById('primary-label');
        this.ground = this.root.querySelector('.garden-ground');
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        // Preload one native animated image. Never decode/cache all 90 frames in JS.
        this.cat = this.root.querySelector('.garden-actor img');
        this.cat.addEventListener('error', () => { this.root.dataset.artworkError = 'true'; });
    }

    update(scene, time, record) {
        const active = scene === 'celebrate';
        if (active !== this.active) {
            this.active = active;
            this.root.hidden = !active;
            this.stage.classList.toggle('has-garden-celebration', active);
            if (active) {
                this.inkFinished = false;
                this.root.dataset.ink = 'writing';
                this.root.querySelector('.garden-action').append(this.primary);
                this.stage.scrollTop = 0;
            } else {
                this.buttonMarker.after(this.primary);
                this.primary.removeAttribute('aria-label');
                this.primary.querySelector('svg').removeAttribute('data-garden-arrow');
            }
        }
        if (!active) return;
        const locale = __fluffyModules['entry-i18n.js'].language();
        if (this.locale !== locale || this.record !== record) {
            this.locale = locale;
            this.record = record;
            this.message.textContent = locale === 'en'
                ? 'Another little moment, saved.\nKeep growing, one day at a time.'
                : '又完成了一项记录！\n继续保持这份美好～';
            this.primary.setAttribute('aria-label', locale === 'en' ? 'Continue to your recap' : '继续查看记录回顾');
            this.primary.querySelector('svg').setAttribute('data-garden-arrow', 'true');
        }
        // The app retains the button's disabled/save gate and click handler.
        if (this.label.textContent !== 'Continue') this.label.textContent = 'Continue';
        if (this.inkFinished) return;
        const inkTime = this.motion.matches ? this.title.end + 1 : time;
        const ctx = this.ctx;
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 300, 105);
        ctx.save();
        ctx.translate(-48, -133);
        this.title.draw(ctx, inkTime);
        ctx.restore();
        // The original title is white ink. Tint its exact alpha, preserving every stroke.
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#14364b';
        ctx.fillRect(0, 0, 300, 105);
        ctx.globalCompositeOperation = 'source-over';
        const underline = Math.max(0, Math.min(1, (inkTime - this.title.end) / .65));
        if (underline > 0) {
            ctx.save();
            ctx.beginPath();ctx.rect(24, 82, 254 * underline, 23);ctx.clip();
            ctx.beginPath();ctx.moveTo(26, 99);ctx.quadraticCurveTo(150, 75, 274, 91);
            ctx.strokeStyle = '#69af94';ctx.lineWidth = 3.6;ctx.lineCap = 'round';ctx.stroke();
            ctx.restore();
        }
        if (underline === 1) { this.inkFinished = true; this.root.dataset.ink = 'finished'; }
    }
};
