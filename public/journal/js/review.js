/* 只读数据回顾与陪伴对话。可交互UI、音频生命周期、图表动画和猫咪连续状态均在本模块隔离。 */
__fluffyModules["review.js"] = (() => {
    "use strict";
    const Layout = __fluffyModules["review-layout.js"], Feedback = __fluffyModules["cat-feedback.js"], Policy = __fluffyModules["ai-policy.js"];
    const Memory = __fluffyModules["chat-memory.js"], ChatText = __fluffyModules["chat-text.js"];
    const Data = __fluffyModules["review-data.js"], Talk = __fluffyModules["review-conversation.js"], Store = __fluffyModules["journal-store.js"];
    const { HoldGesture } = __fluffyModules["gesture.js"], { SpeechSession } = __fluffyModules["speech.js"];
    /**
     * 输入：元素ID。
     * 输出：DOM节点或null。
     * 功能：限定页面节点查找入口。
     */
    const $ = id => document.getElementById(id);
    const I = {
        more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
        language: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg>',
        info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>'
    };
    /**
     * 输入：tag、类名、可选纯文本。
     * 输出：新节点。
     * 功能：所有用户/模型文字通过textContent，不插入HTML。
     */
    function node(tag, cls = "", text = "") { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
    /**
     * 输入：受控图标名。
     * 输出：SVG字符串。
     * 功能：只取本地白名单图标。
     */
    function icon(name) { return FluffyIcons.svg(name); }
    /**
     * 输入：中文、英文与语言。
     * 输出：本地化文本。
     * 功能：不将用户原话自动改写或翻译。
     */
    function tr(zh, en, lang) { return lang === "en" ? en : zh; }
    class ReviewPage {
        /**
         * 输入：api、bailian、animation和导航/弹窗钩子。
         * 输出：回顾控制器。
         * 功能：仅初始化UI，不请求麦克风或付费API。
         */
        constructor(hooks) {
            this.h = hooks;
            this.active = false;
            this.view = null;
            this.phase = "idle";
            this.serial = 0;
            this.controller = null;
            this.lang = Store.read("fluffy-review-language-v1", "zh") === "en" ? "en" : "zh";
            this.memories = new Map();
            this.turn = null;
            this.intentController = null;
            this.diagnostics = new Memory.Diagnostics();
            // 仅公开脱敏统计方法，诊断对象中没有用户原话、Key 或历史记录。
            window.FluffyChatDiagnostics = Object.freeze({ snapshot: () => this.diagnostics.snapshot(), clear: () => this.diagnostics.clear() });
            this.textDrafts = new Map();
            this.pendingMessage = null;
            this.retryPending = false;
            this.openings = new Set();
            this.queue = [];
            this.wave = Array(72).fill(0);
            this.level = 0;
            this.lastTick = 0;
            this.measureCanvas = document.createElement("canvas");
            this.measure = this.measureCanvas.getContext("2d");
            this.root = node("section", "review-page");
            this.root.id = "review-page";
            this.root.hidden = true;
            this.root.setAttribute("aria-label", "数据回顾");
            Layout.applyLayout(this.root);
            this.root.innerHTML = `<header class="review-header"><button class="review-home" id="review-home" aria-label="返回首页">${icon("home")}</button><h2 id="review-title"></h2><p class="review-date" id="review-date"></p><button class="review-more" id="review-more" aria-label="回顾菜单" aria-expanded="false" aria-controls="review-menu" aria-haspopup="menu">${icon("more")}</button></header>
            <div class="review-menu" id="review-menu" role="menu" hidden></div>
            <button class="review-pet" id="review-pet" aria-label="摸摸小猫"></button>
            <button class="review-bubble" id="review-bubble" aria-label="小猫回复，点击暂停或继续" aria-live="polite" aria-atomic="true"></button>
            <section class="review-summary" id="review-summary" aria-label="当日回顾"></section>
            <section class="review-week" id="review-week" aria-label="近七天数据"></section>
            <p class="review-status" id="review-status" role="status"></p>
            <button class="primary review-chat" id="review-chat" type="button" aria-label="长按和小猫聊两句；空格键长按录音，Escape取消">${icon("mic")}<span id="review-chat-label"></span><canvas class="review-chat-wave" id="review-chat-wave" width="694" height="128" hidden aria-hidden="true"></canvas></button>`;
            $("screen").append(this.root);
            const callbacks = { onLevel: (level, history) => { this.level = level; this.wave = history.slice(); }, onStarted: () => this.started(), onText: text => { this.liveText = text; }, onError: message => this.fail(message), onLimit: () => { this.hold.disarm(); this.release(); } };
            this.raw = { cancel() {} }; // 不再使用百炼原始音频；回顾也走浏览器听写。
            this.speech = new SpeechSession(callbacks);
            this.hold = new HoldGesture($("review-chat"), { short: () => this.short(), long: () => this.begin(), release: () => this.release(), cancel: () => {
                    if (["requesting", "listening"].includes(this.phase))
                        this.cancel(true);
                } }, 420);
            $("review-home").onclick = () => this.h.navigate("home");
            $("review-more").onclick = () => this.toggleMenu();
            $("review-pet").onclick = () => { this.h.animation.petAt = this.h.animation.idle; };
            $("review-bubble").onclick = () => {
                if (this.retryPending && this.pendingMessage && this.pendingMessage.key === this.sessionKey && !["thinking", "listening", "requesting", "authorizing", "settling"].includes(this.phase)) {
                    const pending = this.pendingMessage;
                    this.retryPending = false;
                    this.send(pending.text, null, false, { retryId: pending.turnId });
                    return;
                }
                if (this.queue.length) {
                    this.paused = !this.paused;
                    $("review-bubble").dataset.paused = String(this.paused);
                }
            };
            // 按下立即给反馈并暂停读秒；达到420ms才真正打断旧轮，轻触不误开启麦克风。
            $("review-chat").addEventListener("pointerdown", event => { if (event.button === 0 && event.isPrimary && !$("review-chat").disabled) this.pressFeedback(true); });
            $("review-chat").addEventListener("keydown", event => { if (event.code === "Space" && !event.repeat) this.pressFeedback(true); });
            window.addEventListener("pointerup", () => this.pressFeedback(false));
            window.addEventListener("pointercancel", () => this.pressFeedback(false));
            $("review-chat").addEventListener("keyup", event => { if (event.code === "Space") this.pressFeedback(false); });
            document.addEventListener("pointerdown", e => {
                if (!$("review-menu").contains(e.target) && !$("review-more").contains(e.target))
                    this.closeMenu(false);
            });
            document.addEventListener("keydown", e => this.keyboard(e));
            window.addEventListener("pagehide", () => this.cancel(false));
            document.addEventListener("visibilitychange", () => {
                if (document.hidden && this.phase !== "authorizing" && this.phase !== "speaking")
                    this.cancel(false);
                if (document.hidden) this.pressFeedback(false);
                this.lastTick = 0;
            });
        }
        /**
         * 输入：zh/en。
         * 输出：当前语言文本。
         * 功能：回顾本地化集中处理，原记录表单不改动。
         */
        t(zh, en) { return tr(zh, en, this.lang); }
        /**
         * 输入：已确认记录或类别/日期。
         * 输出：无。
         * 功能：打开只读快照，按类别日期隔离聊天，不重复保存记录。
         */
        open(record, date) {
            this.cancel(false);
            this.active = true;
            this.status("");
            this.pendingIntent = null;
            this.pendingMessage = null;
            this.retryPending = false;
            this.renderIntentButton();
            this.root.hidden = false;
            const id = typeof record === "string" ? record : record.category;
            this.lang = __fluffyModules["entry-i18n.js"]?.language() || this.lang;
            this.view = Data.build(id, date || (typeof record === "object" ? Data.dateOf(record) : Store.dayKey()));
            this.sessionKey = `${id}:${this.view.date}`;
            window.NavaJournal.context={category:id,recordDate:this.view.date};
            if (!this.memories.has(this.sessionKey)) this.memories.set(this.sessionKey, new Memory.ConversationMemory());
            // 会话按日期/板块隔离，最多保留18组；原话不进入localStorage或诊断日志。
            if (this.memories.size > 18) this.memories.delete(this.memories.keys().next().value);
            this.h.Display.warm(this.view.records);
            this.render();
            this.phase = "idle";
            this.setPhase("idle");
            this.enqueue([{ text: Talk.greeting(this.view, this.lang), gesture: "soft" }]);
            const opening = `${this.sessionKey}:${this.lang}:${this.view.records.map(r => r.id + JSON.stringify(r.data)).join("|")}`;
            if (this.h.api.configured && !this.openings.has(opening)) {
                this.openings.add(opening);
                if (this.openings.size > 36)
                    this.openings.delete(this.openings.values().next().value);
                this.send("", null, true);
            }
        }
        /**
         * 输入：无。
         * 输出：当前板块日期的对话数组。
         * 功能：只保留实际成功的交流。
         */
        history() { return this.memory().messages(); }
        /** 输入：无。输出：当前会话账本。功能：切换日期/板块时使用不同上下文，不混入其他记录。 */
        memory() {
            if (!this.memories.has(this.sessionKey)) this.memories.set(this.sessionKey, new Memory.ConversationMemory());
            return this.memories.get(this.sessionKey);
        }
        /** 输入：按压状态。输出：无。功能：轻触即时反馈，长按阈值前暂停气泡计时但不取消回答。 */
        pressFeedback(active) { this.pressActive = active; $("review-chat").dataset.pressing = String(active); }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：离开页面取消收音、API、排队气泡；只读图表不写记录。
         */
        leave() { this.cancel(false); this.active = false; this.root.hidden = true; this.closeMenu(false); }
        /**
         * 输入：phase。
         * 输出：无。
         * 功能：状态与真实录音/请求绑定，动画缓动而不是换图。
         */
        setPhase(phase) {
            this.phase = phase;
            $("review-chat").dataset.phase = phase;
            $("review-chat-wave").hidden = phase !== "listening";
            $("review-chat-label").textContent = phase === "authorizing" ? this.t("等待麦克风", "Allow microphone") : phase === "settling" ? this.t("听好最后一句", "Finishing dictation…") : phase === "thinking" ? this.t("小猫想一想…", "Let me think…") : phase === "requesting" ? this.t("准备听你说", "Getting ready…") : this.t("长按和小猫聊两句", "Hold to talk with me");
            $("review-chat").disabled = phase === "authorizing";
            this.h.animation.reviewMode = phase === "listening" ? "listen" : ["thinking", "settling"].includes(phase) ? "think" : phase === "speaking" ? "talk" : "rest";
            this.h.animation.reviewGesture = this.currentGesture || "soft";
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：短按只提示手势，不取消仍在回复的轮次；长按才打断并开始新输入。
         */
        short() {
            if (!this.active) return;
            // 短按不终止仍在生成/展示的回答，避免本来想长按却误丢整轮。
            if (!this.turn?.generating && !this.queue.length && this.phase === "idle") this.status("hold");
        }
        /**
         * 输入：text。
         * 输出：无。
         * 功能：短暂操作提示不占常驻布局。
         */
        status(text) {
            clearTimeout(this.statusTimer);
            $("review-status").textContent = "";
            $("review-status").classList.remove("visible");
            if (text && this.active) this.notify(text);
        }
        /**
         * 输入：错误或受控提示码。
         * 输出：无。
         * 功能：回顾数据保持原位，错误也由原小猫气泡逐句讲，不显示底部状态条。
         */
        notify(message) {
            if (!this.active) return;
            this.enqueue([{ text: Feedback.say(message, { language: this.lang }), gesture: "soft" }]);
            $("review-bubble").dataset.feedback = "help";
        }
        /**
         * 输入：announce。
         * 输出：无。
         * 功能：所有退出与取消共用幂等清理，迟到音频/回复不能重启。
         */
        cancel(announce = false, preserveHold = false) {
            const current = this.turn;
            this.serial++;
            if (current && ["pending", "playing"].includes(current.record.status)) {
                current.memory.finish(current.record, "interrupted");
                this.diagnostics.add(current.id, "interrupted", { page: current.record.presented.length });
            }
            this.turn = null;
            this.controller?.abort(); this.controller = null;
            this.intentController?.abort(); this.intentController = null;
            this.raw?.cancel(); this.speech?.cancel();
            if (!preserveHold) { this.hold?.disarm(); this.pressFeedback(false); }
            this.queue = []; this.queueIndex = -1; this.paused = false;
            this.level = 0; this.wave = Array(72).fill(0);
            this.pendingIntent = null; this.renderIntentButton();
            if ($("review-chat")) {
                this.setPhase("idle");
                $("review-bubble").classList.remove("fading");
                $("review-bubble").dataset.paused = "false";
            }
            if (announce && this.active) this.status("canceled");
        }
        /**
         * 输入：无。
         * 输出：Promise<void>。
         * 功能：复用首次授权策略，已授权的长按才实际收音。
         */
        async begin() {
            if (!this.active || ["authorizing", "requesting", "listening"].includes(this.phase))
                return;
            const pressed = this.hold.pressed;
            // 清理上一句回复，但保留本次手势；取消计时与模型不触发新短按。
            this.cancel(false, true);
            this.diagnostics.add(this.serial, "begin");
            if (!pressed)
                return;
            if (!this.h.api.configured) {
                this.hold.disarm();
                this.notify("deepseek-key");
                this.h.openSettings();
                return;
            }
            this.input = this.speech;
            this.pendingMessage = null;
            this.retryPending = false;
            if (!this.input.supported()) {
                this.hold.disarm();
                this.setPhase("idle");
                this.notify("speech-unsupported");
                return;
            }
            const serial = this.serial;
            this.setPhase("requesting");
            try {
                const permission = await this.h.microphone.status();
                if (serial !== this.serial || !this.active)
                    return;
                if (permission !== "granted") {
                    this.hold.disarm();
                    this.setPhase("authorizing");
                    if (permission === "denied")
                        throw Error("请在地址栏允许麦克风后重试。");
                    await this.h.microphone.authorize();
                    if (serial !== this.serial || !this.active)
                        return;
                    this.setPhase("idle");
                    this.notify("permission-ready");
                    return;
                }
                if (!this.hold.pressed) {
                    this.cancel(false);
                    return;
                }
                this.level = 0;
                this.wave.fill(0);
                this.liveText = "";
                await this.input.start({ language: this.lang === "en" ? "en-US" : "zh-CN", maximumSeconds: 60 });
            }
            catch (e) {
                if (serial === this.serial && e.name !== "AbortError")
                    this.fail(e.name === "NotAllowedError" ? "speech-permission" : e);
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：真实音频启动回调才显示倾听和波形。
         */
        started() {
            if (this.active && this.phase === "requesting") {
                this.setPhase("listening");
                this.diagnostics.add(this.serial, "listening");
                this.showLines([this.t("你慢慢说呀", "Take your time."), this.t("我在认真听呢", "I'm listening.")]);
            }
        }
        /**
         * 输入：无。
         * 输出：Promise<void>。
         * 功能：松手先停止采集，再提交当前一句；不会修改任何记录字段。
         */
        async release() {
            if (this.phase === "authorizing")
                return;
            if (this.phase === "requesting") {
                this.cancel(false);
                return;
            }
            if (!this.active || this.phase !== "listening")
                return;
            const serial = this.serial;
            this.setPhase("settling");
            this.showLines([this.t("让我想一想", "Let me think."), this.t("再慢慢说给你听", "I'm right here.")]);
            let result;
            try {
                result = await this.input.stop();
                this.level = 0;
                if (serial !== this.serial || !this.active || result.canceled)
                    return;
                if (!result.text?.trim()) throw new Policy.AIError("speech-empty", "没有收到听写原文。");
                this.diagnostics.add(serial, "recognized", { characters: result.text.length });
                await this.send(result.text, null, false);
            }
            catch (e) {
                if (serial === this.serial && e.name !== "AbortError")
                    this.fail(e);
            }
            finally {
                if (result)
                    result.audio = null;
            }
        }
        /**
         * 输入：text、audio、opening。
         * 输出：Promise<void>。
         * 功能：用户原话先入内存；正文流逐句入队，只有已展示的回答才加入后续上下文。
         */
        async send(text, audio = null, opening = false, options = {}) {
            if (!this.active) return;
            // 阶段一：新轮拥有独立取消源。重试复用逻辑消息ID，普通再次发言一定是新轮。
            this.cancel(false);
            const serial = this.serial, key = this.sessionKey, memory = this.memory();
            const record = memory.begin(String(text || ""), opening, options.retryId);
            const controller = new AbortController();
            const current = { id: serial, key, memory, record, controller, generating: true, opening };
            this.turn = current; this.controller = controller;
            if (!opening) {
                this.pendingMessage = { text: String(text || ""), key, turnId: record.id };
                this.textDrafts.set(key, String(text || ""));
                while (this.textDrafts.size > 18) this.textDrafts.delete(this.textDrafts.keys().next().value);
            }
            this.retryPending = false;
            this.queue = []; this.queueIndex = -1; this.queueElapsed = 0;
            this.setPhase("thinking");
            this.showLines([this.t("让我想一想", "Let me think."), this.t("我会接着听你说", "I'm right here.")]);
            const b = $("review-bubble"), style = getComputedStyle(b);
            this.measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const width = b.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
            try {
                // 阶段二：传输增量先分成完整短句，短句到达即可排队；不得等全部生成才开始说。
                await Talk.request({ api: this.h.api, view: this.view, memory: memory.context(record.id), text, audio, lang: this.lang, opening, signal: controller.signal,
                    width, measure: value => this.measure.measureText(value).width + ChatText.count(value) * .27,
                    onPage: page => { if (this.isCurrent(current)) this.appendPage(page, current); },
                    onEvent: (event, meta) => { if (this.isCurrent(current)) this.diagnostics.add(serial, event, meta); }
                });
                if (!this.isCurrent(current)) return;
                current.generating = false;
                if (record.status === "pending") memory.finish(record, "playing");
                this.retryPending = false;
                if (!opening) { this.pendingMessage = null; this.textDrafts.delete(key); }
                this.diagnostics.add(serial, "complete", { page: this.queue.length });
                // 阶段三：记事意图是可选辅助任务，使用独立取消源，失败不能覆盖已经成功的回答。
                if (!opening) this.inferIntent(current, text);
            } catch (error) {
                if (!this.isCurrent(current)) return;
                if (error.name === "AbortError") { this.cancel(false); return; }
                current.generating = false; memory.finish(record, "failed");
                this.diagnostics.add(serial, "failed", { code: error.code, status: error.status || 0, page: record.presented.length });
                const hasPages = this.queue.some(item => item.turn === current) || record.presented.length > 0;
                if (hasPages) {
                    // 已有完整句保留，不整段重放；不完整的网络尾句已经被分句器丢弃。
                    this.pendingMessage = null; this.retryPending = false; this.textDrafts.delete(key);
                    for (const lines of Talk.pages(Feedback.say("chat-partial", {language:this.lang}), t => this.measure.measureText(t).width + ChatText.count(t)*.27, width, this.lang)) this.queue.push({lines,gesture:"soft",turn:null});
                    this.setPhase("speaking");
                } else {
                    this.retryPending = !opening;
                    this.fail(error);
                }
            } finally {
                if (this.controller === controller) this.controller = null;
                audio = null;
            }
        }
        /** 输入：current（请求轮次）。输出：boolean。功能：所有迟到回调统一检查，旧轮不得更新新轮界面。 */
        isCurrent(current) { return this.active && this.turn === current && current.id === this.serial && current.key === this.sessionKey && !current.controller.signal.aborted; }
        /**
         * 输入：page（完整短句页）、current（所属轮次）。
         * 输出：无。
         * 功能：排队不等于已经说过；真正显示时才提交对话上下文。
         */
        appendPage(page, current) {
            if (!this.isCurrent(current)) return;
            this.queue.push({ ...page, turn: current, presented: false });
            if (this.queueIndex < 0) { this.queueIndex = 0; this.queueElapsed = 0; this.displayCurrent(); }
            this.setPhase("speaking");
        }
        /**
         * 输入：current、words。
         * 输出：Promise<void>。
         * 功能：新增/修改意图旁路判断，只提出用户确认入口；不影响回复状态，不写记录。
         */
        async inferIntent(current, words) {
            // 普通的“不是时间不够，是有点累”属于聊天，不因为包含“不是…是”就提出改记录。
            const writeCue = /记错|写错|填错|记下|记录|补记|新增|修改|更正|纠正|改成|改为|保存|再记|又.{0,12}(?:跑|练|吃|睡|专注)|\b(?:log|record|save|edit|correct|new entry|change .{0,24} to)\b/i;
            if (!writeCue.test(words)) return;
            const Intent = __fluffyModules["record-intent.js"], controller = new AbortController();
            this.intentController?.abort(); this.intentController = controller;
            try {
                const proposal = await Intent.infer(words, {category:this.view.id,date:this.view.date}, this.h.api, controller.signal);
                if (!this.isCurrent(current) || controller.signal.aborted) return;
                this.pendingIntent = proposal.operation !== "none" ? { words, proposal } : null;
                this.buildMenu(); this.renderIntentButton();
            } catch (error) {
                if (this.isCurrent(current) && error.name !== "AbortError") this.diagnostics.add(current.id,"intent-failed",{code:error.code});
            } finally { if (this.intentController === controller) this.intentController = null; }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：聊天仅提出操作入口，显式点击之后再确认新增或修正；不自动保存。
         */
        renderIntentButton() {
            let button = $("review-intent");
            if (!button) {
                button = node("button", "review-intent");
                button.id = "review-intent";
                button.type = "button";
                this.root.append(button);
            }
            button.hidden = !this.pendingIntent;
            button.innerHTML = icon("history");
            button.setAttribute("aria-label", this.t("记录想法", "Save this thought"));
            button.title = this.t("记录想法", "Save this thought");
            button.onclick = () => {
                const p = this.pendingIntent;
                if (!p)
                    return;
                this.cancel(false);
                this.h.offerIntent(p.words, this.view.id, this.view.date, p.proposal);
            };
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：按时序列出当日各次记录，情绪与面部保留变化，不能相加成状态分数。
         */
        entriesSheet() {
            const rows = this.view.records.filter(r => Store.dateOf(r) === this.view.date).slice().reverse();
            this.h.Display.warm(rows);
            this.h.showSheet(this.t("当日记录", "Day entries"), body => {
                if (!rows.length) {
                    body.append(node("p", "sheet-text", this.t("这一天还没有记录", "No entry on this day")));
                    return;
                }
                const list = node("div", "entry-picker-list");
                for (const r of rows) {
                    const b = node("button", "entry-picker-item"), info = node("span", "entry-picker-copy"), d = this.h.Display.record(r), sum = this.h.Display.summary(r);
                    b.type = "button";
                    b.innerHTML = icon(this.view.meta.icon);
                    const time = new Date(r.createdAt).toLocaleTimeString(this.lang === 'en' ? 'en-GB' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
                    info.append(node("strong", "", time + " · " + sum.value), node("span", "", sum.sub));
                    b.append(info);
                    b.onclick = () => this.h.editEntries(this.view.id, this.view.date, [r.id]);
                    list.append(b);
                }
                body.append(list);
            }, null, { icon: "list" });
        }
        /**
         * 输入：错误消息。
         * 输出：无。
         * 功能：诚实提示失败，不用预置回复冒充成功。
         */
        fail(message) {
            this.diagnostics.add(this.serial, "failed", {code:message?.code});
            this.cancel(false);
            if (!this.active)
                return;
            const replies = [{ text: Feedback.say(message, { language: this.lang }), gesture: "soft" }];
            if (this.retryPending && this.pendingMessage?.key === this.sessionKey) replies.push({ text: Feedback.say("retry", { language: this.lang }), gesture: "nod" });
            this.enqueue(replies);
            $("review-bubble").dataset.feedback = "help";
        }
        /**
         * 输入：replies。
         * 输出：无。
         * 功能：按实际字体测量分页，句子淡出后显示下一句。
         */
        enqueue(replies) {
            const b = $("review-bubble"), style = getComputedStyle(b);
            this.measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const width = b.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
            this.queue = replies.flatMap(r => Talk.pages(r.text, text => this.measure.measureText(text).width + ChatText.count(text) * .27, width, this.lang).map(lines => ({ lines, gesture: r.gesture, turn: null, presented: false })));
            this.queueIndex = 0;
            this.queueElapsed = 0;
            this.paused = false;
            if (this.queue.length) {
                this.displayCurrent();
                this.setPhase("speaking");
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：展示当前一句，动作参数交给统一动画循环缓动。
         */
        displayCurrent() {
            const item = this.queue[this.queueIndex];
            if (!item || document.hidden || !$("sheet-layer").hidden) return;
            this.currentGesture = item.gesture;
            this.h.animation.reviewGesture = item.gesture;
            this.showLines(item.lines);
            if (!item.presented) {
                item.presented = true;
                if (item.turn && this.isCurrent(item.turn)) {
                    item.turn.memory.present(item.turn.record, item.index, item.text || item.lines.join(""));
                    this.diagnostics.add(item.turn.id, item.turn.record.presented.length === 1 ? "first-page" : "page", { page: item.index, characters: ChatText.count(item.lines.join("")) });
                }
                this.h.animation.reviewPhraseAt = this.h.animation.idle;
            }
            const length = ChatText.count(item.lines.join(""));
            this.queueDuration = Math.max(2500, Math.min(4200, length * (this.lang === "en" ? 52 : 130) + 1350));
        }
        /**
         * 输入：一至两行纯文本。
         * 输出：无。
         * 功能：不把长回复挤成三行，保留圆润气泡。
         */
        showLines(lines) { const b = $("review-bubble"); b.textContent = lines.join("\n"); b.classList.remove("fading"); b.dataset.paused = String(this.paused || false); b.dataset.feedback = ""; }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：回顾页每帧只更新环形数值、真实波形和气泡时间，不重建图表。
         */
        tick() {
            if (!this.active || !this.view)
                return;
            const now = performance.now(), dt = this.lastTick ? Math.min(80, now - this.lastTick) : 0;
            this.lastTick = now;
            const reduce = this.h.animation.reducedMotion;
            const p = reduce ? 1 : Math.min(1, (now - this.chartStart) / 850), eased = 1 - (1 - p) ** 3;
            if (this.view.today.score != null && $("review-score")) {
                $("review-score").textContent = String(Math.round(this.view.today.score * eased));
                $("review-ring-progress").style.strokeDashoffset = String(376.991 * (1 - this.view.today.score / 100 * eased));
            }
            if (this.phase === "listening")
                this.drawWave(now);
            if (this.phase === "speaking" && this.queue.length && !document.hidden && !this.paused && !this.pressActive && $("sheet-layer").hidden) {
                if (!this.queue[this.queueIndex]?.presented) this.displayCurrent();
                this.queueElapsed += dt;
                if (this.queueElapsed >= this.queueDuration) {
                    if (this.queueIndex < this.queue.length - 1) {
                        $("review-bubble").classList.toggle("fading", !reduce);
                        if (this.queueElapsed >= this.queueDuration + (reduce ? 0 : 260)) {
                            this.queueIndex++;
                            this.queueElapsed = 0;
                            this.displayCurrent();
                        }
                    }
                    else if (!this.turn?.generating) {
                        if (this.turn && ["pending", "playing"].includes(this.turn.record.status)) this.turn.memory.finish(this.turn.record, "complete");
                        this.queue = []; this.queueIndex = -1;
                        this.setPhase("idle");
                    }
                }
            }
        }
        /**
         * 输入：当前高精度时间。
         * 输出：无。
         * 功能：最近音量在右侧、历史向左移动，无声时仅细线，不随机造波形。
         */
        drawWave(now) {
            const c = $("review-chat-wave").getContext("2d");
            c.setTransform(2, 0, 0, 2, 0, 0);
            c.clearRect(0, 0, 347, 64);
            c.lineCap = "round";
            c.lineWidth = 2.5;
            for (let i = 0; i < 72; i++) {
                const height = 2 + Math.min(1, Math.max(0, this.wave[i] || 0)) * 43, x = 25 + i * 4.18;
                c.strokeStyle = `rgba(255,255,255,${.22 + .74 * Math.min(1, (i + 3) / 18)})`;
                c.beginPath();
                c.moveTo(x, 32 - height / 2);
                c.lineTo(x, 32 + height / 2);
                c.stroke();
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：渲染一屏数据卡，空白周数据不补造。
         */
        render() {
            const { view } = this, d = this.lang === "en" ? this.h.Display.day(view.today) : view.today;
            this.chartStart = performance.now();
            this.root.style.setProperty("--review-accent", view.meta.color);
            this.root.style.setProperty("--review-pale", view.meta.pale);
            this.root.lang = this.lang === "en" ? "en" : "zh-CN";
            const labels = { "review-page": ["数据回顾", "Data review"], "review-pet": ["摸摸小猫", "Pet the cat"], "review-summary": ["当日回顾", "Day summary"], "review-week": ["近七天数据", "Last seven days"] };
            for (const [id, names] of Object.entries(labels))
                $(id)?.setAttribute("aria-label", this.t(...names));
            $("review-title").textContent = view.meta[this.lang];
            $("review-date").textContent = this.dateText(view.date) + (view.date === Store.dayKey() ? this.t(" · 今天", " · Today") : "");
            $("review-home").setAttribute("aria-label", this.t("返回首页", "Home"));
            $("review-more").setAttribute("aria-label", this.t("回顾菜单", "Review menu"));
            $("review-chat").setAttribute("aria-label", this.t("长按和小猫聊两句；空格键长按，Escape取消", "Hold to talk; hold Space to speak; Escape to cancel"));
            $("review-bubble").setAttribute("aria-label", this.t("小猫回复，点击暂停或继续", "Cat reply; tap to pause or resume"));
            const root = $("review-summary");
            root.replaceChildren();
            root.classList.toggle("mood-summary", view.id === "mood");
            if (view.id === "mood") {
                root.append(node("p", "review-mood-kicker", this.t(view.date === Store.dayKey() ? "今天的心情" : "那天的心情", "Your own words")), node("p", "review-mood-text", d.text || this.t("给心情留一点位置", "A little room for your feelings")), node("p", "review-mood-detail", d.detail || this.t("慢慢说也没关系", "There's no rush to explain")));
            }
            else {
                const orbit = node("div", "review-orbit");
                orbit.innerHTML = `<svg viewBox="0 0 138 138" aria-hidden="true"><circle class="review-ring-track" cx="69" cy="69" r="60"/><circle id="review-ring-progress" class="review-ring-progress" cx="69" cy="69" r="60"/></svg>`;
                const content = node("div", "review-orbit-content"), score = node("strong", "review-score", d.score == null ? "—" : "0");
                score.id = "review-score";
                content.append(score, node("span", "review-score-label", this.scoreLabel()), node("span", "review-score-goal", this.goalLabel()));
                orbit.append(content);
                orbit.setAttribute("aria-label", `${this.scoreLabel()} ${d.score ?? (d.count ? this.t("暂无分数", "No score available") : this.t("无记录", "No entry"))}`);
                const fact = node("div", "review-facts"), badge = node("span", "review-fact-icon");
                badge.innerHTML = icon(view.meta.icon);
                fact.append(badge, node("p", "review-fact-label", this.factLabel()), node("strong", "review-fact-value", this.valueText(d)), node("span", "review-fact-detail", view.id === "sleep" ? d.detail : d.text || this.t("尚未记录", "No entry yet")));
                root.append(orbit, fact);
            }
            this.renderWeek();
            this.buildMenu();
            this.setPhase(this.phase);
        }
        /**
         * 输入：日期。
         * 输出：本地化短日期。
         * 功能：按记录日显示，不把历史说成今天。
         */
        dateText(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString(this.lang === "en" ? "en-US" : "zh-CN", { month: "short", day: "numeric" }); }
        /**
         * 输入：无。
         * 输出：指标名。
         * 功能：明确个人完成度/记录完整度，不给情绪和面部健康打分。
         */
        scoreLabel() { return this.t(({ sport: "个人目标完成分", sleep: "时长目标匹配分", focus: "专注计划完成分", food: "饮食记录完整分", face: "外观记录完整分" })[this.view.id] || "心情足迹", ({ sport: "Goal progress", sleep: "Sleep goal match", focus: "Focus progress", food: "Record coverage", face: "Record coverage" })[this.view.id] || "Mood moments"); }
        /**
         * 输入：无。
         * 输出：小字目标或记录数。
         * 功能：目标值可见，不把默认值当作用户已设定。
         */
        goalLabel() { return this.view.id === "sport" ? `${Data.format(this.view.today.value)} / ${this.view.goals.sport} min` : this.view.id === "sleep" ? this.t(`目标 ${this.view.goals.sleep} 小时`, `Goal ${this.view.goals.sleep} h`) : this.t(`${this.view.today.count} 次记录`, `${this.view.today.count} entries`); }
        /**
         * 输入：无。
         * 输出：事实标题。
         * 功能：压缩图标、标题、数值间距。
         */
        factLabel() { return this.t(({ sport: this.view.date === Store.dayKey() ? "今日运动" : "当日运动", sleep: "睡眠时长", focus: "实际专注", food: "已记录热量", face: "留下的观察" })[this.view.id] || "今天", ({ sport: "Movement", sleep: "Sleep duration", focus: "Actual focus", food: "Logged energy", face: "Observations" })[this.view.id] || "Today"); }
        /**
         * 输入：日汇总。
         * 输出：短数值与单位。
         * 功能：未知值留横线、部分饮食热量不称全天总摄入。
         */
        valueText(d) { const value = Data.format(d.value); return `${value}${d.value == null ? "" : " " + (d.unit === "entries" ? this.t("次", "entries") : d.unit === "h" ? this.t("小时", "h") : d.unit === "min" ? this.t("分钟", "min") : d.unit)}`; }
        /**
         * 输入：无，读取当前回顾的七日快照与共用布局参数。
         * 输出：无，重建可点击的七天图表。
         * 功能：把0—100分映射到增高后的真实绘图区，仍逐柱升起；情绪只展示文字足迹。
         */
        renderWeek() {
            // 阶段一：标题、绘图区和底部摘要各留固定空间，不挤压日期或分数标签。
            const root = $("review-week");
            root.replaceChildren();
            const mood = this.view.id === "mood";
            const header = node("div", "review-week-heading");
            header.append(node("h3", "", mood ? this.t("这一周的心情", "This week's feelings") : this.t("近 7 天", "Last 7 days")), node("span", "review-week-unit", mood ? "" : this.t("分 · 0—100", "Score · 0–100")));
            root.append(header);
            const chart = node("div", mood ? "review-mood-week" : "review-bars");
            // 阶段二：逐日保留真实分数与空白状态，柱高只依赖共用的绘图高度。
            this.view.week.forEach((rawDay, i) => {
                const day = this.lang === "en" ? this.h.Display.day(rawDay) : rawDay;
                const button = node("button", mood ? "review-mood-day" + (!day.count ? " empty" : "") : "review-bar" + (i === 6 ? " today" : "") + (day.score == null ? " missing" : ""));
                button.type = "button";
                button.style.setProperty("--i", i);
                button.dataset.day = day.date;
                button.setAttribute("aria-pressed", String(i === 6));
                button.setAttribute("aria-label", `${day.date} ${mood ? day.text || this.t("无记录", "No entry") : day.score == null ? (day.count ? this.valueText(day) + this.t("，暂无分数", ", no score available") : this.t("无记录", "No entry")) : day.score + this.t("分", " points")}`);
                if (mood) {
                    const orb = node("span", "review-mood-orb");
                    orb.innerHTML = icon(day.count ? "heart" : "ring");
                    button.append(orb, node("span", "", day.date.slice(8)), node("span", "review-mood-word", day.text || "—"));
                    chart.append(button);
                }
                else {
                    const height = Layout.barHeight(day.score);
                    button.style.setProperty("--bar-height", `${height}px`);
                    if (day.score != null) {
                        const paint = node("span", "review-bar-paint");
                        paint.style.height = height + "px";
                        button.append(paint);
                    }
                    button.append(node("span", "review-bar-number", day.score == null ? "—" : String(day.score)), node("span", "review-bar-day", day.date.slice(8)));
                    const slot = node("div", "review-bar-slot");
                    slot.append(button);
                    chart.append(slot);
                }
                button.onclick = () => { chart.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === button))); $("review-week-detail").textContent = this.dayDetail(day); };
            });
            // 阶段三：点击只更换当天摘要，不改数据，也不重启麦克风或AI请求。
            const detail = node("p", "review-week-detail", this.dayDetail(this.view.today));
            detail.id = "review-week-detail";
            detail.setAttribute("aria-live", "polite");
            root.append(chart, detail);
        }
        /**
         * 输入：一天。
         * 输出：图表点击后的实际文字。
         * 功能：点击只是查看，不篡改得分或触发AI。
         */
        dayDetail(day) {
            if (this.lang === "en")
                day = this.h.Display.day(day);
            if (!day.count)
                return this.t("这一天还没有记录", "No entry on this day");
            if (this.view.id === "mood")
                return day.text;
            if (this.view.id === "food") {
                const m = day.macros;
                return this.t(`蛋白质 ${Data.format(m.protein)} g · 碳水 ${Data.format(m.carbs)} g · 脂肪 ${Data.format(m.fat)} g`, `P ${Data.format(m.protein)} g · C ${Data.format(m.carbs)} g · F ${Data.format(m.fat)} g`);
            }
            return this.valueText(day) + (day.text ? " · " + day.text : "");
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：菜单均为图标加四字短语，内容只属于回顾页。
         */
        buildMenu() {
            const menu = $("review-menu");
            menu.replaceChildren();
            const entries = [["plus", "新增记录", "New entry", () => this.h.newEntry(this.view.id, this.view.date)], ["edit", "修改记录", "Edit entry", () => this.h.editEntries(this.view.id, this.view.date)], ["list", "当日记录", "Day entries", () => this.entriesSheet()], ["language", "语言切换", "Language", () => this.languageSheet()], ["export", "分享卡片", "Share card", () => this.shareSheet()], ["info", "评分依据", "Score details", () => this.basisSheet()]];
            if (["sport", "sleep"].includes(this.view.id))
                entries.push(["ring", "调整目标", "Your goal", () => this.goalSheet()]);
            entries.push(["chat", "对话记录", "Conversation", () => this.historySheet()], ["edit", "文字聊聊", "Text chat", () => this.textSheet()]);
            if (this.pendingIntent)
                entries.unshift(["history", "记录想法", "Save this thought", () => { const p = this.pendingIntent; this.h.offerIntent(p.words, this.view.id, this.view.date, p.proposal); }]);
            for (const [name, zh, en, action] of entries) {
                const b = node("button");
                b.type = "button";
                b.setAttribute("role", "menuitem");
                b.innerHTML = icon(name);
                b.append(node("span", "", this.t(zh, en)));
                b.onclick = () => {
                    this.closeMenu(false);
                    if (["requesting", "listening", "settling", "thinking"].includes(this.phase))
                        this.cancel(false);
                    action();
                };
                menu.append(b);
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：菜单可覆盖气泡，不移动猫或数据卡。
         */
        toggleMenu() {
            const open = $("review-menu").hidden;
            $("review-menu").hidden = !open;
            $("review-more").setAttribute("aria-expanded", String(open));
            if (open)
                $("review-menu").querySelector("button")?.focus({ preventScroll: true });
        }
        /**
         * 输入：restoreFocus。
         * 输出：无。
         * 功能：点击外部与Escape关闭菜单。
         */
        closeMenu(restoreFocus = false) {
            if (!$("review-menu"))
                return;
            const wasOpen = !$("review-menu").hidden;
            $("review-menu").hidden = true;
            $("review-more").setAttribute("aria-expanded", "false");
            if (restoreFocus && wasOpen)
                $("review-more").focus({ preventScroll: true });
        }
        /**
         * 输入：键盘事件。
         * 输出：无。
         * 功能：菜单方向键导航、取消及离屏资源清理。
         */
        keyboard(e) {
            if (!this.active)
                return;
            if (e.key === "Escape") {
                this.closeMenu(true);
                if (["requesting", "listening", "settling", "thinking"].includes(this.phase))
                    this.cancel(true);
            }
            if (!$("review-menu").hidden && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                const items = [...$("review-menu").querySelectorAll("button")], i = items.indexOf(document.activeElement);
                e.preventDefault();
                items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
            }
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：仅切换回顾UI与后续回复语言，保留用户原话和所有记录表单。
         */
        languageSheet() {
            this.h.showSheet(this.t("语言切换", "Review language"), root => {
                const row = node("div", "review-language");
                for (const [id, name] of [["zh", "中文"], ["en", "English"]]) {
                    const b = node("button", id === this.lang ? "selected" : "", name);
                    b.onclick = () => { this.cancel(false); this.lang = id; Store.write("fluffy-review-language-v1", id); this.h.onLanguage?.(id); this.h.closeSheet(); this.render(); this.enqueue([{ text: Talk.greeting(this.view, this.lang), gesture: "soft" }]); };
                    row.append(b);
                }
                root.append(row);
            });
        }
        /**
         * 输入：无。
         * 输出：规则正文。
         * 功能：说明来源与公式放菜单，不常驻显示说明面板。
         */
        basisText() {
            const g = this.view.goals;
            const zh = { sport: `个人目标完成分 = 当日已记录运动分钟 ÷ 目标分钟 × 100，上限 100。当前目标 ${g.sport} 分钟，可在“调整目标”修改。初始默认目标为30分钟。没有记录的日子留空，不按零分处理。`,
                sleep: `时长目标匹配分 = max(0, 1 − |睡眠小时 − 目标小时| ÷ 目标小时) × 100。当前目标 ${g.sleep} 小时，初始默认8小时，可自行修改。同日多段睡眠按时间区间合并，重叠部分仅计一次。记录的时间段不等于监测得到的实际睡眠质量，不据此诊断。`,
                focus: "专注计划完成分 = 实际专注分钟 ÷ 对应计划分钟 × 100，上限100。暂停和休息不计入实际时间。同一天多次计时合并计算；提前停止保留真实用时，不代表任务已完成。手动补记的时长会标记为自述，不冒充计时器测量；没有原计划时不补造计划完成分。没有实际时长时不计算分数。",
                food: "饮食记录完整分按餐次、食物、份量、热量、蛋白质、碳水和脂肪7项的已填写比例计算；同日多餐取平均覆盖率。营养数值只累计已记录项，未记录项不填零。它衡量记录完整程度，不衡量饮食好坏、健康或热量是否达标。",
                face: "外观记录完整分按自己的感受、眼周观察、皮肤外观3项的已填写比例计算；同日多次记录取平均。它不是疲劳程度、皮肤健康或外貌分数。照片分析不会根据长相判断情绪或做诊断。",
                mood: "情绪不打高低分，也不把低落排在开心下面。心情足迹只展示你已经确认的文字；同日多次记录显示最近一条，其余保留在手记中。AI聊天不是评分依据，也不会改变你的原始描述。" };
            const en = { sport: `Goal progress = logged movement minutes / personal goal × 100, capped at 100. Current goal: ${g.sport} min (initial default: 30). Change it in Your goal. Days without entries stay empty.`, sleep: `Sleep goal match = max(0, 1 − |logged hours − goal| / goal) × 100. Current goal: ${g.sleep} h (initial default: 8). Sleep intervals are combined per day; overlapping minutes are counted once. Logged duration is not a measurement of sleep quality or a diagnosis.`, focus: "Actual focused minutes / planned minutes × 100, capped at 100. Pauses and breaks do not count. Multiple sessions are combined. Stopping early records actual time, not task completion. Past sessions entered by the user count as self-reported minutes, not measured time; without an original plan they have no plan-progress score. No actual duration means no score.", food: "Record coverage: the fraction of 7 fields completed (meal, foods, portion, calories, protein, carbs, fat), averaged across entries. Energy and nutrients include logged values only. This is not a measure of diet quality or a calorie target.", face: "Record coverage: the fraction of 3 fields completed (your feeling, eye-area observation, skin appearance), averaged across entries. It is not a fatigue, health or beauty score. Photos do not establish emotions or diagnoses.", mood: "Feelings are not ranked or scored. Each day shows your latest confirmed description. Other entries remain in your journal. AI conversation cannot alter your own words." };
            return this.t(zh[this.view.id], en[this.view.id]);
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：在菜单弹层中展示实际公式和数据来源。
         */
        basisSheet() { this.h.showSheet(this.t("评分依据", "Score details"), root => { root.append(node("p", "review-dialog-copy", this.basisText()), node("p", "review-dialog-copy", this.t("图表与分数来自本浏览器保存的确认记录；小猫只在此基础上陪你交流。没有记录的日子不补造数据。", "Charts use confirmed entries saved in this browser. Missing days are never invented. The cat talks with you using this context."))); }); }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：用户修改个人目标后立即重算，不改写记录。
         */
        goalSheet() {
            this.h.showSheet(this.t("调整目标", "Your goal"), root => {
                const label = node("label", "field", this.view.id === "sleep" ? this.t("睡眠时长目标（小时）", "Sleep duration goal (h)") : this.t("每日运动目标（分钟）", "Movement goal (min)"));
                const input = node("input");
                input.type = "text";
                input.inputMode = "decimal";
                input.value = this.view.goals[this.view.id];
                label.append(input);
                root.append(label);
                const save = node("button", "sheet-action", this.t("保存目标", "Save goal"));
                save.onclick = () => {
                    const value = Number(input.value), limit = this.view.id === "sleep" ? 16 : 1440;
                    if (!Number.isFinite(value) || value < 1 || value > limit) {
                        input.setAttribute("aria-invalid", "true");
                        this.h.toast(this.t(`请输入1到${limit}的数字`, `Enter a number from 1 to ${limit}`));
                        return;
                    }
                    const target = { ...this.view.goals, [this.view.id]: value };
                    if (!Data.saveGoals(target)) {
                        this.h.toast(this.t("目标未能保存，请重试", "Couldn't save your goal"));
                        return;
                    }
                    this.view = Data.build(this.view.id, this.view.date, Store.records(), target);
                    this.h.closeSheet();
                    this.render();
                };
                root.append(save);
            });
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：随时阅读已消逝的短句；会话只在页面内存中。
         */
        historySheet() {
            this.h.Display.warm(this.history().map(t => t.content));
            this.h.showSheet(this.t("对话记录", "Conversation"), root => {
                const wrap = node("div", "review-chat-log");
                if (!this.history().length)
                    wrap.append(node("p", "review-dialog-copy", this.t("聊过的话，会留在这里。", "Your conversation will appear here.")));
                for (const turn of this.history())
                    wrap.append(node("p", "review-log-turn " + turn.role, this.h.Display.text(turn.content)));
                root.append(wrap);
            });
        }
        /**
         * 输入：无，使用当前回顾页的只读上下文和语言。
         * 输出：无，打开带独立输入区与发送按钮的文字聊天弹层。
         * 功能：消息通过原有陪伴对话链路发送；支持多行、输入法与焦点回收，不修改记录。
         */
        textSheet() {
            this.h.showSheet(this.t("文字聊聊", "Text chat"), root => {
                // 阶段一：标题使用聊天图标，输入区与按钮由独立间距分开，不影响其他弹层。
                const form = node("form", "review-text-compose");
                const label = node("label", "review-text-field");
                const input = node("textarea", "review-text-input");
                input.id = "review-text-input";
                input.name = "message";
                input.maxLength = 800;
                input.rows = 4;
                input.value = this.textDrafts.get(this.sessionKey) || "";
                input.setAttribute("aria-label", this.t("想和小猫说什么", "What would you like to say?"));
                label.htmlFor = input.id;
                label.append(node("span", "", this.t("想和小猫说什么", "What would you like to say?")), input);
                const send = node("button", "sheet-action review-text-submit");
                send.type = "submit";
                send.innerHTML = icon("send");
                send.append(node("span", "", this.t("说给小猫", "Send to the cat")));
                form.append(label, send);
                root.append(form);
                // 阶段二：空白不发送；按钮、Ctrl/Cmd+Enter 共享提交入口，每次打开最多发送一次。
                let sent = false;
                form.addEventListener("submit", event => {
                    event.preventDefault();
                    if (sent || !form.isConnected || $("sheet-layer").hidden || !this.active)
                        return;
                    const text = input.value.trim();
                    if (!text) {
                        input.setAttribute("aria-invalid", "true");
                        input.focus();
                        return;
                    }
                    sent = true;
                    send.disabled = true;
                    this.h.closeSheet();
                    this.send(text);
                });
                input.addEventListener("input", () => {
                    input.removeAttribute("aria-invalid");
                    this.textDrafts.set(this.sessionKey, input.value);
                    while (this.textDrafts.size > 18) this.textDrafts.delete(this.textDrafts.keys().next().value);
                });
                input.addEventListener("keydown", event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
                        event.preventDefault();
                        form.requestSubmit();
                    }
                });
                // 阶段三：只聚焦仍打开的当前面板，关闭后的晚到定时器不抢焦点。
                setTimeout(() => {
                    if (input.isConnected && !$("sheet-layer").hidden)
                        input.focus({ preventScroll: true });
                }, 0);
            }, null, { icon: "chat", variant: "review-text" });
        }
        /**
         * 输入：无。
         * 输出：Promise<Blob>。
         * 功能：本地绘制分享卡片，只包含可见回顾数据，不含Key、录音或对话历史。
         */
        async makeShare() {
            await this.h.Display.warm(this.view.records);
            const canvas = document.createElement("canvas");
            canvas.width = 720;
            canvas.height = 1000;
            const c = canvas.getContext("2d"), v = this.view;
            c.fillStyle = "#fcfaf4";
            c.fillRect(0, 0, 720, 1000);
            c.fillStyle = "#193f6c";
            c.textAlign = "center";
            c.font = '600 33px system-ui, sans-serif';
            c.fillText(v.meta[this.lang], 360, 83);
            c.font = '21px system-ui, sans-serif';
            c.fillStyle = "#7f98ad";
            c.fillText(this.dateText(v.date), 360, 124);
            // 阶段一：从同一角色画布取猫所在区域；不截手机边框、设置、菜单、聊天气泡。
            if (this.h.animation.canvas)
                c.drawImage(this.h.animation.canvas, 20 * 2, 155 * 2, 230 * 2, 159 * 2, 186, 145, 348, 241);
            c.fillStyle = "#ffffff";
            c.beginPath();
            c.roundRect(44, 386, 632, 180, 33);
            c.fill();
            c.fillStyle = v.meta.color;
            if (v.id === "mood") {
                this.shareText(c, this.h.Display.text(v.today.text) || this.t("给心情留一点空间", "Room for your feelings"), 360, 456, 510, 28);
            }
            else {
                c.font = '700 57px system-ui, sans-serif';
                c.textAlign = "left";
                c.fillText(v.today.score == null ? "—" : String(v.today.score), 91, 472);
                c.fillStyle = "#68869f";
                c.font = '20px system-ui, sans-serif';
                c.fillText(this.scoreLabel(), 91, 516);
                c.textAlign = "right";
                c.fillStyle = "#214c73";
                c.font = '600 31px system-ui, sans-serif';
                c.fillText(this.valueText(v.today), 628, 465);
                c.font = '19px system-ui, sans-serif';
                c.fillText(this.factLabel(), 628, 508);
            }
            c.fillStyle = "#fff";
            c.beginPath();
            c.roundRect(44, 586, 632, 310, 33);
            c.fill();
            c.textAlign = "left";
            c.fillStyle = "#52768e";
            c.font = '600 22px system-ui, sans-serif';
            c.fillText(this.t("近7天", "Last 7 days"), 76, 632);
            // 阶段二：七天真实值；空白用横线，情绪只显示文字，不造顺序分。
            v.week.forEach((d, i) => {
                const x = 103 + i * 85;
                c.textAlign = "center";
                c.fillStyle = v.meta.color;
                c.font = '21px system-ui, sans-serif';
                if (v.id !== "mood" && d.score != null) {
                    const h = d.score * 1.25;
                    c.beginPath();
                    c.roundRect(x - 20, 827 - h, 40, Math.max(3, h), [11, 11, 1, 1]);
                    c.fill();
                    c.fillStyle = "#345d7d";
                    c.fillText(String(d.score), x, 814 - h);
                }
                else
                    c.fillText(v.id === "mood" && d.count ? "♡" : "—", x, 784);
                c.fillStyle = "#7c96aa";
                c.font = '18px system-ui, sans-serif';
                c.fillText(d.date.slice(8), x, 861);
            });
            c.textAlign = "center";
            c.font = '19px system-ui, sans-serif';
            c.fillStyle = "#8ba6b6";
            c.fillText("A little progress, together. ♡", 360, 953);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
            if (!blob)
                throw Error(this.t("分享卡片没有生成，请重试", "Couldn't create the card"));
            return blob;
        }
        /**
         * 输入：画布、文本与排版参数。
         * 输出：无。
         * 功能：分享卡片长情绪换行而不暴露聊天内容。
         */
        shareText(c, text, x, y, width, size) { c.font = `500 ${size}px system-ui,sans-serif`; c.textAlign = "center"; const lines = Talk.pages(text, t => c.measureText(t).width, width)[0] || [""]; lines.forEach((line, i) => c.fillText(line, x, y + i * (size + 12))); }
        /**
         * 输入：无。
         * 输出：Promise<void>。
         * 功能：先本地预览，用户再次点击才下载或调用系统分享，不自动发布。
         */
        async shareSheet() {
            const serial = this.serial;
            let closed = false, url = null;
            // 阶段一：立即打开轻量准备状态；再次点击分享不会排队生成多个文件。
            const root = this.h.showSheet(this.t("分享卡片", "Share card"), body => {
                body.append(node("p", "review-dialog-copy", this.t("正在准备卡片…", "Preparing your card…")));
            }, () => {
                closed = true;
                if (url)
                    URL.revokeObjectURL(url);
            });
            let blob;
            try {
                blob = await this.makeShare();
            }
            catch (e) {
                if (!closed) {
                    root.replaceChildren(node("p", "review-dialog-copy", e.message));
                }
                return;
            }
            // 阶段二：关闭面板、跳转页面或取消后的晚到编码结果直接丢弃。
            if (closed || !this.active || serial !== this.serial)
                return;
            url = URL.createObjectURL(blob);
            const filename = `Fluffy-Cat-${this.view.id}-${this.view.date}.png`;
            const img = node("img", "review-share-preview");
            img.src = url;
            img.alt = this.t("分享前预览", "Card preview");
            root.replaceChildren(img);
            const row = node("div", "sheet-buttons"), save = node("button", "solid", this.t("保存图片", "Save image"));
            save.onclick = () => { const a = node("a"); a.href = url; a.download = filename; a.click(); };
            row.append(save);
            // 阶段三：只有用户再点按钮才导出或唤起系统分享，不自动上传或发布。
            const file = new File([blob], filename, { type: "image/png" });
            if (navigator.canShare?.({ files: [file] })) {
                const share = node("button", "", this.t("系统分享", "Share"));
                share.onclick = async () => {
                    try {
                        await navigator.share({ files: [file], title: "Fluffy Cat" });
                    }
                    catch (e) {
                        if (e.name !== "AbortError")
                            this.h.toast(this.t("分享未完成，可以保存图片", "Save the image instead"));
                    }
                };
                row.append(share);
            }
            root.append(row);
        }
    }
    return { ReviewPage };
})();
