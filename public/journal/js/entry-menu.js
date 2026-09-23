/* 六类记录共用的省空间菜单与本地日历；操作只更改草稿元数据，不提前保存记录。 */
__fluffyModules["entry-menu.js"] = (() => {
    "use strict";
    const L = __fluffyModules["entry-i18n.js"], D = __fluffyModules["sleep-time.js"];
    const SVG = {
        more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
        date: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M7 3v4m10-4v4M4 10h16M8 14h3m2 0h3m-8 3h3"/></svg>',
        language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg>'
    };
    /**
     * 输入：标签、类名、文本。
     * 输出：DOM节点。
     * 功能：所有文案以纯文本写入，不把记录内容当HTML。
     */
    function node(tag, cls = "", text = "") { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
    class EntryMenu {
        /**
         * 输入：screen和状态/操作钩子。
         * 输出：控制器。
         * 功能：一次挂载菜单，后续语言/日期变化不重建表单。
         */
        constructor(screen, hooks) {
            this.screen = screen;
            this.h = hooks;
            this.mode = "";
            this.button = node("button", "entry-more");
            this.button.id = "entry-more";
            this.button.type = "button";
            this.button.innerHTML = FluffyIcons.svg("more");
            this.button.setAttribute("aria-haspopup", "menu");
            this.button.setAttribute("aria-controls", "entry-menu");
            this.button.setAttribute("aria-expanded", "false");
            this.menu = node("div", "entry-menu");
            this.menu.id = "entry-menu";
            this.menu.hidden = true;
            this.menu.setAttribute("role", "menu");
            this.panel = node("section", "entry-options");
            this.panel.id = "entry-options";
            this.panel.hidden = true;
            this.panel.setAttribute("role", "dialog");
            this.panel.tabIndex = -1;
            this.dateBadge = node("button", "entry-date-badge");
            this.dateBadge.type = "button";
            this.dateBadge.id = "entry-date-badge";
            screen.append(this.button, this.menu, this.panel);
            document.querySelector("#entry-heading").append(this.dateBadge);
            this.button.onclick = () => this.toggle();
            this.dateBadge.onclick = () => this.showCalendar();
            document.addEventListener("pointerdown", event => {
                if (![this.button, this.menu, this.panel, this.dateBadge].some(n => n.contains(event.target)))
                    this.close(false);
            });
            document.addEventListener("keydown", event => this.keydown(event));
            this.sync();
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：同步可见性、日期标识；渲染循环中不重复重建菜单。
         */
        sync() {
            const active = this.h.scene() === "entry";
            const signature = `${active}:${this.h.date()}:${L.language()}`;
            if (this.signature === signature)
                return;
            this.signature = signature;
            this.button.hidden = !active;
            this.button.setAttribute("aria-label", L.t("记录菜单"));
            const date = this.h.date(), past = date !== D.dateKey();
            this.dateBadge.hidden = !active || !past;
            const text = L.dateLabel(date);
            if (this.dateBadge.textContent !== text)
                this.dateBadge.textContent = text;
            this.dateBadge.setAttribute("aria-label", `${L.t("记录日期")} ${text}`);
            if (!active)
                this.close(false);
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：打开日期、语言和板块回顾菜单，使用四字中文短语。
         */
        toggle() {
            if (!this.menu.hidden) {
                this.close();
                return;
            }
            this.h.beforeOpen?.();
            this.close(false);
            this.mode = "menu";
            this.menu.replaceChildren();
            for (const [kind, label, action] of [["date", "调整日期", () => this.showCalendar()], ["language", "语言切换", () => this.showLanguages()], ["history", "数据回顾", () => { this.close(false); this.h.recap(); }]]) {
                const b = node("button", "", L.t(label));
                b.type = "button";
                b.setAttribute("role", "menuitem");
                b.dataset.action = kind;
                b.insertAdjacentHTML("afterbegin", FluffyIcons.svg(kind === "date" ? "calendar" : kind));
                b.onclick = action;
                this.menu.append(b);
            }
            this.menu.hidden = false;
            this.button.setAttribute("aria-expanded", "true");
            this.menu.querySelector("button").focus({ preventScroll: true });
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：提供中文/英文即时切换，不刷新页面、不丢弃图片和草稿。
         */
        showLanguages() {
            this.close(false);
            this.mode = "language";
            this.panel.className = "entry-options language-options";
            this.panel.replaceChildren(node("h3", "", L.t("语言切换")));
            for (const [code, name] of [["zh", "中文"], ["en", "English"]]) {
                const b = node("button", "language-option", name);
                b.type = "button";
                b.dataset.language = code;
                b.setAttribute("aria-pressed", String(code === L.language()));
                b.onclick = () => { this.h.language(code); this.close(); this.sync(); };
                this.panel.append(b);
            }
            this.panel.setAttribute("aria-label", L.t("语言切换"));
            this.panel.hidden = false;
            this.button.setAttribute("aria-expanded", "true");
            this.panel.querySelector("button").focus({ preventScroll: true });
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：日历先修改候选，只有确定才改变记录日，浏览月份不影响草稿。
         */
        showCalendar() {
            this.h.beforeOpen?.();
            this.close(false);
            this.mode = "date";
            this.candidate = this.h.date();
            this.cursor = this.candidate;
            this.month = this.candidate.slice(0, 7) + "-01";
            this.renderCalendar();
            this.panel.hidden = false;
            this.button.setAttribute("aria-expanded", "true");
            this.panel.querySelector(`[data-date="${this.candidate}"]`)?.focus({ preventScroll: true });
        }
        /**
         * 输入：方向（整月偏移）。
         * 输出：无。
         * 功能：月份导航保留当前候选并限制到本地当月，不提供未来记录。
         */
        moveMonth(direction) {
            const [y, m] = this.month.split("-").map(Number), next = D.dateKey(new Date(y, m - 1 + direction, 1, 12));
            if (next < "1900-01-01" || next.slice(0, 7) > D.dateKey().slice(0, 7))
                return;
            this.month = next;
            this.renderCalendar();
            this.panel.querySelector(direction < 0 ? ".date-prev" : ".date-next")?.focus({ preventScroll: true });
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：主题化月历，周一开头、未来禁选、完整日期ARIA，不使用UTC解析。
         */
        renderCalendar() {
            this.panel.className = "entry-options date-options";
            this.panel.setAttribute("aria-label", L.t("调整日期"));
            this.panel.replaceChildren();
            // 阶段一：月份导航与星期标题，日期按钮本身始终存储YYYY-MM-DD。
            const head = node("div", "date-head"), prev = node("button", "date-prev", "‹"), next = node("button", "date-next", "›");
            prev.type = next.type = "button";
            prev.setAttribute("aria-label", L.t("上一月"));
            next.setAttribute("aria-label", L.t("下一月"));
            prev.disabled = this.month <= "1900-01-01";
            next.disabled = this.month.slice(0, 7) >= D.dateKey().slice(0, 7);
            prev.onclick = () => this.moveMonth(-1);
            next.onclick = () => this.moveMonth(1);
            head.append(prev, node("h3", "", L.dateLabel(this.month, { year: "numeric", month: "long" })), next);
            this.panel.append(head);
            const weekdays = node("div", "date-weekdays");
            (L.language() === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["一", "二", "三", "四", "五", "六", "日"]).forEach(day => weekdays.append(node("span", "", day)));
            this.panel.append(weekdays);
            // 阶段二：每次显示完整的六周网格；键盘候选与已选日期分开，避免无意提交。
            const grid = node("div", "date-grid");
            const [y, m] = this.month.split("-").map(Number), start = new Date(y, m - 1, 1, 12);
            const offset = (start.getDay() + 6) % 7;
            for (let i = 0; i < 42; i++) {
                const date = D.dateKey(new Date(y, m - 1, 1 - offset + i, 12)), b = node("button", "date-day", String(Number(date.slice(-2))));
                b.type = "button";
                b.dataset.date = date;
                b.classList.toggle("outside", date.slice(0, 7) !== this.month.slice(0, 7));
                b.classList.toggle("selected", date === this.candidate);
                b.disabled = date > D.dateKey() || date < "1900-01-01";
                b.setAttribute("aria-label", L.dateLabel(date));
                b.setAttribute("aria-pressed", String(date === this.candidate));
                if (date === D.dateKey())
                    b.setAttribute("aria-current", "date");
                b.tabIndex = date === this.cursor ? 0 : -1;
                b.onclick = () => { this.candidate = date; this.cursor = date; this.renderCalendar(); this.panel.querySelector(`[data-date="${date}"]`)?.focus({ preventScroll: true }); };
                grid.append(b);
            }
            this.panel.append(grid);
            // 阶段三：明确的恢复今天、取消、确定入口；错误不隐藏也不自动覆盖原日期。
            const foot = node("div", "date-actions"), today = node("button", "date-today", L.t("回到今天")), cancel = node("button", "date-cancel", L.t("取消")), save = node("button", "date-save", L.t("确定日期"));
            today.type = cancel.type = save.type = "button";
            today.onclick = () => { this.candidate = D.dateKey(); this.cursor = this.candidate; this.month = this.candidate.slice(0, 7) + "-01"; this.renderCalendar(); this.panel.querySelector(".date-save").focus(); };
            cancel.onclick = () => this.close();
            save.onclick = () => {
                if (this.h.changeDate(this.candidate) !== false) {
                    this.close();
                    this.sync();
                }
            };
            foot.append(today, cancel, save);
            this.panel.append(foot);
        }
        /**
         * 输入：键盘事件。
         * 输出：无。
         * 功能：菜单方向键、日历按天/周/月导航、Escape取消及Tab焦点循环。
         */
        keydown(event) {
            if (!this.mode)
                return;
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.close();
                return;
            }
            if (this.mode === "menu" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const items = [...this.menu.querySelectorAll("button")], i = items.indexOf(document.activeElement);
                items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
                return;
            }
            if (this.mode === "date" && event.target.dataset.date && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
                event.preventDefault();
                const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                if (event.key.startsWith("Page")) {
                    this.moveMonth(event.key === "PageUp" ? -1 : 1);
                    return;
                }
                const next = D.addDays(event.target.dataset.date, offsets[event.key]);
                if (next > D.dateKey() || next < "1900-01-01")
                    return;
                this.cursor = next;
                this.month = next.slice(0, 7) + "-01";
                this.renderCalendar();
                this.panel.querySelector(`[data-date="${next}"]`).focus({ preventScroll: true });
                return;
            }
            if (event.key === "Tab") {
                const root = this.mode === "menu" ? this.menu : this.panel, items = [...root.querySelectorAll("button:not(:disabled)")].filter(n => n.tabIndex >= 0), i = items.indexOf(document.activeElement);
                if (event.shiftKey && i <= 0) {
                    event.preventDefault();
                    items.at(-1)?.focus();
                }
                else if (!event.shiftKey && i === items.length - 1) {
                    event.preventDefault();
                    items[0]?.focus();
                }
            }
        }
        /**
         * 输入：restoreFocus（是否归还焦点）。
         * 输出：无。
         * 功能：关闭浮层不提交候选日期，切页时不残留遮挡。
         */
        close(restoreFocus = true) {
            const open = Boolean(this.mode);
            this.mode = "";
            this.menu.hidden = true;
            this.panel.hidden = true;
            this.button.setAttribute("aria-expanded", "false");
            if (open && restoreFocus && !this.button.hidden)
                this.button.focus({ preventScroll: true });
        }
    }
    return { EntryMenu };
})();
