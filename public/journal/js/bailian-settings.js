__fluffyModules["bailian-settings.js"] = (() => {
    "use strict";
    const { BailianClient } = __fluffyModules["bailian.js"];
    class BailianSettings {
        /**
         * 输入：client、公开config、回调。
         * 输出：下拉控制器。
         * 功能：仅显示Key/启用/清除，状态由真实校验结果驱动。
         */
        constructor(client, config, { onOpen = () => { }, onClear = () => { }, onError = () => { }, onEnabled = () => { } } = {}) {
            this.client = client;
            this.config = config;
            this.onOpen = onOpen;
            this.onClear = onClear;
            this.onError = onError;
            this.onEnabled = onEnabled;
            this.serial = 0;
            this.root = document.getElementById("bailian-popover");
            this.button = document.getElementById("open-bailian");
            this.input = document.getElementById("bailian-key");
            this.feedback = document.getElementById("bailian-feedback");
            this.save = document.getElementById("save-bailian");
            this.indicator = document.getElementById("bailian-indicator");
            this.button.onclick = () => this.root.hidden ? this.open() : this.close();
            document.getElementById("bailian-form").onsubmit = e => { e.preventDefault(); this.enable(); };
            document.getElementById("forget-bailian").onclick = () => this.clear();
            document.addEventListener("pointerdown", e => {
                if (!this.root.hidden && !this.root.contains(e.target) && !this.button.contains(e.target))
                    this.close(false);
            });
            document.addEventListener("keydown", e => {
                if (e.key === "Escape" && !this.root.hidden) {
                    e.preventDefault();
                    this.close();
                }
            });
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：展开非模态菜单，不回显旧Key或遮挡整个手机。
         */
        open() { this.onOpen(); this.input.value = ""; this.feedback.textContent = ""; this.root.hidden = false; this.button.setAttribute("aria-expanded", "true"); this.input.focus({ preventScroll: true }); }
        /**
         * 输入：restoreFocus。
         * 输出：无。
         * 功能：取消未完成校验，关闭后不允许迟到响应启用Key。
         */
        close(restoreFocus = true) {
            this.serial++;
            this.task?.abort();
            this.task = null;
            this.root.hidden = true;
            this.input.value = "";
            this.save.disabled = false;
            this.save.textContent = "启用";
            this.button.setAttribute("aria-expanded", "false");
            if (restoreFocus)
                this.button.focus({ preventScroll: true });
        }
        /**
         * 输入：无，读取输入框。
         * 输出：Promise<void>。
         * 功能：用非生成接口校验候选Key，失败时保留已启用的旧Key。
         */
        async enable() {
            this.task?.abort();
            const controller = this.task = new AbortController(), serial = ++this.serial, candidate = new BailianClient({ config: this.config }), key = this.input.value;
            this.feedback.textContent = "";
            try {
                candidate.setKey(key);
                this.save.disabled = true;
                this.save.textContent = "验证中…";
                await candidate.check(controller.signal);
                if (serial !== this.serial || controller.signal.aborted)
                    return;
                this.client.setKey(key);
                __fluffyModules["display-language.js"]?.retry();
                this.indicator.classList.add("enabled");
                this.task = null;
                this.close();
                this.onEnabled();
            }
            catch (e) {
                if (serial === this.serial && e.name !== "AbortError")
                    this.onError(e);
            }
            finally {
                candidate.clear();
                if (serial === this.serial) {
                    this.task = null;
                    this.save.disabled = false;
                    this.save.textContent = "启用";
                }
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：清除密钥、取消媒体/模型请求但保留已填记录。
         */
        clear() { this.serial++; this.task?.abort(); this.task = null; this.onClear(); this.client.clear(); this.input.value = ""; this.feedback.textContent = ""; this.save.disabled = false; this.save.textContent = "启用"; this.indicator.classList.remove("enabled"); }
    }
    return { BailianSettings };
})();
