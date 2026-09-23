/* 同一行的睡眠区间；真实表单值仍是 HH:mm，日期由 sleep-time.js 管理。 */
__fluffyModules["time-range-picker.js"] = (() => {
    "use strict";
    const { clock } = __fluffyModules["sleep-time.js"];
    /**
     * 输入：tag、className、text（受控文字）。
     * 输出：新元素。
     * 功能：创建时间控件 DOM，所有文字安全写入而不拼接用户 HTML。
     */
    function node(tag, className = "", text = "") {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        return element;
    }
    class TimeRangePicker {
        /**
         * 输入：screen（未缩放设计容器）、values（两个 HH:mm）、onInput（已修改字段回调）。
         * 输出：具有 element 属性的区间选择器实例。
         * 功能：合并视觉表单；保留两个独立字段，保证语音回填和修改保护继续有效。
         */
        constructor(screen, values = {}, onInput = () => {}) {
            this.screen = screen;
            this.onInput = onInput;
            this.inputs = new Map();
            this.triggers = [];
            this.active = null;
            this.typeBuffer = "";
            this.typeAt = 0;
            this.element = node("div", "field time-range-field");
            this.element.setAttribute("role", "group");
            this.element.setAttribute("aria-labelledby", "sleep-range-label");
            const title = node("span", "field-header", "睡眠时间");
            title.id = "sleep-range-label";
            this.element.append(title);
            const line = node("div", "time-range-line");
            this.element.append(line);
            // 阶段一：两个时刻共用外框，每个小时/分钟仍可单独操作。
            for (const [key, label] of [["bedtime", "入睡"], ["wakeTime", "醒来"]]) {
                if (key === "wakeTime") {
                    const dash = node("span", "time-range-dash", "—");
                    dash.setAttribute("aria-hidden", "true");
                    line.append(dash);
                }
                const group = node("span", "time-endpoint");
                group.setAttribute("role", "group");
                group.setAttribute("aria-label", `${label}时间`);
                const input = node("input");
                input.type = "hidden";
                input.name = key;
                input.id = `field-${key}`;
                input.value = clock(values[key]) || "";
                this.inputs.set(key, input);
                group.append(input);
                for (const [part, unit] of [[0, "小时"], [1, "分钟"]]) {
                    if (part) {
                        const colon = node("span", "time-colon", ":");
                        colon.setAttribute("aria-hidden", "true");
                        group.append(colon);
                    }
                    const button = node("button", "time-part", "--");
                    button.type = "button";
                    button.dataset.key = key;
                    button.dataset.part = part;
                    button.setAttribute("role", "combobox");
                    button.setAttribute("aria-label", `${label}${unit}`);
                    button.setAttribute("aria-haspopup", "listbox");
                    button.setAttribute("aria-expanded", "false");
                    button.setAttribute("aria-controls", "sleep-time-options");
                    button.setAttribute("aria-autocomplete", "none");
                    button.addEventListener("click", () => this.active === button ? this.close() : this.open(button));
                    button.addEventListener("keydown", event => this.keydown(event, button));
                    group.append(button);
                    this.triggers.push(button);
                }
                input.addEventListener("input", () => {
                    this.sync();
                    onInput(key);
                });
                line.append(group);
            }
            // 阶段二：下拉层在 screen 内，跳出表单裁切区，但不会跑到手机外。
            this.popup = node("div", "time-options");
            this.popup.id = "sleep-time-options";
            this.popup.setAttribute("role", "listbox");
            this.popup.hidden = true;
            screen.append(this.popup);
            this.outside = event => {
                if (!this.element.contains(event.target) && !this.popup.contains(event.target)) this.close(false);
            };
            this.onBlur = () => this.close(false);
            this.onScroll = event => {
                if (this.active && event.target !== this.popup && !this.popup.contains(event.target)) this.position();
            };
            document.addEventListener("pointerdown", this.outside, true);
            window.addEventListener("blur", this.onBlur);
            window.addEventListener("resize", this.onBlur);
            screen.addEventListener("scroll", this.onScroll, true);
            this.sync();
        }
        /**
         * 输入：无；读取隐藏字段的标准 HH:mm。
         * 输出：无。
         * 功能：同步手动/AI/历史回填与错误外观，不把同步误报成用户编辑。
         */
        sync() {
            for (const button of this.triggers) {
                const input = this.inputs.get(button.dataset.key), text = clock(input.value);
                button.textContent = text ? text.split(":")[Number(button.dataset.part)] : "--";
                button.classList.toggle("empty", !text);
                button.setAttribute("aria-invalid", input.getAttribute("aria-invalid") || "false");
            }
            this.element.classList.toggle("invalid", this.triggers.some(button => button.getAttribute("aria-invalid") === "true"));
        }
        /**
         * 输入：trigger（小时或分钟按钮）。
         * 输出：无。
         * 功能：显示主题化数值下拉菜单；打开只导航，不更改用户时间。
         */
        open(trigger) {
            this.close(false);
            this.active = trigger;
            this.typeBuffer = "";
            this.popup.replaceChildren();
            const count = Number(trigger.dataset.part) === 0 ? 24 : 60;
            const text = trigger.textContent;
            this.index = text === "--" ? 0 : Number(text);
            this.originalIndex = text === "--" ? -1 : this.index;
            this.popup.setAttribute("aria-label", trigger.getAttribute("aria-label"));
            for (let i = 0; i < count; i++) {
                const option = node("div", "time-option", String(i).padStart(2, "0"));
                option.id = `sleep-time-option-${i}`;
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", String(i === this.originalIndex));
                option.addEventListener("pointerdown", event => { if (event.pointerType !== "touch") event.preventDefault(); });
                option.addEventListener("click", () => this.commit(i));
                this.popup.append(option);
            }
            trigger.setAttribute("aria-expanded", "true");
            this.popup.hidden = false;
            this.position();
            this.highlight();
            trigger.focus({ preventScroll: true });
        }
        /**
         * 输入：无；读取触发器和手机的实际缩放矩形。
         * 输出：无。
         * 功能：按设计坐标定位下拉框，优先向下，空间不足时翻转向上。
         */
        position() {
            if (!this.active) return;
            const screen = this.screen.getBoundingClientRect(), trigger = this.active.getBoundingClientRect();
            const scale = screen.width / this.screen.clientWidth;
            const width = 88, height = 184;
            const left = Math.max(16, Math.min(393 - width - 16, (trigger.left - screen.left + trigger.width / 2) / scale - width / 2));
            const below = (trigger.bottom - screen.top) / scale + 7;
            const top = below + height < 812 ? below : (trigger.top - screen.top) / scale - height - 7;
            this.popup.style.left = `${left}px`;
            this.popup.style.top = `${Math.max(60, top)}px`;
        }
        /**
         * 输入：无；读取当前候选索引。
         * 输出：无。
         * 功能：键盘候选进入视区，只滚动选项列表，不带动整个记录卡片。
         */
        highlight() {
            const items = [...this.popup.children];
            items.forEach((item, i) => item.classList.toggle("active", i === this.index));
            const item = items[this.index];
            if (!item || !this.active) return;
            this.active.setAttribute("aria-activedescendant", item.id);
            this.popup.scrollTop = Math.max(0, item.offsetTop - (this.popup.clientHeight - item.offsetHeight) / 2);
        }
        /**
         * 输入：event、trigger。
         * 输出：无。
         * 功能：支持方向键、Home/End、数字定位、Enter确定与Escape取消，不抢走普通Tab导航。
         */
        keydown(event, trigger) {
            if (event.key === "Tab") { this.close(false); return; }
            if (event.key === "Escape") { event.preventDefault(); this.close(); return; }
            if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key) && !/^\d$/.test(event.key)) return;
            event.preventDefault();
            const wasOpen = this.active === trigger;
            if (!wasOpen) this.open(trigger);
            const count = this.popup.children.length;
            if (event.key === "Enter" || event.key === " ") { if (wasOpen) this.commit(this.index); return; }
            if (event.key === "ArrowDown" && wasOpen) this.index = Math.min(count - 1, this.index + 1);
            if (event.key === "ArrowUp" && wasOpen) this.index = Math.max(0, this.index - 1);
            if (event.key === "Home") this.index = 0;
            if (event.key === "End") this.index = count - 1;
            if (/^\d$/.test(event.key)) {
                if (performance.now() - this.typeAt > 900) this.typeBuffer = "";
                this.typeBuffer = (this.typeBuffer + event.key).slice(-2);
                this.typeAt = performance.now();
                const candidate = Number(this.typeBuffer);
                this.index = candidate < count ? candidate : Number(event.key);
            }
            this.highlight();
        }
        /**
         * 输入：value（合法数值选项）。
         * 输出：无。
         * 功能：确认一个数值后回写HH:mm；未设置的另一部分默认为00，并触发真实字段编辑事件。
         */
        commit(value) {
            if (!this.active) return;
            const button = this.active, input = this.inputs.get(button.dataset.key);
            const parts = (clock(input.value) || "00:00").split(":");
            parts[Number(button.dataset.part)] = String(value).padStart(2, "0");
            input.value = parts.join(":");
            input.setAttribute("aria-invalid", "false");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            this.close();
        }
        /**
         * 输入：key（bedtime或wakeTime）。
         * 输出：无。
         * 功能：提交发现时间缺失时，定位可操作按钮而不是隐藏的兼容字段。
         */
        focus(key) { this.triggers.find(button => button.dataset.key === key)?.focus({ preventScroll: true }); }
        /**
         * 输入：restore（是否归还焦点）。
         * 输出：无。
         * 功能：只关闭下拉菜单，不清空或偷偷应用未确定的候选值。
         */
        close(restore = true) {
            const trigger = this.active;
            if (trigger) {
                trigger.setAttribute("aria-expanded", "false");
                trigger.removeAttribute("aria-activedescendant");
            }
            this.active = null;
            this.popup.hidden = true;
            if (restore && trigger?.isConnected) trigger.focus({ preventScroll: true });
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：更换记录类别时移除浮层与事件监听，不残留重复控件。
         */
        destroy() {
            this.close(false);
            this.popup.remove();
            document.removeEventListener("pointerdown", this.outside, true);
            window.removeEventListener("blur", this.onBlur);
            window.removeEventListener("resize", this.onBlur);
            this.screen.removeEventListener("scroll", this.onScroll, true);
        }
    }
    return { TimeRangePicker };
})();
