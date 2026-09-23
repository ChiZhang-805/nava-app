/* 六个真实组件，八个可放置位置；九宫格右下角永远留给原样气泡。手势只改变布局，不触发菜单或重复点击。 */
__fluffyModules["home-board.js"] = (() => {
    "use strict";
    const { CATEGORIES, DEFAULT_ORDER, summary } = __fluffyModules["catalog.js"];
    const Store = __fluffyModules["journal-store.js"];
    const KEY = "fluffy-home-slots-v3", LEGACY_KEY = "fluffy-home-slots-v2", RESERVED_SLOT = 8;
    const SLOTS = Array.from({ length: 9 }, (_, i) => [18 + i % 3 * 121, 151 + Math.floor(i / 3) * 124]);
    const DEFAULT_SLOTS = ["mood", "food", null, null, "focus", "sport", "sleep", "face", null];
    /**
     * 输入：原始布局（旧6项或新9项）。
     * 输出：九格容器、八个可放位置、六个唯一类别的布局。
     * 功能：迁移旧顺序，修复重复/坏值，保留合法空位。
     */
    function normalizeSlots(raw) {
        if (!Array.isArray(raw))
            return [...DEFAULT_SLOTS];
        if (raw.length === 6) {
            const migrated = Array(9).fill(null), indices = [0, 1, 4, 5, 6, 7];
            raw.forEach((id, i) => migrated[indices[i]] = id);
            raw = migrated;
        }
        const seen = new Set();
        const slots = Array.from({ length: 9 }, (_, i) => {
            if (i === RESERVED_SLOT)
                return null;
            const id = raw[i];
            if (!Object.hasOwn(CATEGORIES, id) || seen.has(id))
                return null;
            seen.add(id);
            return id;
        });
        // 先迁移旧版右下角组件到第一个合法空位，其余位置不变。
        for (const id of [raw[RESERVED_SLOT], ...DEFAULT_ORDER]) {
            if (!Object.hasOwn(CATEGORIES, id) || seen.has(id))
                continue;
            const free = slots.findIndex((item, i) => i !== RESERVED_SLOT && item === null);
            if (free >= 0) {
                slots[free] = id;
                seen.add(id);
            }
        }
        return slots;
    }
    /**
     * 输入：slots、from、to。
     * 输出：新布局。
     * 功能：空位移动或占位交换，永远不挤乱其他组件。
     */
    function exchange(slots, from, to) {
        const next = [...slots];
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 8 || to < 0 || to >= RESERVED_SLOT || from === RESERVED_SLOT || !next[from])
            return next;
        [next[from], next[to]] = [next[to], next[from]];
        return next;
    }
    /**
     * 输入：九宫格设计坐标 x/y。
     * 输出：槽位索引或 -1。
     * 功能：网格外无效，空隙只吸附附近位置，不把屏幕外拖放当成功。
     */
    function slotAt(x, y) {
        if (x < 12 || x > 378 || y < 145 || y > 518)
            return -1;
        // 禁放区含边缘缓冲，不能被最近邻吸附误判为相邻组件。
        if (x >= 255 && y >= 390)
            return -1;
        let best = -1, distance = Infinity;
        for (let i = 0; i < SLOTS.length; i++) {
            if (i === RESERVED_SLOT)
                continue;
            const [sx, sy] = SLOTS[i], d = Math.hypot(sx + 56 - x, sy + 55 - y);
            if (Math.abs(sx + 56 - x) <= 63 && Math.abs(sy + 55 - y) <= 64 && d < distance) {
                best = i;
                distance = d;
            }
        }
        return best;
    }
    class HomeBoard {
        /**
         * 输入：root、actions。
         * 输出：控制器。
         * 功能：构造九宫格、六卡片和键盘可访问的拖放交互。
         */
        constructor(root, actions) {
            this.root = root;
            this.actions = actions;
            this.press = null;
            this.cards = new Map();
            this.order = normalizeSlots(Store.read(KEY, Store.read(LEGACY_KEY, Store.read("fluffy-home-order-v1", DEFAULT_SLOTS))));
            Store.write(KEY, this.order);
            this.guides = SLOTS.map((slot, i) => {
                const n = document.createElement("div");
                n.className = "home-slot-guide";
                n.dataset.slot = i;
                if (i === RESERVED_SLOT)
                    n.hidden = true;
                n.setAttribute("aria-hidden", "true");
                n.style.left = slot[0] + "px";
                n.style.top = slot[1] + "px";
                root.append(n);
                return n;
            });
            this.live = document.createElement("p");
            this.live.className = "sr-only";
            this.live.setAttribute("aria-live", "polite");
            root.append(this.live);
            for (const id of DEFAULT_ORDER) {
                const def = CATEGORIES[id], b = document.createElement("button");
                b.type = "button";
                b.className = `home-widget ${def.tone}`;
                b.dataset.category = id;
                b.innerHTML = `${FluffyIcons.svg(def.icon)}<span class="widget-name"></span><strong class="widget-value"></strong><small class="widget-sub"></small><span class="widget-dot" aria-hidden="true"></span>`;
                b.querySelector(".widget-name").textContent = def.name;
                b.setAttribute("aria-label", `${def.name}：点击记录，长按拖动；Alt 加方向键调整位置`);
                this.cards.set(id, b);
                root.append(b);
                this.bind(b, id);
            }
            window.addEventListener("pointermove", e => this.move(e), { passive: false });
            window.addEventListener("pointerup", e => this.end(e, false));
            window.addEventListener("pointercancel", e => this.end(e, true));
            window.addEventListener("blur", () => this.cancel());
            document.addEventListener("visibilitychange", () => {
                if (document.hidden)
                    this.cancel();
            });
            this.layout();
            this.update();
        }
        /**
         * 输入：button、id。
         * 输出：无。
         * 功能：长按只进入拖拽，保留短点和键盘操作，不弹快捷菜单。
         */
        bind(button, id) {
            button.addEventListener("pointerdown", e => {
                if (e.button !== 0 || !e.isPrimary)
                    return;
                e.preventDefault();
                this.cancel();
                const rect = button.getBoundingClientRect(), scale = this.root.getBoundingClientRect().width / 393;
                const p = this.press = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, held: false, dragging: false, target: -1, original: [...this.order], offsetX: (e.clientX - rect.left) / scale, offsetY: (e.clientY - rect.top) / scale };
                button.setPointerCapture?.(e.pointerId);
                button.classList.add("pressing");
                this.actions.attend?.(id);
                p.timer = setTimeout(() => {
                    if (this.press !== p)
                        return;
                    p.held = true;
                    button.classList.add("held");
                    this.root.classList.add("arranging");
                    navigator.vibrate?.(12);
                    this.announce(`${CATEGORIES[id].name}已拿起，拖到想放的位置。`);
                }, 430);
            });
            button.addEventListener("contextmenu", e => e.preventDefault());
            button.addEventListener("lostpointercapture", e => {
                if (this.press?.pointerId === e.pointerId)
                    this.end(e, true);
            });
            button.addEventListener("click", e => {
                e.preventDefault();
                if (e.detail === 0 && performance.now() - (this.endedAt || -1000) > 250)
                    this.actions.open(id);
            });
            button.addEventListener("keydown", e => {
                if (e.key === "Escape")
                    this.cancel();
                if (e.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                    e.preventDefault();
                    const i = this.order.indexOf(id), dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0, dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                    const col = i % 3 + dx, row = Math.floor(i / 3) + dy;
                    if (col >= 0 && col < 3 && row >= 0 && row < 3)
                        this.place(id, row * 3 + col);
                }
            });
        }
        /**
         * 输入：文字。
         * 输出：无。
         * 功能：为辅助技术说明位置变化，不增加常驻说明文字。
         */
        announce(text) { this.live.textContent = __fluffyModules["entry-i18n.js"]?.t(text) || text; }
        /**
         * 输入：PointerEvent。
         * 输出：无。
         * 功能：保持抓取点连续，九宫格内标记落点，移动期间不重排数据。
         */
        move(e) {
            const p = this.press;
            if (!p || p.pointerId !== e.pointerId)
                return;
            const distance = Math.hypot(e.clientX - p.x, e.clientY - p.y);
            if (!p.held) {
                if (distance > 11)
                    this.cancel();
                return;
            }
            if (distance < 5 && !p.dragging)
                return;
            e.preventDefault?.();
            p.dragging = true;
            const r = this.root.getBoundingClientRect(), scale = r.width / 393, x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
            const b = this.cards.get(p.id);
            b.classList.add("dragging");
            b.style.left = `${x - p.offsetX}px`;
            b.style.top = `${y - p.offsetY}px`;
            p.target = slotAt(x, y);
            this.guides.forEach((n, i) => n.classList.toggle("drop-target", i === p.target));
        }
        /**
         * 输入：event、canceled。
         * 输出：无。
         * 功能：松开仅落位一次，无效区域/取消回原位；长按绝不误打开页面。
         */
        end(e, canceled) {
            const p = this.press;
            if (!p || p.pointerId !== e.pointerId)
                return;
            this.press = null;
            this.endedAt = performance.now();
            clearTimeout(p.timer);
            const b = this.cards.get(p.id);
            b.classList.remove("pressing", "held", "dragging");
            this.root.classList.remove("arranging");
            this.guides.forEach(n => n.classList.remove("drop-target"));
            try {
                if (b.hasPointerCapture?.(p.pointerId))
                    b.releasePointerCapture(p.pointerId);
            }
            catch { /* 已自动释放时不需要再次清理。 */ }
            if (!canceled && p.dragging && p.target >= 0)
                this.place(p.id, p.target);
            else
                this.layout();
            if (!canceled && !p.held && !p.dragging)
                this.actions.open(p.id);
            this.actions.release?.();
        }
        /**
         * 输入：类别和槽位。
         * 输出：无。
         * 功能：交换或移到空位并持久化；保存失败明确告知。
         */
        place(id, index) {
            if (index < 0 || index >= RESERVED_SLOT) {
                this.announce("这里留给小猫说话，换个位置吧。");
                this.layout();
                return;
            }
            this.order = exchange(this.order, this.order.indexOf(id), index);
            this.layout();
            const saved = Store.write(KEY, this.order);
            this.announce(saved ? `${CATEGORIES[id].name}已放在第${Math.floor(index / 3) + 1}行第${index % 3 + 1}列。` : "当前浏览器不能保存布局，本次调整仍然有效。");
            if (!saved)
                this.actions.warn?.("布局未能保存到浏览器。");
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：离开页面/失焦/取消时撤销未落下的拖动。
         */
        cancel() {
            if (this.press)
                this.end({ pointerId: this.press.pointerId }, true);
        }
        /**
         * 输入：可选 skip。
         * 输出：无。
         * 功能：六个组件平滑吸附八个位置，空位平时不可见。
         */
        layout(skip = null) {
            this.order.forEach((id, i) => {
                if (!id)
                    return;
                const b = this.cards.get(id);
                b.style.setProperty("--slot", i);
                b.dataset.slot = i;
                if (id !== skip) {
                    b.style.left = SLOTS[i][0] + "px";
                    b.style.top = SLOTS[i][1] + "px";
                }
            });
        }
        /**
         * 输入：id、step。
         * 输出：无。
         * 功能：兼容既有布局操作入口，不丢失空位。
         */
        reorder(id, step) { const i = this.order.indexOf(id), j = Math.max(0, Math.min(7, i + step)); this.place(id, j); }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：恢复六组件初始错落位置，保留全部历史。
         */
        reset() { this.cancel(); this.order = [...DEFAULT_SLOTS]; Store.write(KEY, this.order); this.layout(); }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：摘要完全来自已确认记录，不生成虚构情绪分数。
         */
        update() {
            const L = __fluffyModules["entry-i18n.js"], D = __fluffyModules["display-language.js"], R = __fluffyModules["review-data.js"];
            const records = Store.records().filter(r => Store.dateOf(r) === Store.dayKey());
            for (const [id, b] of this.cards) {
                const list = records.filter(r => r.category === id), r = list[0], display = D?.record(r) || r, info = summary(display);
                const current = list.length ? R?.daily(id, list, R.goals()) : null;
                if (current && ["sport", "focus"].includes(id) && current.value != null)
                    info.value = `${R.format(current.value)} min`;
                if (current && id === "sleep" && current.value != null)
                    info.value = `${R.format(current.value)} h`;
                if (L?.language() === "en") {
                    info.value = D?.text(info.value) || L.t(info.value);
                    info.sub = D?.text(info.sub) || L.t(info.sub);
                }
                b.querySelector(".widget-name").textContent = L ? L.categoryName(id) : CATEGORIES[id].name;
                b.querySelector(".widget-value").textContent = info.value;
                b.querySelector(".widget-sub").textContent = info.sub;
                b.classList.toggle("has-record", Boolean(r));
                b.dataset.destination = r ? "review" : "entry";
                b.setAttribute("aria-label", L?.language() === "en" ? `${L.categoryName(id)}: ${r ? 'view today’s review' : 'add an entry'}. Hold to move; Alt + arrow keys to reposition.` : `${CATEGORIES[id].name}：${r ? '查看今日回顾' : '点击记录'}，长按拖动；Alt 加方向键调整位置`);
            }
        }
    }
    return { HomeBoard, SLOTS, DEFAULT_SLOTS, normalizeSlots, exchange, slotAt, KEY, LEGACY_KEY, RESERVED_SLOT };
})();
