__fluffyModules["gesture.js"] = (() => {
class HoldGesture {
    /**
     * 输入：button（交互元素）、actions（短按/长按/松开/取消回调）、delay（长按毫秒数）。
     * 输出：HoldGesture 实例。
     * 功能：统一鼠标、触屏和键盘；长按后不再触发一次短按提交。
     */
    constructor(button, actions, delay = 420) {
        this.button = button; this.actions = actions; this.delay = delay;
        this.pressed = false; this.long = false; this.pointerId = null;
        button.addEventListener("pointerdown", event => {
            if (event.button !== 0 || !event.isPrimary || button.disabled) return;
            event.preventDefault();
            this.pointerId = event.pointerId;
            try { button.setPointerCapture(event.pointerId); } catch { /* 旧浏览器仍由 window pointerup 兜底。 */ }
            this.begin();
        });
        window.addEventListener("pointerup", event => { if (event.pointerId === this.pointerId) this.end(false); });
        window.addEventListener("pointercancel", event => { if (event.pointerId === this.pointerId) this.end(true); });
        button.addEventListener("lostpointercapture", () => { if (this.pressed) this.end(true); });
        button.addEventListener("contextmenu", event => event.preventDefault());
        button.addEventListener("keydown", event => {
            if (event.code === "Space") { event.preventDefault(); if (!event.repeat && !this.pressed) this.begin(); }
            if (event.key === "Escape") { event.preventDefault(); this.end(true); }
        });
        button.addEventListener("keyup", event => { if (event.code === "Space") { event.preventDefault(); this.end(false); } });
        // Enter 或辅助技术产生 detail=0 的 click；Space 已在上方处理，避免双提交。
        button.addEventListener("click", event => { event.preventDefault(); if (event.detail === 0 && !this.pressed && performance.now() - (this.endedAt || -9999) > 200) actions.short(); });
        window.addEventListener("blur", () => this.end(true));
        document.addEventListener("visibilitychange", () => { if (document.hidden) this.end(true); });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：只在达到阈值后才申请麦克风，普通点击不会触发权限弹窗。
     */
    begin() {
        if (this.pressed || this.button.disabled) return;
        this.pressed = true; this.long = false;
        this.timer = setTimeout(() => {
            if (!this.pressed) return;
            this.long = true;
            this.actions.long();
        }, this.delay);
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：首次授权前解除按压，不触发短按、松开或取消回调，避免浏览器弹窗打断授权。
     */
    disarm() {
        const pointerId = this.pointerId;
        this.pressed = false; this.long = false; this.pointerId = null;
        this.endedAt = performance.now();
        clearTimeout(this.timer);
        if (pointerId != null && this.button.hasPointerCapture?.(pointerId)) {
            try { this.button.releasePointerCapture(pointerId); } catch { /* 捕获可能已经由浏览器释放。 */ }
        }
    }
    /**
     * 输入：cancel（是否取消当前手势）。
     * 输出：无。
     * 功能：先清理捕获与定时器，再调用对应动作，任何一次按压最多提交一次。
     */
    end(cancel = false) {
        if (!this.pressed) return;
        const wasLong = this.long, pointerId = this.pointerId;
        this.pressed = false; this.long = false; this.pointerId = null; this.endedAt = performance.now();
        clearTimeout(this.timer);
        if (pointerId != null && this.button.hasPointerCapture?.(pointerId)) this.button.releasePointerCapture(pointerId);
        if (cancel) this.actions.cancel();
        else if (wasLong) this.actions.release();
        else this.actions.short();
    }
}

return {HoldGesture};
})();
