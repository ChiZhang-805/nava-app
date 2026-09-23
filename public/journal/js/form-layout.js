/* 卡片可用高度决定空相框与末尾备注大小，不缩小字体，不把照片裁成固定比例。 */
__fluffyModules["form-layout.js"] = (() => {
    "use strict";
    class FormLayout {
        /**
         * 输入：panel（滚动视口）、form（当前类别表单）。
         * 输出：布局控制器。
         * 功能：在现有393×852设计坐标内测量排版，保留真实滚动与照片长宽比。
         */
        constructor(panel, form) {
            this.panel = panel;
            this.form = form;
            this.frame = 0;
            this.disposed = false;
            this.observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.schedule()) : null;
            this.observer?.observe(panel);
            this.resize = () => this.schedule();
            window.addEventListener("resize", this.resize);
            document.fonts?.ready.then(() => this.schedule());
            this.schedule();
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：合并同一帧内的字体/尺寸通知，避免重复测量或ResizeObserver写入循环。
         */
        schedule() {
            if (this.disposed || this.frame) return;
            this.frame = requestAnimationFrame(() => { this.frame = 0; this.fit(); });
        }
        /**
         * 输入：node（表单元素）。
         * 输出：未缩放的设计高度。
         * 功能：手机外框可整体缩放，计算表单高度时排除视觉缩放倍数。
         */
        height(node) {
            if (!node) return 0;
            const screen = this.panel.closest(".screen"), scale = screen.getBoundingClientRect().width / screen.clientWidth;
            return node.getBoundingClientRect().height / scale;
        }
        /**
         * 输入：node、property、value（设计像素值）。
         * 输出：无。
         * 功能：仅在目标值真正变化时写样式，避免抖动与不必要的布局更新。
         */
        setPixels(node, property, value) {
            if (node && Math.abs((parseFloat(node.style[property]) || 0) - value) > .4)
                node.style[property] = `${Math.round(value * 10) / 10}px`;
        }
        /**
         * 输入：无；读取当前类别、真实字段高度及卡片内边距。
         * 输出：无。
         * 功能：饮食首屏收在食物输入框；面部首屏收在感受框，底部收在三项完整观察记录。
         */
        fit() {
            if (this.disposed || this.panel.hidden || !this.form.isConnected) return;
            const style = getComputedStyle(this.panel), available = this.panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            const gap = parseFloat(getComputedStyle(this.form).rowGap) || 13;
            const id = this.form.dataset.category, preview = this.form.querySelector(".photo-preview");
            if (!available) return;
            // 阶段一：只调整等待状态。已上传照片继续由自然长宽比决定高度。
            if (preview && !preview.classList.contains("has-image")) {
                const tools = this.height(this.form.querySelector(".photo-tools"));
                if (id === "food") {
                    const meal = this.height(this.form.querySelector('[data-field="meal"]'));
                    const foods = this.height(this.form.querySelector('[data-field="foods"]'));
                    this.setPixels(preview, "height", Math.max(64, available - tools - meal - foods - 3 * gap - 2));
                } else if (id === "face") {
                    const feeling = this.height(this.form.querySelector('[data-field="feeling"]'));
                    this.setPixels(preview, "height", Math.max(120, available - tools - feeling - 2 * gap - 2));
                }
            }
            // 阶段二：面部页最后三项刚好占满一个视口，因此滚到底时眼周标题自然落在上沿。
            if (id === "face") {
                const eye = this.height(this.form.querySelector('[data-field="eyeArea"]'));
                const skin = this.height(this.form.querySelector('[data-field="skinAppearance"]'));
                const last = this.form.querySelector('[data-field="notes"]'), textarea = last?.querySelector("textarea");
                const header = this.height(last?.querySelector(".field-header"));
                const labelGap = last ? parseFloat(getComputedStyle(last).rowGap) || 7 : 7;
                this.setPixels(textarea, "height", Math.max(70, available - eye - skin - 2 * gap - header - labelGap));
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：切换表单时停止观察，防止旧回调修改新类别的布局。
         */
        destroy() {
            this.disposed = true;
            if (this.frame) cancelAnimationFrame(this.frame);
            this.observer?.disconnect();
            window.removeEventListener("resize", this.resize);
        }
    }
    return { FormLayout };
})();
