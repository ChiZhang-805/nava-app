/* Fluffy Cat · 六入口首页与完整记录流程。所有密钥仅在客户端实例的私有内存中。 */
__fluffyModules["app.js"] = (() => {
    "use strict";
    const { CompanionAnimation } = __fluffyModules["animation.js"];
    const { DeepSeekClient } = __fluffyModules["deepseek.js"];
    const { BailianClient } = __fluffyModules["bailian.js"];
    const { BailianSettings } = __fluffyModules["bailian-settings.js"];
    const Feedback = __fluffyModules["cat-feedback.js"], Policy = __fluffyModules["ai-policy.js"], PhotoDraft = __fluffyModules["photo-draft.js"];
    const Sleep = __fluffyModules["sleep-time.js"];
    const Locale = __fluffyModules["entry-i18n.js"];
    const Intent = __fluffyModules["record-intent.js"], Display = __fluffyModules["display-language.js"];
    const EntryAction = __fluffyModules["entry-action.js"];
    const { EntryMenu } = __fluffyModules["entry-menu.js"];
    const { TimeRangePicker } = __fluffyModules["time-range-picker.js"];
    const { FormLayout } = __fluffyModules["form-layout.js"];
    const BubbleCopy = __fluffyModules["bubble-copy.js"];
    const { SpeechSession } = __fluffyModules["speech.js"];
    const { MicrophonePermission } = __fluffyModules["microphone-permission.js"];
    const { HoldGesture } = __fluffyModules["gesture.js"];
    const { PhotoInput } = __fluffyModules["photo-input.js"];
    const { HomeBoard } = __fluffyModules["home-board.js"];
    const { FocusTimer, formatTimer } = __fluffyModules["focus-timer.js"];
    const Catalog = __fluffyModules["catalog.js"], Store = __fluffyModules["journal-store.js"], AI = __fluffyModules["ai-journal.js"];
    const CONFIG = window.FLuffyConfig || {}, icon = FluffyIcons.svg;
    const Guidance = __fluffyModules["journal-guidance.js"], Trace = __fluffyModules["workflow-trace.js"], Companion = __fluffyModules["companion-policy.js"];
    const continueGate = new (__fluffyModules["continue-gate.js"].ContinueGate)();
    /**
     * 输入：id。
     * 输出：DOM 元素。
     * 功能：定位固定界面节点。
     */
    const $ = id => document.getElementById(id);
    /**
     * 输入：tag、className、text。
     * 输出：新 DOM 元素。
     * 功能：用户文字只经 textContent 渲染，避免 HTML 注入。
     */
    function el(tag, className = "", text = "") {
        const n = document.createElement(tag);
        n.className = className;
        if (text !== "")
            n.textContent = Locale.t(text);
        return n;
    }
    /**
     * 输入：节点、图标名。
     * 输出：无。
     * 功能：替换受控本地图标，不读取网络。
     */
    function setIcon(node, name) {
        node.innerHTML = icon(name);
    }
    const api = new DeepSeekClient({ config: CONFIG, model: CONFIG.model });
    const bailian = new BailianClient({ config: CONFIG });
    const state = {
        entryComplete: false, entryCanSubmit: false,
        recordDate: Sleep.dateKey(), draftDates: {}, editingId: null, sleepDates: {}, emotionDraft: null, voiceBackend: "text",
        entryTurns:[], lastQuestion:null, workflowTrace:null, stage:"idle", pendingUtterance: null, speechRetry: false, photoJob: null, photoOwned: {}, photoRead: 0,
        category: "sport", phase: "idle", serial: 0, task: null, record: null, source: "manual", estimated: false, versions: {}, drafts: {}, keySerial: 0, keyTask: null, filter: "all", sheetClose: null, focusRecord: null, timerNotified: false, taskId: null
    };
    const animation = new CompanionAnimation({ onReady, onRender: renderExtras, synchronize: synchronizeUI });
    const microphone = new MicrophonePermission(), photo = new PhotoInput(), timer = new FocusTimer();
    const speech = new SpeechSession({
        onLevel: audioLevel, onText: receivedSpeech, onStarted: listeningStarted, onError: voiceFailed, onLimit: () => { gesture?.disarm(); releaseSpeech(); }
    });
    // 原始音频不再交给百炼。保留兼容变量供旧调试入口读取，不采集或上传第二份录音。
    const rawAudio = {
        /** 输入：无。输出：无。功能：兼容旧调试入口；不采集原始音频。 */
        cancel() {}
    };
    let activeSpeech = speech, bailianSettings;
    let timeRange = null, formLayout = null, review = null, entryMenu = null;
    let lastEntryAction = "";
    let gesture, board, toastTimer, homeBubbleTimer, cameraVideo = null, sheetReturn = null, wave = Array(72).fill(0), lastTimerText = "", lastUI = "", lastFocusSave = 0;
    /**
     * 输入：文字、error。
     * 输出：无。
     * 功能：在猫咪右上角给出简短状态，不常驻冗余说明。
     */
    function bubble(text, error = false, context = {}) {
        state.bubbleText = text;
        state.bubbleError = error;
        state.bubbleContext = context;
        if (context.question) state.lastQuestion = {...context.question, version:state.versions[context.question.field], at:performance.now()};
        else if (context.field && Catalog.category(state.category).fields.some(f => f.key === context.field))
            state.lastQuestion = {field:context.field, question:Feedback.say(text, context), version:state.versions[context.field], at:performance.now()};
        BubbleCopy.render($("entry-bubble"), text, error, context);
        $("entry-bubble").dataset.language = Locale.language();
        updateSpeechRetry();
    }
    /**
     * 输入：text（操作或错误）、context（可选校验信息）。
     * 输出：无。
     * 功能：所有旧toast调用统一转到当前小猫气泡，不在底部主按钮上方显示提示条。
     */
    function toast(text, context = {}) {
        clearTimeout(toastTimer);
        $("phone-toast").hidden = true;
        $("phone-toast").textContent = "";
        if (review?.active) { review.notify(text); return; }
        if (animation.scene === "home") { homeBubble(text, true); return; }
        if (animation.scene === "entry") { bubble(text, true, context); return; }
        // 无表单时也使用短对白，不显示接口正文或含用户数据的调试信息。
        let n = $("page-cat-notice");
        if (!n) { n = el("div", "page-cat-notice"); n.id = "page-cat-notice"; n.setAttribute("role", "status"); $("screen").append(n); }
        n.hidden = false;
        BubbleCopy.render(n, text, true, context);
        toastTimer = setTimeout(() => { n.hidden = true; }, 5000);
    }
    /**
     * 输入：text、error。
     * 输出：无。
     * 功能：首页提示仍使用原气泡；失败不伪装成已填好，也不创建底部提示条。
     */
    function homeBubble(text, error = false) {
        clearTimeout(homeBubbleTimer);
        BubbleCopy.render($("home-bubble"), text, error);
        $("home-bubble").classList.add("visible");
        if (!error) homeBubbleTimer = setTimeout(() => BubbleCopy.render($("home-bubble"), "home"), 4200);
    }
    /**
     * 输入：无，读取当前待重试原话与场景。
     * 输出：无。
     * 功能：用户显式点击小猫气泡才重试；不会再次录音、自动存记录或跨页面回填。
     */
    function updateSpeechRetry() {
        const n = $("entry-bubble"), p = state.pendingUtterance;
        const photoReady = Boolean(state.bubbleContext?.photoRetry && currentPhotoJob()
            && ["failed", "waiting-key", "canceled", "needs-info"].includes(state.photoJob.status));
        const ready = state.phase === "idle" && (photoReady || Boolean(state.speechRetry && p && p.category === state.category && p.date === state.recordDate && p.editingId === state.editingId));
        n.dataset.retry = String(ready);
        n.setAttribute("role", ready ? "button" : "status");
        n.tabIndex = ready ? 0 : -1;
        if (ready) n.setAttribute("aria-label", photoReady
            ? Locale.t("点击小猫，重新分析这张照片", "Tap the cat to retry this photo")
            : Locale.t("点击小猫，重试刚才的话", "Tap the cat to retry your last words"));
        else n.removeAttribute("aria-label");
    }
    /**
     * 输入：title、builder、onClose、options（可选标题图标和面板类型）。
     * 输出：面板内容节点。
     * 功能：打开手机内操作面板，管理焦点和关闭回调。
     */
    function showSheet(title, builder, onClose = null, options = {}) {
        timeRange?.close(false);
        entryMenu?.close(false);
        closeSheet(false);
        board?.cancel();
        gesture?.disarm();
        sheetReturn = document.activeElement;
        state.sheetClose = onClose;
        // 标题图标与面板类型仅作用于本次弹层；下一次打开时完整重置。
        const heading = $("sheet-title");
        heading.replaceChildren();
        $("sheet").dataset.variant = options.variant || "";
        if (options.icon) {
            const symbol = el("span", "sheet-title-icon");
            symbol.setAttribute("aria-hidden", "true");
            symbol.innerHTML = icon(options.icon);
            heading.append(symbol);
        }
        heading.append(el("span", "sheet-title-text", Locale.t(title)));
        $("sheet-body").replaceChildren();
        $("sheet-layer").hidden = false;
        builder?.($("sheet-body"));
        for (const child of $("screen").children)
            if (child !== $("sheet-layer") && child !== $("phone-toast"))
                child.inert = true;
        $("sheet-close").focus({ preventScroll: true });
        return $("sheet-body");
    }
    /**
     * 输入：restoreFocus。
     * 输出：无。
     * 功能：关闭面板、释放摄像头并恢复页面可访问性。
     */
    function closeSheet(restoreFocus = true) {
        const callback = state.sheetClose;
        state.sheetClose = null;
        callback?.();
        photo.stopCamera();
        cameraVideo = null;
        $("sheet-layer").hidden = true;
        for (const child of $("screen").children)
            child.inert = false;
        if (restoreFocus && sheetReturn?.isConnected && !sheetReturn.closest("[hidden]"))
            sheetReturn.focus({ preventScroll: true });
        sheetReturn = null;
    }
    /**
     * 输入：parent、text、name、action、danger。
     * 输出：按钮。
     * 功能：生成真正有操作的菜单项。
     */
    function sheetAction(parent, text, name, action, danger = false) {
        const b = el("button", "sheet-action" + (danger ? " danger" : ""));
        b.type = "button";
        b.innerHTML = icon(name);
        b.append(el("span", "", Locale.t(text)));
        b.addEventListener("click", action);
        parent.append(b);
        return b;
    }
    /**
     * 输入：title、text、action。
     * 输出：无。
     * 功能：删除、停止、重置前提供明确确认。
     */
    function ask(title, text, action) {
        showSheet(title, b => {
            b.append(el("p", "sheet-text", text));
            const row = el("div", "sheet-buttons"), no = el("button", "", "取消"), yes = el("button", "solid", "确定");
            no.onclick = () => closeSheet();
            yes.onclick = () => {
                closeSheet(false);
                action();
            };
            row.append(no, yes);
            b.append(row);
        });
    }
    /**
     * 输入：scene、options。
     * 输出：无。
     * 功能：集中切页与资源清理，输入草稿保留，退出摄像头/录音。
     */
    function navigate(scene, options = {}) {
        if(['home','history','tasks','profile'].includes(scene)) {
            timer.pause();persistFocus();cancelWork(false);photo.stopCamera();
            window.NavaJournal.call('exit',{destination:scene}).catch(()=>{});return;
        }
        window.NavaJournal.context={category:state.category,recordDate:state.recordDate};
        document.querySelector('.stage').scrollTop=0;
        state.lastQuestion = null;
        state.entryTurns=[];
        continueGate.enter(scene);
        state.photoRead++;
        state.photoJob = null;
        state.photoOwned = {};
        state.speechRetry = false;
        state.pendingUtterance = null;
        if ($("page-cat-notice")) $("page-cat-notice").hidden = true;
        BubbleCopy.stop($("entry-bubble"));
        if (review?.active)
            review.leave();
        entryMenu?.close(false);
        timeRange?.close(false);
        if (animation.scene === "entry")
            preserveDraft();
        cancelWork(false);
        board?.cancel();
        closeSheet(false);
        closeSettings(false);
        bailianSettings?.close(false);
        photo.clear();
        animation.actor && (animation.actor.companionPet = 0);
        animation.setScene(scene, options.time || 0, true);
        $("screen").classList.remove("route-changing");
        if (!animation.reducedMotion && options.transition !== false) {
            void $("screen").offsetWidth;
            $("screen").classList.add("route-changing");
        }
        if (scene === "home") {
            board.update();
            updateHomeStats();
            homeBubble("home");
        }
        if (["history", "tasks", "profile"].includes(scene))
            renderPage(scene);
        synchronizeUI(animation);
    }
    /**
     * 输入：类别。
     * 输出：无。
     * 功能：根据今天已保存数据选择记录或回顾；活动计时优先返回计时器。
     */
    function openCategory(id) {
        state.category=id;state.recordDate=Store.dayKey();
        if (id === "focus" && ["running", "paused", "resting"].includes(timer.state)) {
            navigate("focus");
            renderFocus();
            return;
        }
        const date = Store.dayKey();
        if (Intent.destination(id, date) === "review") {
            navigate("review");
            review.open(id, date);
        }
        else
            openEntry(id);
    }
    /**
     * 输入：类别、日期和可选草稿。
     * 输出：无。
     * 功能：新的一次使用独立ID，不继承前一条的createdAt或编辑标记。
     */
    function newEntry(id, date = Store.dayKey(), values = {}) { openEntry(id, { ...values, recordDate: date }, null); }
    /**
     * 输入：类别、日期、可选候选ID及回调。
     * 输出：无。
     * 功能：列出时间和摘要，用户明确选中后才编辑那一条。
     */
    function chooseEntry(id, date, targetIds = null, after = null) {
        const all = Intent.entries(id, date), rows = targetIds?.length ? all.filter(r => targetIds.includes(r.id)) : all;
        Display.warm(rows);
        showSheet(Locale.t("选择记录"), body => {
            if (!rows.length) {
                body.append(el("p", "sheet-text", Locale.t("没有可修改的记录")));
                sheetAction(body, Locale.t("新增记录"), "plus", () => { closeSheet(false); newEntry(id, date); });
                return;
            }
            const list = el("div", "entry-picker-list");
            for (const r of rows) {
                const b = el("button", "entry-picker-item"), copy = el("span", "entry-picker-copy"), sum = Display.summary(r);
                b.type = "button";
                b.dataset.recordId = r.id;
                b.innerHTML = icon(Catalog.category(id).icon);
                const time = new Date(r.createdAt).toLocaleTimeString(Locale.language() === "en" ? "en-GB" : "zh-CN", { hour: '2-digit', minute: '2-digit', hour12: false });
                const rawSummary = Catalog.summary(r);
                copy.append(Display.bind(el("strong", ""), `${time} · ${rawSummary.value}`), Display.bind(el("span", ""), rawSummary.sub));
                b.append(copy);
                b.onclick = () => { closeSheet(false); openEntry(id, r.data, r); after?.(r); };
                list.append(b);
            }
            body.append(list);
        }, null, { icon: "edit" });
    }
    /**
     * 输入：表达、类别、日期、识别建议及可选已回填字段。
     * 输出：无。
     * 功能：只提出新增/修改操作，用户取消不写数据；目标不明确时必须选择。
     */
    function offerIntent(text, id, date, proposal, fields = null) {
        if (proposal.operation === "none")
            return;
        date = proposal.date || date;
        const candidates = Intent.entries(id, date), fromEntry = animation.scene === "entry", held = fromEntry ? rawForm() : null;
        showSheet(Locale.t("记录方式"), body => {
            body.append(el("p", "sheet-text", Locale.t("这次是新的一次，还是修改原来的记录？")));
            if (proposal.scopeChanged)
                body.append(el("p", "sheet-text", Locale.dateLabel(date)));
            // 阶段一：新增永远用新ID，已有记录不会因为用户选择另一种意图被覆盖。
            sheetAction(body, Locale.t("新增一条"), "plus", () => {
                closeSheet(false);
                newEntry(id, date, fields || held || {});
                if (text && !fields)
                    prepareIntentDraft(text);
                else
                    bubble("写在框里了，确认后交给我记录。");
            });
            // 阶段二：纠错先明确目标，再以目标原内容为底稿；只提取本次真正提到的字段。
            if (candidates.length)
                sheetAction(body, Locale.t("修改原条"), "edit", () => chooseEntry(id, date, proposal.targetIds, () => prepareIntentDraft(text)));
            sheetAction(body, Locale.t("取消操作"), "close", () => closeSheet());
        }, null, { icon: "list" });
    }
    /**
     * 输入：用户已明确同意用于新增或修改的文字。
     * 输出：Promise<void>；仅准备可编辑字段，不提交存储。
     * 功能：纠错只改变本次指定字段，保留其余原值并阻止迟到响应覆盖手工输入。
     */
    async function prepareIntentDraft(text) {
        if (!api.configured) { openSettings(); bubble("deepseek-key", true); return; }
        cancelWork(false);
        const pending = { category:state.category, date:state.recordDate, editingId:state.editingId,
            versions:{...state.versions}, current:rawForm(), question:state.lastQuestion, text:String(text || ""), interim:false, confirmedIntent:true };
        state.pendingUtterance = pending;
        setPhase("thinking");
        await organizeWords(pending, state.serial);
    }

    /**
     * 输入：id、values、record（可选）。
     * 输出：无。
     * 功能：进入对应字段表单，绝不把其他类别的草稿串过来。
     */
    function openEntry(id, values = null, record = null) {
        if (id === "focus" && !values && !record && ["running", "paused", "resting"].includes(timer.state)) {
            navigate("focus");
            renderFocus();
            return;
        }
        if (animation.scene === "entry")
            preserveDraft();
        cancelWork(false);
        photo.clear();
        state.category = id;
        state.lastQuestion = null;
        state.record = record;
        state.intentText = "";
        state.intentConfirmed = false;
        state.expectedUpdatedAt = record && Store.records().some(r => r.id === record.id) ? record.updatedAt || record.createdAt : undefined;
        state.editingId = record?.id || null;
        state.recordDate = record ? Store.dateOf(record) : Sleep.validDate(values?.recordDate) || state.draftDates[id] || Sleep.dateKey();
        state.sleepDates = id === "sleep" && record ? { bedDate: record.data.bedDate || Sleep.validDate(String(record.data.bedtime).split("T")[0]), wakeDate: record.data.wakeDate || Sleep.validDate(String(record.data.wakeTime).split("T")[0]) } : {};
        state.emotionDraft = null;
        state.taskId = null;
        state.editingFocus = record?.focus ? { ...record.focus, plannedMs: Object.prototype.hasOwnProperty.call(record.focus, "plannedMs") ? record.focus.plannedMs : record.focus.provenance === "self-reported" ? null : Number(record.data.durationMinutes) * 60000 } : null;
        state.estimated = Boolean(record?.estimated);
        state.source = "manual";
        const stored = values || state.drafts[id] || {};
        const initial = id === "sport" ? Catalog.sportData(stored) : id === "focus" && state.editingFocus ? { ...stored, durationMinutes: Number((state.editingFocus.elapsedMs / 60000).toFixed(2)) } : stored;
        if (id === "sleep" && !record)
            state.sleepDates = { bedDate: initial.bedDate || "", wakeDate: initial.wakeDate || "" };
        renderForm(initial);
        navigate("entry");
        bubble(Catalog.category(id).greeting);
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：在六类表单原节点上切换标签/占位/按钮，保留用户值、照片、滚动与校验状态。
     */
    function applyEntryLanguage() {
        const id = state.category, past = state.recordDate !== Sleep.dateKey(), retrospective = id === "focus" && (past || Boolean(state.editingId));
        document.documentElement.lang = Locale.language() === "en" ? "en" : "zh-CN";
        $("screen").dataset.language = Locale.language();
        $("entry-heading").querySelector("h1").textContent = Locale.title(id, past);
        for (const field of Catalog.category(id).fields) {
            const input = $(`field-${field.key}`), label = input?.closest(".field");
            if (!input || !label)
                continue;
            const name = label.querySelector(".field-name");
            if (name)
                name.textContent = Locale.t(retrospective && field.key === "durationMinutes" ? "专注时长" : field.label);
            input.placeholder = Locale.t(field.placeholder || "");
            input.setAttribute("aria-label", Locale.t(retrospective && field.key === "durationMinutes" ? "专注时长" : field.label));
            const unit = label.querySelector(".unit");
            if (unit)
                unit.textContent = Locale.t(field.unit);
            label.querySelectorAll(".choice-pill").forEach(b => b.textContent = Locale.t(b.dataset.value));
            const estimate = label.querySelector(".estimate-time");
            if (estimate) {
                estimate.textContent = Locale.t("让小猫估时");
                estimate.hidden = retrospective;
            }
        }
        if (timeRange) {
            timeRange.element.querySelector(".field-header").textContent = Locale.t("睡眠时间");
            for (const b of timeRange.triggers)
                b.setAttribute("aria-label", Locale.language() === "en" ? `${Locale.t(b.dataset.key === "bedtime" ? "入睡时间" : "醒来时间")} ${Locale.t(Number(b.dataset.part) === 0 ? "小时" : "分钟选择")}` : `${b.dataset.key === "bedtime" ? "入睡" : "醒来"}${Number(b.dataset.part) === 0 ? "小时" : "分钟"}`);
        }
        $("entry-form").querySelectorAll(".photo-tool span").forEach((n, i) => n.textContent = Locale.t(i === 0 ? "拍照" : "选择照片"));
        const placeholder = $("photo-preview")?.querySelector(".photo-empty span");
        if (placeholder)
            placeholder.textContent = Locale.t("等待照片");
        const analyze = $("analyze-photo")?.querySelector("span");
        if (analyze)
            analyze.textContent = Locale.t("让小猫看看");
        const remove = $("photo-preview")?.querySelector(".photo-remove");
        if (remove) {
            remove.textContent = Locale.t("移除", "Remove");
            remove.setAttribute("aria-label", Locale.t("移除照片"));
        }
        $("back").setAttribute("aria-label", Locale.t("返回"));
        $("cancel-voice").textContent = Locale.t("取消");
        $("entry-panel").setAttribute("aria-label", Locale.t("填写生活记录", "Journal entry"));
        refreshEntryCompletion();
        synchronizeEntryAction(animation);
        entryMenu?.sync();
        formLayout?.schedule();
    }
    /**
     * 输入：code（zh或en）。
     * 输出：无。
     * 功能：语言偏好贯穿六类记录与回顾；不重置录入，英文阅读副本与原始记录分开。
     */
    function changeLanguage(code) {
        if (["listening", "requesting", "authorizing"].includes(state.phase))
            return;
        cancelWork(false);
        timeRange?.close(false);
        Locale.setLanguage(code);
        if (review)
            review.lang = Locale.language();
        applyEntryLanguage();
        bubble(state.bubbleText || Catalog.category(state.category).greeting, state.bubbleError || false, state.bubbleContext || {});
        homeBubble("home");
        board?.update();
        updateHomeStats();
        if (["history", "tasks", "profile"].includes(animation.scene))
            renderPage(animation.scene);
        Display.warm(animation.scene === "home" ? Store.records().filter(r => Store.dateOf(r) === Store.dayKey()) : review?.active ? review.view.records : [state.record].filter(Boolean));
        __fluffyModules["locale-ui.js"]?.translateDOM();
        animation.render();
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：主页和偏好页共用语言面板，不依赖记录页菜单的可见状态。
     */
    function languageSheet() {
        showSheet(Locale.t("语言切换"), root => {
            const row = el("div", "review-language");
            for (const [code, zh, en] of [["zh", "中文", "Chinese"], ["en", "English", "English"]]) {
                const b = el("button", code === Locale.language() ? "selected" : "", Locale.t(zh, en));
                b.type = "button";
                b.onclick = () => { closeSheet(false); changeLanguage(code); };
                row.append(b);
            }
            root.append(row);
        }, null, { icon: "language" });
    }
    /**
     * 输入：date（YYYY-MM-DD）。
     * 输出：是否应用。
     * 功能：切换事情发生日并清理旧睡眠日期；终止迟到请求但保留当前字段和图片。
     */
    function changeRecordDate(date) {
        if (!Sleep.validDate(date)) {
            toast(Locale.t("日期无效，请重新选择。"));
            return false;
        }
        if (date > Sleep.dateKey()) {
            toast(Locale.t("不能补记未来的日期。"));
            return false;
        }
        if (["listening", "requesting", "authorizing"].includes(state.phase)) {
            toast(Locale.t("请先完成或取消当前语音输入。"));
            return false;
        }
        if (date !== state.recordDate) {
            cancelWork(false);
            state.recordDate = date;
            state.sleepDates = {};
            preserveDraft();
        }
        applyEntryLanguage();
        animation.render();
        return true;
    }
    /**
     * 输入：record。
     * 输出：展示用行数组。
     * 功能：生成书写用的本地化只读行，保留原始记录与实际数值。
     */
    function localizedRows(record) {
        const rows = Catalog.rows(Locale.language() === "en" ? Display.record(record) : record);
        if (Locale.language() !== "en")
            return rows;
        const labels = { "早餐": "Breakfast", "午餐": "Lunch", "晚餐": "Dinner", "加餐": "Snack", "Nutrition · 估算": "Nutrition", "My feeling · 自评": "My feeling" };
        return rows.map(r => ({ ...r, label: labels[r.label] || r.label, value: r.value.replace(/^约 /, "~ ").replace(/^份量未记录$/, "Portion not recorded").replace(/^未填写备注$/, "No note added").replace(/^未填写事件$/, "No event added").replace(/^未填写外观观察$/, "No observation added") }));
    }
    /**
     * 输入：record（过去日期的专注草稿）。
     * 输出：无。
     * 功能：补记需用户确认实际用时，不把现在计时冒充过去；记录来源明确标注自述。
     */
    function confirmPastFocus(record) {
        showSheet(Locale.t(state.editingId ? "修改专注" : "补记专注"), root => {
            const text = Locale.t(`${Locale.dateLabel(record.recordDate)}，专注 ${record.data.durationMinutes} 分钟。`, `${Locale.dateLabel(record.recordDate)} · ${record.data.durationMinutes} minutes focused.`);
            root.append(el("p", "past-focus-copy", record.data.task), el("p", "past-focus-detail", text));
            const save = el("button", "date-confirm-focus", Locale.t(state.editingId ? "保存修改" : "保存补记"));
            save.type = "button";
            save.onclick = async () => {
                if(save.disabled)return;save.disabled=true;
                // 阶段一：修改日期/文字保留计时来源；显式改时长则标为自述，不伪装成计时器测得。
                const old = state.editingFocus, elapsedMs = Math.round(record.data.durationMinutes * 60000);
                const changed = Boolean(old) && Math.abs(old.elapsedMs - elapsedMs) > 1000;
                const focus = old ? { ...old, elapsedMs: changed ? elapsedMs : old.elapsedMs, provenance: changed ? "self-reported" : old.provenance || "timer" } : { elapsedMs, restMs: 0, plannedMs: null, taskCompleted: false, reachedTarget: false, provenance: "self-reported" };
                state.record = { ...record, source: state.editingId ? record.source : "manual-backfill", focus };
                // 阶段二：先确保存储成功，再进入原来的庆祝；不启动当前时间的倒计时。
                if (!await Store.save(state.record)) {
                    save.disabled=false;
                    toast(state.record?.expectedUpdatedAt !== undefined ? "本次修改与其他窗口冲突，请重新打开记录。" : "本机暂时无法保存，记录仍在当前页面。");
                    return;
                }
                state.drafts.focus = {};
                delete state.draftDates.focus;
                state.editingId = null;
                closeSheet(false);
                animation.setRecord(state.record);
                animation.saved = true;
                navigate("celebrate");
            };
            root.append(save);
        });
    }
    /**
     * 输入：无。
     * 输出：字段对象。
     * 功能：只读取当前类别已有的输入控件。
     */
    function rawForm() {
        const fields = Object.fromEntries(Catalog.category(state.category).fields.map(f => [f.key, $(`field-${f.key}`)?.value ?? ""]));
        return state.category === "sleep" ? { ...fields, ...state.sleepDates } : fields;
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：切页前在内存保留草稿，不自动上传或当作记录。
     */
    function preserveDraft() {
        if ($("entry-form").dataset.category === state.category) {
            state.drafts[state.category] = rawForm();
            state.draftDates[state.category] = state.recordDate;
            refreshEntryCompletion();
            synchronizeEntryAction(animation);
        }
    }
    /**
     * 输入：无，读取当前类别的字段与记录日期。
     * 输出：无，缓存完成度和原有可提交状态。
     * 功能：仅在输入、AI回填、日期或表单变化时校验，避免每帧读取和验证全部控件。
     */
    function refreshEntryCompletion() {
        if ($("entry-form").dataset.category !== state.category)
            return;
        const status = EntryAction.inspect(state.category, rawForm(), { recordDate: state.recordDate });
        state.entryComplete = status.complete;
        state.entryCanSubmit = status.canSubmit;
    }
    /**
     * 输入：a（当前动画控制器）。
     * 输出：无，仅在状态改变时更新按钮的文字、布局和可访问名称。
     * 功能：同一按钮在倾诉提示与继续动作间切换；不搬动记录页的语音面板。
     */
    function synchronizeEntryAction(a) {
        // 阶段一：组合语言、补记和请求状态，录音中的阶段始终优先。
        const view = EntryAction.describe({
            category: state.category, complete: state.entryComplete, phase: state.phase,
            language: Locale.language(), editing: Boolean(state.editingId),
            past: state.recordDate < Sleep.dateKey(), loaded: a.ready
        });
        const signature = JSON.stringify(view);
        if (lastEntryAction === signature)
            return;
        lastEntryAction = signature;
        // 阶段二：未填满仍允许长按或按既有规则手动提交，不新增营养必填/自动录音。
        const button = $("confirm-entry");
        button.dataset.action = view.mode;
        button.disabled = view.disabled;
        button.setAttribute("aria-label", view.accessibleLabel);
        $("confirm-label").textContent = view.label;
        $("hold-help").textContent = view.help;
    }
    /**
     * 输入：fields、snapshot（请求开始版本）。
     * 输出：被保护字段数量。
     * 功能：允许 AI 回填但不覆盖请求期间用户的新修改。
     */
    function fillForm(fields, snapshot = null) {
        let protectedCount = 0;
        for (const f of Catalog.category(state.category).fields) {
            const input = $(`field-${f.key}`);
            if (!input || fields[f.key] == null || fields[f.key] === "")
                continue;
            if (snapshot && snapshot[f.key] !== state.versions[f.key]) {
                protectedCount++;
                continue;
            }
            input.value = f.type === "time" ? Sleep.clock(fields[f.key]) : String(fields[f.key]);
            updateFieldDisplay(f, input);
            input.setAttribute("aria-invalid", "false");
        }
        timeRange?.sync();
        formLayout?.schedule();
        preserveDraft();
        return protectedCount;
    }
    /**
     * 输入：field、input。
     * 输出：无。
     * 功能：餐次选择状态跟随真实表单值；情绪和睡眠感受不再使用选项。
     */
    function updateFieldDisplay(field, input) {
        if (field.type === "choice")
            input.parentElement.querySelectorAll(".choice-pill").forEach(b => {
                b.classList.toggle("selected", b.dataset.value === input.value);
                b.setAttribute("aria-pressed", String(b.dataset.value === input.value));
            });
    }
    /**
     * 输入：field、value。
     * 输出：一项表单。
     * 功能：统一全宽字段、预设单位、范围、选择及最长字数。
     */
    function makeField(field, value) {
        const label = el("label", "field"), head = el("span", "field-header"), name = el("span", "field-name", Locale.t(field.label));
        label.dataset.field = field.key;
        head.append(name);
        label.append(head);
        const input = el(field.type === "textarea" ? "textarea" : "input");
        if (field.type === "textarea") {
            label.classList.add("field-long");
            input.rows = 3;
        }
        input.id = `field-${field.key}`;
        input.name = field.key;
        input.autocomplete = "off";
        input.value = field.type === "time" && value ? Sleep.clock(value) : value ?? field.initial ?? "";
        input.setAttribute("aria-label", Locale.t(field.label));
        if (field.max)
            input.maxLength = field.max;
        if (field.required)
            input.required = true;
        input.placeholder = Locale.t(field.placeholder || "");
        if (field.type === "choice") {
            input.type = "hidden";
            label.append(input);
            const choices = el("span", "choice-group");
            choices.setAttribute("role", "group");
            choices.setAttribute("aria-label", field.label);
            field.options.forEach(value => {
                const b = el("button", "choice-pill", Locale.t(value));
                b.type = "button";
                b.dataset.value = value;
                b.onclick = () => {
                    input.value = value;
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                };
                choices.append(b);
            });
            label.append(choices);
        }
        else {
            if (field.type !== "textarea")
                input.type = field.type === "time" ? "time" : "text";
            if (field.type === "time") {
                input.step = "60";
                input.setAttribute("aria-description", "24小时制，只需要时和分");
            }
            if (field.type === "decimal") {
                input.inputMode = "decimal";
                input.maxLength = 16;
            }
            if (field.unit) {
                const wrap = el("span", "input-wrap");
                wrap.append(input, el("span", "unit", Locale.t(field.unit)));
                label.append(wrap);
            }
            else
                label.append(input);
        }
        if (field.estimate) {
            const b = el("button", "estimate-time", Locale.t("让小猫估时"));
            b.type = "button";
            b.onclick = estimateTime;
            head.append(b);
        }
        input.addEventListener("input", () => {
            state.versions[field.key] = (state.versions[field.key] || 0) + 1;
            input.setAttribute("aria-invalid", "false");
            // 手动修改任一睡眠时刻后重新推导跨天，不能沿用AI曾猜的另一天。
            if (state.category === "sleep" && ["bedtime", "wakeTime"].includes(field.key))
                state.sleepDates = {};
            updateFieldDisplay(field, input);
            preserveDraft();
        });
        updateFieldDisplay(field, input);
        return label;
    }
    /**
     * 输入：values（草稿）。
     * 输出：无。
     * 功能：按类别构建字段，饮食/面部额外提供真实相机与选择照片入口。
     */
    function renderForm(values = {}) {
        // 阶段一：读取类别并清理上一个表单，不清理其他类别草稿。
        const def = Catalog.category(state.category), form = $("entry-form");
        timeRange?.destroy();
        timeRange = null;
        formLayout?.destroy();
        formLayout = null;
        form.replaceChildren();
        form.dataset.category = state.category;
        state.versions = {};
        $("entry-panel").scrollTop = 0;
        $("entry-heading").querySelector("h1").textContent = Locale.title(state.category, state.recordDate !== Sleep.dateKey());
        // 阶段二：饮食选图即分析；面部维持手动分析。仅用户新选照片触发自动上传。
        if (def.photo) {
            const preview = el("div", "photo-preview");
            preview.id = "photo-preview";
            preview.setAttribute("aria-label", "照片预览框");
            form.append(preview);
            const tools = el("div", "photo-tools");
            for (const [title, name, action] of [["拍照", "camera", openCamera], ["选择照片", "photo", selectLibrary]]) {
                const b = el("button", "photo-tool");
                b.type = "button";
                b.innerHTML = icon(name);
                b.append(el("span", "", title));
                b.onclick = action;
                tools.append(b);
            }
            form.append(tools);
            if (state.category !== "food") {
                const analyze = el("button", "analyze-photo");
                analyze.type = "button";
                analyze.id = "analyze-photo";
                analyze.hidden = true;
                analyze.innerHTML = icon("sparkle");
                analyze.append(el("span", "", "让小猫看看"));
                analyze.onclick = () => analyzePhoto(true);
                form.append(analyze);
            }
            showPhoto(null);
        }
        // 阶段三：同一字段模型，营养输入直接平铺为表单子项；不再创建折叠分组。
        const note = el("div", "ai-draft-note");
        note.id = "draft-note";
        note.hidden = true;
        form.append(note);
        const mainFields = def.fields.filter(f => !f.group && !(def.photo && f.key === "notes"));
        mainFields.forEach(f => {
            state.versions[f.key] = 0;
            if (state.category === "sleep" && f.key === "bedtime") {
                timeRange = new TimeRangePicker($("screen"), values, key => {
                    state.versions[key] = (state.versions[key] || 0) + 1;
                    state.sleepDates = {};
                    preserveDraft();
                });
                form.append(timeRange.element);
            }
            else if (!(state.category === "sleep" && f.key === "wakeTime")) {
                form.append(makeField(f, values[f.key]));
            }
        });
        for (const f of def.fields.filter(f => f.group)) {
            state.versions[f.key] = 0;
            form.append(makeField(f, values[f.key]));
        }
        if (def.photo) {
            const last = def.fields.find(f => f.key === "notes");
            if (last) {
                state.versions[last.key] = 0;
                form.append(makeField(last, values[last.key]));
            }
        }
        formLayout = new FormLayout($("entry-panel"), form);
        $("speech-transcript").textContent = Locale.t(`说说这一天的${def.name}吧。`, "Tell me about this little moment.");
        applyEntryLanguage();
    }
    /**
     * 输入：errors。
     * 输出：无。
     * 功能：只在提交时标记无效字段。
     */
    function showErrors(errors = {}) {
        for (const f of Catalog.category(state.category).fields)
            $(`field-${f.key}`)?.setAttribute("aria-invalid", String(Boolean(errors[f.key])));
        timeRange?.sync();
    }
    /**
     * 输入：无。
     * 输出：规范化字段或 null。
     * 功能：确认前检查必需项；焦点定位错误而不显示一屏说明。
     */
    function checkedForm() {
        const checked = Catalog.validate(state.category, rawForm(), true, { recordDate: state.recordDate });
        showErrors(checked.errors);
        if (!checked.ok) {
            const key = Object.keys(checked.errors)[0];
            bubble(checked.errors[key], true, { field: key, invalid: Boolean(String(rawForm()[key] ?? "").trim()) });
            const input = $(`field-${key}`);
            if (state.category === "sleep" && ["bedtime", "wakeTime"].includes(key)) {
                timeRange?.element.scrollIntoView({ block: "nearest" });
                timeRange?.focus(key);
            }
            else {
                input?.scrollIntoView({ block: "nearest" });
                input?.focus({ preventScroll: true });
            }
            return null;
        }
        return checked.value;
    }
    /**
     * 输入：data、source。
     * 输出：不可变记录快照。
     * 功能：动画绑定本次确认的数据，实际保存时去掉视图字段。
     */
    function snapshot(data, source = "manual") {
        const r = {
            id: state.editingId || (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`), category: state.category, data: { ...data }, recordDate: state.recordDate, createdAt: state.record?.createdAt || new Date().toISOString(), source, expectedUpdatedAt: state.expectedUpdatedAt, estimated: state.estimated
        };
        r.displayRows = localizedRows(r);
        return Object.freeze(r);
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：普通记录先书写后庆祝，专注先真实倒计时，不颠倒流程。
     */
    async function confirmManual() {
        // 整理期间表单仍可编辑；短按同一按钮可取消，不丢失用户填写。
        if (state.phase === "thinking") {
            cancelWork(true);
            return;
        }
        if (state.submitting || state.phase !== "idle" || animation.scene !== "entry" || !animation.ready)
            return;
        const data = checkedForm();
        if (!data)
            return;
        state.record = snapshot(data, state.source);
        preserveDraft();
        cancelWork(false);
        document.activeElement?.blur();
        if (state.category === "focus") {
            if (state.recordDate < Sleep.dateKey() || state.editingId) {
                confirmPastFocus(state.record);
                return;
            }
            beginFocus(state.record);
            return;
        }
        // 英文仅建立展示副本；用户原文和确认数据留在原记录中。
        const submitted = state.record, version = JSON.stringify(rawForm()), serial = state.serial;
        state.submitting = true;
        try {
            await Display.warm([submitted]);
        }
        finally {
            state.submitting = false;
        }
        if (animation.scene !== "entry" || state.serial !== serial || JSON.stringify(rawForm()) !== version)
            return;
        state.record = { ...submitted, displayRows: localizedRows(submitted) };
        animation.setRecord(state.record);
        navigate("record", { transition: false });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：记录书写后继续才保存；庆祝完成进入对应回顾，不再次创建记录。
     */
    async function primaryAction(event) {
        if ($("primary").disabled) return;
        if (animation.scene === "record") {
            // 阶段一：两秒内或提前按住的点击直接失效，不延迟执行、不显示提示。
            if (!continueGate.take()) return;
            const record=state.record;
            try {
                // 阶段二：保存完整确认快照，不从当前画到的纸面反推数据。
                if (!await Store.save(record)) {
                    continueGate.unlock();
                    toast(record?.expectedUpdatedAt !== undefined ? "save-conflict" : "save-failed");
                    return;
                }
                if(state.record!==record || animation.scene!=='record')return;
                state.drafts[state.category]={}; delete state.draftDates[state.category]; state.editingId=null;
                photo.clear(); animation.saved=true; animation.actor.companionPet=0;
                // 阶段三：直接走既有庆祝过渡；旧书写仅是展示，不补写、不再重复保存。
                navigate("celebrate");
            } catch (_) { continueGate.unlock(); toast("save-failed"); }
        } else if (animation.scene === "celebrate") {
            if (state.record) openReview(state.record); else navigate("home");
        }
    }

    /**
     * 输入：record（已确认且保存的记录）。
     * 输出：无。
     * 功能：庆祝完成或历史入口打开相应板块的只读回顾；不再次新增记录。
     */
    function openReview(record) {
        navigate("review");
        review.lang = Locale.language();
        review.open(record);
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：书写过程中返回同一条记录编辑，而不是清空用户输入。
     */
    function editRecord() {
        const r = state.record;
        if (r)
            openEntry(r.category, r.data, r);
    }
    /**
     * 输入：phase。
     * 输出：无。
     * 功能：角色的倾听/思考连续追踪实际请求状态。
     */
    function setPhase(phase) {
        state.phase = phase;
        if (phase === "idle")
            refreshEntryCompletion();
        updateSpeechRetry();
        animation.entryMode = phase === "thinking" ? "thinking" : ["listening", "requesting"].includes(phase) ? "listening" : "idle";
        $("confirm-entry").classList.toggle("holding", phase === "listening");
        $("confirm-entry").dataset.pending = String(phase === "thinking");
        $("voice-overline").textContent = Locale.t(phase === "thinking" ? "小猫正在整理" : phase === "requesting" ? "等待麦克风" : "正在听你说");
        $("voice-hint").textContent = Locale.t(phase === "thinking" ? "整理好后，你可以修改每个字段" : "松开，交给我整理");
        animation.render();
    }
    /**
     * 输入：announce。
     * 输出：无。
     * 功能：取消所有迟到请求并释放麦克风；用户草稿保持不变。
     */
    function cancelWork(announce = true) {
        const busy = state.phase !== "idle", pending = state.pendingUtterance;
        state.workflowTrace?.mark("canceled");
        state.stage = "idle";
        if (state.photoJob?.status === "running") state.photoJob.status = "canceled";
        $("photo-preview")?.setAttribute("aria-busy", "false");
        state.serial++;
        state.task?.abort();
        state.task = null;
        speech.cancel();
        rawAudio.cancel();
        animation.level = 0;
        wave = Array(72).fill(0);
        state.phase = "idle";
        animation.entryMode = "idle";
        if (animation.scene === "entry") {
            setPhase("idle");
            if (pending?.text && pending.category === state.category && pending.date === state.recordDate) state.speechRetry = true;
            if (busy || announce) bubble(state.speechRetry ? "entry-paused" : "entry-held", false, {photoRetry:Boolean(currentPhotoJob())});
        }
    }
    /**
     * 输入：无。
     * 输出：Promise<void>。
     * 功能：首次先授权、下次实际长按收音，不把权限弹窗失焦当作取消授权。
     */
    async function beginSpeech() {
        if (animation.scene !== "entry" || state.phase !== "idle")
            return;
        if (!api.configured) {
            gesture?.disarm();
            openSettings();
            bubble("deepseek-key", true);
            return;
        }
        activeSpeech = speech;
        state.voiceBackend = "text";
        if (!speech.supported()) {
            gesture?.disarm();
            bubble("speech-unsupported", true);
            return;
        }
        state.pendingUtterance = null;
        state.speechRetry = false;
        cancelWork(false);
        const serial = state.serial;
        setPhase("requesting");
        try {
            const permission = await microphone.status();
            if (serial !== state.serial)
                return;
            if (permission !== "granted") {
                gesture.disarm();
                setPhase("authorizing");
                if (permission === "denied")
                    throw Error("请在地址栏的网站权限里允许麦克风。");
                bubble("请先允许麦克风。");
                await microphone.authorize();
                if (serial !== state.serial)
                    return;
                setPhase("idle");
                bubble("准备好了，长按开始说话。");
                return;
            }
            if (!gesture.pressed) {
                cancelWork(false);
                return;
            }
            state.voiceVersions = { ...state.versions };
            wave = Array(72).fill(0);
            $("speech-transcript").textContent = Locale.t(`说说这一天的${Catalog.category(state.category).name}吧。`, "Tell me about this little moment.");
            await activeSpeech.start({ language: Locale.language() === "en" ? "en-US" : CONFIG.speechLanguage, maximumSeconds: CONFIG.maximumSpeechSeconds });
        }
        catch (error) {
            if (serial === state.serial)
                voiceFailed(error.name === "NotAllowedError" ? "麦克风没有被允许。" : error);
        }
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：真实识别器启动之后才显示正在倾听。
     */
    function listeningStarted() {
        if (state.phase === "requesting") {
            setPhase("listening");
            bubble("嗯，我在听。");
        }
    }
    /**
     * 输入：level、history。
     * 输出：无。
     * 功能：以真实 RMS 驱动波形和猫耳，不伪造音量。
     */
    function audioLevel(level, history) {
        animation.level = level;
        wave = history.slice();
    }
    /**
     * 输入：text。
     * 输出：无。
     * 功能：展示真实转写。
     */
    function receivedSpeech(text) {
        $("speech-transcript").textContent = text || Locale.t("慢慢说，我在听。", "Take your time. I am listening.");
    }
    /**
     * 输入：message。
     * 输出：无。
     * 功能：故障时释放资源并保留输入，绝不回填演示数据。
     */
    function voiceFailed(message) {
        state.workflowTrace?.mark("failed", message?.code);
        cancelWork(false);
        bubble(message, true);
    }
    /**
     * 输入：无。
     * 输出：Promise<void>。
     * 功能：松手后终止录音，实际整理成可修改草稿，等待用户确认。
     */
    async function releaseSpeech() {
        if (state.phase === "authorizing") return;
        if (state.phase === "requesting") { cancelWork(false); return; }
        if (state.phase !== "listening") return;
        const serial = state.serial, pending = { category: state.category, date: state.recordDate, editingId: state.editingId, versions: { ...state.voiceVersions }, current:rawForm(), question:state.lastQuestion && state.lastQuestion.version === state.versions[state.lastQuestion.field] && performance.now()-state.lastQuestion.at < 600000 ? {...state.lastQuestion} : null, text: "", interim: false };
        state.workflowTrace = Trace.begin(pending.category);
        state.workflowTrace.mark("dictation");
        state.stage = "dictation";
        setPhase("thinking");
        bubble("dictation-tail");
        try {
            const result = await speech.stop();
            animation.level = 0;
            if (serial !== state.serial || result.canceled) return;
            if (!result.text?.trim()) throw new Policy.AIError("speech-empty", "没有收到听写文本。");
            pending.text = result.text.trim();
            pending.interim = Boolean(result.interim || result.interrupted);
            state.pendingUtterance = pending;
            await organizeWords(pending, serial);
        } catch (error) {
            if (serial === state.serial && error.name !== "AbortError") voiceFailed(error);
        }
    }
    /**
     * 输入：pending（转写文字、字段版本、记录上下文）、serial（本次请求代次）。
     * 输出：Promise<void>。
     * 功能：DeepSeek只处理独立ASR文本；API失败保留原话供显式重试，成功也不自动保存。
     */
    async function organizeWords(pending, serial) {
        const controller = state.task = new AbortController(), trace = state.stage === "dictation" && state.workflowTrace ? state.workflowTrace : Trace.begin(pending.category);
        const current = pending.current || rawForm(), before = Intent.classify(pending.text, {category:pending.category,date:pending.date,editingId:pending.editingId});
        const candidates = Intent.entries(pending.category, before.date).slice(0,12);
        let expired = false;
        const timeout = setTimeout(() => { expired=true; controller.abort(); }, Math.max(500, Math.min(45000, CONFIG.entryRequestBudgetMs || 30000)));
        state.workflowTrace=trace;
        try {
            // 阶段一：明确时间先形成待确认草稿，缺少感受也不必让整个表单空着等待。
            Policy.language(api);
            state.stage="extract";
            setPhase("thinking");
            bubble("entry-organizing");
            if (!before.scopeChanged && !["ask","edit"].includes(before.operation)) {
                const local=Guidance.early(pending.category,pending.text,{recordDate:pending.date});
                if (Object.keys(local.fields).length) { fillForm(local.fields,pending.versions); trace.mark("local"); }
            }
            trace.mark("extract");
            const draft = await AI.extract(api, pending.category, pending.text, null, controller.signal, {
                recordDate:pending.date, current, lastQuestion:pending.question,
                operation:pending.editingId ? "edit" : pending.date < Sleep.dateKey() ? "retrospective" : "new", candidates
            });
            if (serial !== state.serial || pending.category !== state.category || pending.date !== state.recordDate || pending.editingId !== state.editingId || controller.signal.aborted) return;
            // 阶段二：同一次模型返回附带意图建议；普通新增不再串行发第二个意图请求。
            let proposed=before;
            if (!pending.confirmedIntent && before.operation === "none" && draft.intent && draft.intent.operation !== "keep") {
                const valid=Intent.validateProposal(draft.intent,candidates);
                proposed={...before,...valid};
            }
            const conflict = !pending.confirmedIntent && (proposed.scopeChanged || proposed.operation === "ask" || proposed.operation === "edit" && !state.editingId || proposed.operation === "add" && Boolean(state.editingId));
            state.speechRetry=false;
            if (conflict) {
                setPhase("idle"); state.stage="idle";
                offerIntent(pending.text,pending.category,pending.date,proposed,draft.fields);
                state.pendingUtterance=null; trace.mark("question"); trace.mark("done"); return;
            }
            state.source=pending.source || "voice";
            state.estimated=draft.estimated;
            const protectedCount=fillForm(draft.fields,pending.versions);
            // 明确清空才允许空值进入表单；用户在等待中改过的字段仍优先。
            for (const key of draft.clearFields || []) {
                if (pending.versions[key] !== state.versions[key] || draft.fields[key] != null && String(draft.fields[key]).trim()) continue;
                const input=$(`field-${key}`);
                if (input) { input.value=""; updateFieldDisplay(Catalog.category(state.category).fields.find(f=>f.key===key),input); }
            }
            if (pending.category === "sleep" && pending.versions.bedtime === state.versions.bedtime && pending.versions.wakeTime === state.versions.wakeTime)
                state.sleepDates=draft.sleepDates?.wakeDate && draft.sleepDates.wakeDate !== state.recordDate ? {} : draft.sleepDates || {};
            if (pending.interim) draft.warnings.push("speech-partial");
            if (protectedCount) draft.warnings.push("manual-kept");
            state.emotionDraft=draft.emotion || null;
            state.lastQuestion=null;
            preserveDraft(); timeRange?.sync();
            state.stage="idle"; setPhase("idle"); trace.mark("draft");
            state.pendingUtterance=null;
            // 阶段三：追问只用当前未填必需项或真正歧义；对话的鼓励不写进用户备注。
            const hints=Companion.hints(pending.text,state.entryTurns), q=Guidance.question(pending.category,draft.clarification,rawForm(),Locale.language(),pending.editingId ? "edit" : pending.date < Sleep.dateKey() ? "retrospective" : "new");
            state.entryTurns.push({role:"user",content:pending.text.slice(0,500)});
            state.entryTurns=state.entryTurns.slice(-8);
            if (hints.noQuestions) bubble("entry-no-question");
            else if (hints.complaint && !Object.keys(draft.fields).length) bubble("entry-repair");
            else if (q) { bubble(q.question,false,{question:q,category:pending.category}); state.entryTurns.push({role:"assistant",content:q.question}); trace.mark("question"); }
            else showDraft(draft.warnings);
            trace.mark("done");
        } catch (error) {
            if (serial !== state.serial || error.name === "AbortError" && !expired) return;
            state.task=null; state.stage="idle"; setPhase("idle");
            state.pendingUtterance=pending; state.speechRetry=true;
            const fault=expired ? new Policy.AIError("ai-timeout","Entry processing deadline reached") : error;
            trace.mark("failed",fault.code);
            bubble(fault,true,{followup:"retry"});
        } finally {
            clearTimeout(timeout);
            if (state.task===controller) state.task=null;
            updateSpeechRetry();
        }
    }

    /**
     * 输入：无，读取仅在内存中的上次转写。
     * 输出：Promise<void>。
     * 功能：失败后由用户点击小猫显式重试；提交中再次点击不发送第二个请求。
     */
    async function retryWords() {
        if (state.bubbleContext?.photoRetry && currentPhotoJob()) {
            await analyzePhoto(true);
            return;
        }
        const p = state.pendingUtterance;
        if (!p || !state.speechRetry || state.phase !== "idle" || p.category !== state.category || p.date !== state.recordDate || p.editingId !== state.editingId) return;
        if (!api.configured) { openSettings(); bubble("deepseek-key", true); return; }
        state.speechRetry = false;
        const serial = ++state.serial;
        setPhase("thinking");
        bubble("thinking");
        await organizeWords(p, serial);
    }
    /**
     * 输入：warnings。
     * 输出：无。
     * 功能：只在 AI 回填后提示核对；未知营养不伪装成精确数据。
     */
    function showDraft(warnings = []) {
        const note = $("draft-note");
        if (note) { note.hidden = true; note.textContent = ""; }
        if (warnings.length) {
            // 先说最可操作的一条，不暴露供应商正文；字段本身仍可完整核对。
            bubble(warnings[0], true, { followups: warnings.slice(1, 4) });
        } else bubble("ready");
    }
    /**
     * 输入：无。
     * 输出：Promise<void>。
     * 功能：按任务估时，保护用户在请求期间改过的分钟数。
     */
    async function estimateTime() {
        if (state.phase !== "idle")
            return;
        if (!api.configured) {
            openSettings();
            bubble("deepseek-key", true);
            return;
        }
        const data = rawForm();
        if (!data.task.trim()) {
            bubble("先写下想做的事情。", true, { field: "task" });
            return;
        }
        const serial = ++state.serial, version = { ...state.versions }, controller = state.task = new AbortController();
        setPhase("thinking");
        bubble("让我把时间估得实际一点。");
        try {
            const result = await AI.estimate(api, data.task, data.notes || "", controller.signal);
            if (serial !== state.serial || state.category !== "focus" || controller.signal.aborted)
                return;
            // 用户改了任务或目标，旧估时不再适用；不能只保护分钟框。
            if (version.task !== state.versions.task || version.notes !== state.versions.notes) { bubble("manual-kept"); return; }
            fillForm({ durationMinutes: result.minutes }, version);
            // 保留可修改分钟数，但不插入黄色说明，也不自动启动专注。
            const note = $("draft-note");
            note.hidden = true;
            note.textContent = "";
            bubble("estimated");
        }
        catch (e) {
            if (serial === state.serial && e.name !== "AbortError")
                bubble(e, true);
        }
        finally {
            if (serial === state.serial) { state.task = null; setPhase("idle"); }
        }
    }
    /**
     * 输入：image（经过重编码的 JPEG）。
     * 输出：无。
     * 功能：按原比例显示照片；本函数不联网，上传仅由本轮用户选图/拍摄入口触发。
     */
    function showPhoto(image) {
        const preview = $("photo-preview");
        if (!preview)
            return;
        preview.replaceChildren();
        preview.hidden = false;
        preview.classList.toggle("has-image", Boolean(image));
        if ($("analyze-photo")) $("analyze-photo").hidden = !image;
        if (!image) {
            preview.style.height = state.category === "face" ? "165px" : "96px";
            formLayout?.schedule();
            const placeholder = el("span", "photo-empty");
            placeholder.innerHTML = icon("photo");
            placeholder.append(el("span", "", Locale.t("等待照片")));
            preview.append(placeholder);
            return;
        }
        const img = el("img");
        img.alt = Locale.t(state.category === "face" ? "本次面部照片" : "本次食物照片", state.category === "face" ? "Your check-in photo" : "Your meal photo");
        /**
         * 输入：无。
         * 输出：无。
         * 功能：按容器可用宽度等比展示整张照片，竖图不裁切或拉伸。
         */
        function fitPhoto() {
            if (img.isConnected && img.naturalWidth)
                preview.style.height = `${preview.clientWidth * img.naturalHeight / img.naturalWidth}px`;
        }
        img.onload = fitPhoto;
        img.src = image;
        const clear = el("button", "photo-remove", Locale.t("移除", "Remove"));
        clear.type = "button";
        clear.setAttribute("aria-label", Locale.t("移除照片"));
        clear.onclick = removePhoto;
        preview.append(img, clear);
        requestAnimationFrame(fitPhoto);
    }
    /**
     * 输入：无。
     * 输出：Promise<void>。
     * 功能：请求相机预览，支持明确拍摄/取消；离开立即停止所有轨道。
     */
    async function openCamera() {
        if(window.NavaJournal.initial.nativePhotos){
            try {const file=await window.NavaJournal.call('photo',{source:'camera',facing:state.category==='face'?'user':'environment'});if(file)acceptPhoto(await photo.readFile(file));}catch(error){toast(error.message);}return;
        }
        const id = state.category;
        cancelWork(false);
        const serial = state.serial;
        let status;
        showSheet("拍一张照片", b => {
            cameraVideo = el("video", "camera-video");
            cameraVideo.autoplay = true;
            cameraVideo.muted = true;
            cameraVideo.playsInline = true;
            b.append(cameraVideo);
            status = el("p", "camera-status", Locale.t("正在等待摄像头…"));
            b.append(status);
            const row = el("div", "sheet-buttons");
            const capture = el("button", "solid", Locale.t("拍下这一张")), pick = el("button", "", Locale.t("选择照片"));
            capture.onclick = () => {
                try {
                    if (serial !== state.serial || id !== state.category || animation.scene !== "entry") return;
                    const image = photo.capture(cameraVideo);
                    closeSheet();
                    acceptPhoto(image);
                }
                catch (e) {
                    closeSheet(false);
                    bubble(e, true);
                }
            };
            pick.onclick = () => {
                closeSheet();
                $("photo-library").click();
            };
            row.append(pick, capture);
            b.append(row);
        }, () => photo.stopCamera());
        try {
            const started = await photo.openCamera(cameraVideo, id === "face");
            if (started && id === state.category)
                status.textContent = "";
        }
        catch (e) {
            if (!$("sheet-layer").hidden && id === state.category) {
                closeSheet(false);
                bubble(e.name === "NotAllowedError" ? "camera-permission" : "camera-device", true);
            }
        }
    }
    async function selectLibrary(){
        if(!window.NavaJournal.initial.nativePhotos){$("photo-library").click();return;}
        try{const file=await window.NavaJournal.call('photo',{source:'library'});if(file)acceptPhoto(await photo.readFile(file));}catch(error){toast(error.message);}
    }
    /**
     * 输入：无，读取当前任务和页面上下文。
     * 输出：boolean，当前照片是否仍属于本次记录。
     * 功能：验证图片、类别、日期和编辑身份，避免跨页、跨日或旧照片回填。
     */
    function currentPhotoJob() {
        const job = state.photoJob;
        return Boolean(job && animation.scene === "entry" && job.image === photo.image
            && job.category === state.category && job.date === state.recordDate && job.editingId === state.editingId);
    }
    /**
     * 输入：无，读取照片字段所有权。
     * 输出：无。
     * 功能：只清除上一张照片自动填入且未被手动修改的项目，不影响已保存记录。
     */
    function clearPhotoFields() {
        for (const key of PhotoDraft.staleKeys(rawForm(), state.versions, state.photoOwned)) {
            const input = $(`field-${key}`);
            if (!input) continue;
            input.value = "";
            input.setAttribute("aria-invalid", "false");
            updateFieldDisplay(Catalog.category(state.category).fields.find(f => f.key === key), input);
        }
        state.photoOwned = {};
        preserveDraft();
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：移除照片并中止本轮分析；保护手动修改，旧响应不得再次出现。
     */
    function removePhoto() {
        cancelWork(false);
        state.photoRead++;
        if (state.category === "food") clearPhotoFields();
        state.photoJob = null;
        photo.clear();
        showPhoto(null);
        bubble(Catalog.category(state.category).greeting);
    }
    /**
     * 输入：image（用户新选择/拍摄并重编码后的JPEG）。
     * 输出：Promise<void>。
     * 功能：显示新照片；饮食自动分析一次，面部维持原来的手动分析流程。
     */
    async function acceptPhoto(image) {
        if (!image || animation.scene !== "entry" || !Catalog.category(state.category).photo) return;
        // 阶段一：相同已完成图片不重复扣费；渲染、缩放和语言切换不调用此函数。
        if (state.category === "food" && state.photoJob?.image === image && state.photoJob.status === "done" && currentPhotoJob() && state.photoJob.lastForm === JSON.stringify(rawForm())) {
            showPhoto(image);
            return;
        }
        cancelWork(false);
        if (state.category === "food") clearPhotoFields();
        photo.image = image;
        state.pendingUtterance = null;
        state.speechRetry = false;
        state.photoJob = { image, category: state.category, date: state.recordDate, editingId: state.editingId, status: "selected" };
        showPhoto(image);
        // 阶段二：只对这一轮明确的新选图自动调用，不自动保存记录或推断餐次。
        if (state.category === "food") await analyzePhoto();
    }
    /**
     * 输入：显式文件选择事件。
     * 输出：Promise<void>。
     * 功能：读取成功才换图；连续选图、切页及清除期间的迟到解码不会提交请求。
     */
    async function selectPhotoFile(event) {
        const input = event.target, file = input.files?.[0];
        if (!file) return;
        cancelWork(false);
        const read = ++state.photoRead, serial = state.serial, id = state.category;
        try {
            const image = await photo.readFile(file);
            if (read !== state.photoRead || serial !== state.serial || id !== state.category || animation.scene !== "entry") return;
            if (image) await acceptPhoto(image);
        } catch (error) {
            if (read === state.photoRead && serial === state.serial && id === state.category && animation.scene === "entry") bubble(error, true);
        } finally {
            // 晚到的读取不能清掉用户刚选择的另一个文件。
            if (read === state.photoRead) input.value = "";
        }
    }
    /**
     * 输入：force（用户点击气泡/原面部按钮的显式重试）。
     * 输出：Promise<void>。
     * 功能：百炼视觉回填可编辑字段；保留手动值、取消保护和失败后点击小猫重试。
     */
    async function analyzePhoto(force = false) {
        if (!photo.image || state.phase !== "idle" || animation.scene !== "entry") return;
        if (!currentPhotoJob()) state.photoJob = { image: photo.image, category: state.category, date: state.recordDate, editingId: state.editingId, status: "selected" };
        const job = state.photoJob;
        if (job.status === "done" && !force) return;
        if (!bailian.configured) {
            job.status = "waiting-key";
            bubble("bailian-key", true, { photoRetry: true });
            return;
        }
        // 阶段一：固定照片与字段版本；表单一直可见且可编辑，只有小猫进入思考。
        const image = job.image, id = job.category, version = { ...state.versions }, text = JSON.stringify(rawForm());
        const serial = ++state.serial, controller = state.task = new AbortController();
        job.status = "running";
        setPhase("thinking");
        $("photo-preview")?.setAttribute("aria-busy", "true");
        bubble("photo");
        try {
            const draft = await AI.extract(bailian, id, text, image, controller.signal, { recordDate: job.date, current:rawForm(), operation:state.editingId ? "edit" : "new" });
            if (controller.signal.aborted || serial !== state.serial || state.photoJob !== job || !currentPhotoJob()) return;
            // 阶段二：自动分析不覆盖上传前已有值；更新途中手动改写或清空的字段同样优先。
            const next = id === "food" ? PhotoDraft.writable(draft.fields, rawForm(), state.versions, version, state.photoOwned)
                : { fields: draft.fields, protectedCount: 0 };
            fillForm(next.fields, version);
            if (id === "food") state.photoOwned = PhotoDraft.remember(next.fields, rawForm(), state.versions, state.photoOwned);
            state.source = "photo";
            state.estimated = draft.estimated;
            job.status = "done";
            job.lastForm = JSON.stringify(rawForm());
            setPhase("idle");
            // 阶段三：不显示黄色说明或反复告知估算；看不清的具体缺项只由小猫短句询问。
            if (id === "food") {
                const meaningful = ["foods", "portion", "calories", "protein", "carbs", "fat"].some(k => draft.fields[k] != null && draft.fields[k] !== "");
                if (!meaningful) {
                    job.status = "needs-info";
                    bubble("photo-food-unclear", true, { photoRetry: true });
                } else if (["calories", "protein", "carbs", "fat"].some(k => String(rawForm()[k] ?? "").trim() === "")) {
                    job.status = "needs-info";
                    bubble("photo-food-partial", true, { photoRetry: true, followup: "photo-retry" });
                } else bubble("photo-filled");
            } else showDraft(draft.warnings);
        } catch (error) {
            if (serial === state.serial && state.photoJob === job && currentPhotoJob() && error.name !== "AbortError") {
                job.status = "failed";
                setPhase("idle");
                bubble(error, true, { photoRetry: true, followup: "photo-retry" });
            }
        } finally {
            if (serial === state.serial) {
                state.task = null;
                $("photo-preview")?.setAttribute("aria-busy", "false");
                updateSpeechRetry();
            }
        }
    }
    /**
     * 输入：record。
     * 输出：无。
     * 功能：专注以已确认任务和时长开始，待办完成与计时完成分别保存。
     */
    function beginFocus(record) {
        if (["running", "paused", "resting"].includes(timer.state)) {
            toast("已有一段专注正在进行，先回到它吧。");
            navigate("focus");
            return;
        }
        state.focusRecord = { ...record, taskId: state.taskId };
        state.timerNotified = false;
        timer.start(record.data.durationMinutes);
        persistFocus();
        lastTimerText = "";
        navigate("focus");
        renderFocus();
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：只保存计时数据，不保存照片、API Key、音频。
     */
    function persistFocus() {
        if (state.focusRecord)
            Store.write("fluffy-active-focus-v1", { record: state.focusRecord, timer: timer.snapshot() });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：只更新变化的秒值，后台恢复按绝对时钟结算。
     */
    function renderFocus() {
        const s = timer.tick();
        if (animation.scene !== "focus")
            return;
        const text = formatTimer(s.remainingMs);
        if (text !== lastTimerText) {
            $("timer-time").textContent = text;
            lastTimerText = text;
        }
        $("focus-task").textContent = Display.text(state.focusRecord?.data.task || "留一点时间给自己");
        $("focus-state").textContent = Locale.t(({
            running: "安静地，专注当下", paused: "暂停了，不着急", resting: "休息一下，时间为你停留", completed: "这一段时间，认真度过了", stopped: "这一段专注已结束"
        })[s.state] || "准备开始");
        $("timer-caption").textContent = s.state === "resting" ? Locale.t(`休息 ${formatTimer(s.restMs + Math.max(0, Date.now() - s.restStarted))}`) : Locale.t("剩余专注时间");
        $("ring-progress").style.strokeDashoffset = String(885.929 * (1 - s.remainingMs / Math.max(1, s.totalMs)));
        const paused = s.state !== "running";
        $("pause-label").textContent = Locale.t(paused ? "继续" : "暂停");
        $("timer-pause").setAttribute("aria-label", paused ? "继续" : "暂停");
        setIcon($("timer-pause").firstElementChild, paused ? "play" : "pause");
        $("timer-rest").disabled = s.state === "resting";
        animation.focusRestTarget = paused ? 1 : 0;
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：定期检查真正的截止时间；不因动画暂停或浏览器掉帧漏算。
     */
    function checkFocus() {
        const s = timer.tick();
        if (animation.scene === "home" && ["running", "paused", "resting"].includes(s.state)) {
            const b = board?.cards.get("focus");
            if (b) {
                b.querySelector(".widget-value").textContent = formatTimer(s.remainingMs);
                b.querySelector(".widget-sub").textContent = Locale.t(s.state === "running" ? "正在专注" : s.state === "resting" ? "休息中" : "已暂停");
            }
        }
        if (["running", "paused", "resting"].includes(s.state) && Date.now() - lastFocusSave > 5000) {
            persistFocus();
            lastFocusSave = Date.now();
        }
        if (s.state === "completed" && state.focusRecord && !state.timerNotified)
            finishFocus();
        if (animation.scene === "focus")
            renderFocus();
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：实际结束后保存一次，再庆祝；不自动把待办勾选完成。
     */
    async function finishFocus() {
        if (state.timerNotified || !state.focusRecord)
            return;
        const s = timer.stop();
        state.timerNotified = true;
        state.record = { ...state.focusRecord, focus: {
                elapsedMs: s.elapsedMs, restMs: s.restMs, plannedMs: s.totalMs, reachedTarget: s.state === "completed", taskCompleted: false
            } };
        if (!await Store.save(state.record)) {
            state.timerNotified = false;
            toast("暂时无法保存专注记录，当前会话仍在。");
            return;
        }
        Store.write("fluffy-active-focus-v1", null);
        state.drafts.focus = {};
        delete state.draftDates.focus;
        state.editingId = null;
        animation.setRecord(state.record);
        animation.saved = true;
        navigate("celebrate");
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：把当前有效任务放入待办而不是假装已完成。
     */
    function saveTaskLater() {
        const data = checkedForm();
        if (!data)
            return;
        const task = {
            id: state.taskId || crypto.randomUUID?.() || String(Date.now()), data, createdAt: new Date().toISOString(), done: false
        };
        if (!Store.saveTask(task)) {
            toast("暂时无法保存待办。");
            return;
        }
        state.drafts.focus = {};
        navigate("tasks");
        toast("放进待办了，准备好再开始。");
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：用真实记录数更新顶栏及本地日期，不显示虚假分数。
     */
    function updateHomeStats() {
        const stats = Store.stats();
        $("today-count").textContent = `${stats.today} / 6`;
        $("days-count").textContent = stats.days;
        $("home-date").textContent = new Date().toLocaleDateString(Locale.language() === "en" ? "en-US" : "zh-CN", { month: "long", day: "numeric", weekday: "long" });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：提供恢复布局与查看记录，所有操作都在手机内部。
     */
    function homeMenu() {
        showSheet("今天的小空间", b => {
            sheetAction(b, Locale.t("语言切换"), "language", () => { closeSheet(false); languageSheet(); });
            sheetAction(b, "查看所有手记", "history", () => navigate("history"));
            sheetAction(b, "看看待办", "tasks", () => navigate("tasks"));
            sheetAction(b, "恢复首页排列", "reset", () => {
                board.reset();
                closeSheet();
                toast("卡片已放回原来的位置。");
            });
            sheetAction(b, "偏好与本机数据", "profile", () => navigate("profile"));
        });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：显示六类真实记录汇总，不以日记覆盖旧运动历史。
     */
    function renderHistory() {
        const root = $("inner-page");
        root.replaceChildren(el("p", "page-kicker", "LITTLE MOMENTS"), el("h1", "page-title", "我的手记"), el("p", "page-sub", "每一个认真生活的片刻，都在这里。"));
        const filter = el("div", "category-filter");
        for (const [id, name] of [["all", "全部"], ...Object.entries(Catalog.CATEGORIES).map(([id, c]) => [id, c.name])]) {
            const b = el("button", state.filter === id ? "active" : "", name);
            b.onclick = () => {
                state.filter = id;
                renderHistory();
            };
            filter.append(b);
        }
        root.append(filter);
        const list = Store.records().filter(r => state.filter === "all" || r.category === state.filter);
        Display.warm(list);
        if (!list.length) {
            const empty = el("div", "empty-state");
            empty.innerHTML = icon("history");
            empty.append(el("p", "", "还没有手记。\n从首页选一个入口，记下今天吧。"));
            root.append(empty);
            return;
        }
        let day = "";
        for (const r of list) {
            const d = Store.dateOf(r);
            if (d !== day) {
                root.append(el("h2", "history-day", d));
                day = d;
            }
            const c = Catalog.category(r.category), s = Display.summary(r), b = el("button", "history-item"), badge = el("span", "category-badge"), copy = el("span", "history-copy");
            badge.innerHTML = icon(c.icon);
            copy.append(el("strong", "", Locale.categoryName(r.category) + " · " + s.value), el("span", "", s.sub));
            b.append(badge, copy, el("small", "", Store.dateOf(r) !== Store.dayKey(new Date(r.createdAt)) ? Locale.t("补记", "Added later") : new Date(r.createdAt).toLocaleTimeString(Locale.language() === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })));
            b.onclick = () => recordDetails(r);
            root.append(b);
        }
    }
    /**
     * 输入：record。
     * 输出：无。
     * 功能：完整显示确认过的字段，营养估值和自评注明来源。
     */
    function recordDetails(record) {
        Display.warm([record]);
        showSheet(Locale.language() === "en" ? Locale.categoryName(record.category) + " entry" : Catalog.category(record.category).name + "手记", b => {
            const dl = el("dl");
            const dateRow = el("div", "detail-row");
            dateRow.append(el("dt", "", Locale.t("记录日期")), el("dd", "", Locale.dateLabel(Store.dateOf(record))));
            dl.append(dateRow);
            for (const f of Catalog.category(record.category).fields) {
                const v = Display.record(record).data[f.key];
                if (v == null || v === "")
                    continue;
                const row = el("div", "detail-row");
                row.append(el("dt", "", f.label), Display.bind(el("dd", ""), `${record.data[f.key]}${f.unit ? " " + Locale.t(f.unit) : ""}`));
                dl.append(row);
            }
            b.append(dl);
            sheetAction(b, "查看回顾", "history", () => { closeSheet(false); openReview(record); });
            if (record.focus) {
                const p = el("p", "detail-note", `实际专注 ${Math.round(record.focus.elapsedMs / 6000) / 10} 分钟；休息 ${Math.round(record.focus.restMs / 6000) / 10} 分钟。计时结束不等于任务完成。`);
                b.append(p);
            }
            if (record.category === "food")
                b.append(el("p", "detail-note", "营养是估算，不是精确测量；以补充的份量与实际标签为准。"));
            if (record.category === "face")
                b.append(el("p", "detail-note", "外观观察受光照与角度影响；不代表实际疲劳或医学诊断。"));
            sheetAction(b, "修改这条记录", "edit", () => {
                closeSheet(false);
                openEntry(record.category, record.data, record);
            });
            if (record.category === "focus")
                sheetAction(b, "再专注一次", "focus", () => {
                    closeSheet(false);
                    openEntry("focus", record.data);
                });
            sheetAction(b, "删除这条记录", "trash", () => ask("删除这条手记？", "只删除这一条，其他记录保留。", async () => {
                if (await Store.remove(record.id)) {
                    renderHistory();
                    board.update();
                    updateHomeStats();
                }
                else
                    toast("删除失败，记录仍保留。");
            }), true);
        });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：展示可继续执行的待办，完成状态由用户自己勾选。
     */
    function renderTasks() {
        const root = $("inner-page");
        root.replaceChildren(el("p", "page-kicker", "ONE THING AT A TIME"), el("h1", "page-title", "慢慢做，一件件来"), el("p", "page-sub", "不必一次做完所有事。"));
        const add = el("button", "task-add");
        add.innerHTML = icon("focus");
        add.append(el("span", "", "新增一件待办"));
        add.onclick = () => openEntry("focus");
        root.append(add);
        const tasks = Store.tasks();
        Display.warm(tasks);
        if (!tasks.length)
            root.append(el("div", "empty-state", "待办还是空的。\n先写下想专注的一件小事。"));
        for (const task of tasks) {
            const box = el("article", "task-card" + (task.done ? " done" : ""));
            box.append(el("h3", "", Display.text(task.data.task)), el("small", "", `预计 ${task.data.durationMinutes} 分钟`));
            const row = el("div", "task-actions"), start = el("button", "", "开始专注"), done = el("button", "", task.done ? "标记未完成" : "标记完成"), remove = el("button", "", "删除");
            start.onclick = () => {
                openEntry("focus", task.data);
                state.taskId = task.id;
            };
            done.onclick = () => {
                if (Store.saveTask({ ...task, done: !task.done }))
                    renderTasks();
            };
            remove.onclick = () => ask("删除这件待办？", Display.text(task.data.task), () => {
                Store.removeTask(task.id);
                renderTasks();
            });
            row.append(start, done, remove);
            box.append(row);
            root.append(box);
        }
    }
    /**
     * 输入：filename、value。
     * 输出：无。
     * 功能：导出用户主动请求的 JSON，绝不包含 Key、音频或照片。
     */
    function downloadJSON(filename, value) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })), a = el("a");
        a.href = url;
        a.download = filename;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：在手机内部管理偏好与本机记录，不加外部调试菜单。
     */
    function renderProfile() {
        const root = $("inner-page"), s = Store.stats();
        root.replaceChildren(el("p", "page-kicker", "A LITTLE PROGRESS, TOGETHER"), el("h1", "page-title", "这段日子，有你"), el("p", "page-sub", "认真照顾自己的每一天。"));
        const grid = el("div", "profile-stats");
        for (const [n, t] of [[s.days, "天有记录"], [s.count, "条手记"], [s.minutes, "分钟专注"]]) {
            const item = el("div", "profile-stat");
            item.append(el("strong", "", String(n)), el("span", "", t));
            grid.append(item);
        }
        root.append(grid);
        sheetAction(root, Locale.t("语言切换"), "language", () => languageSheet());
        for (const [text, name, action, danger] of [
            [animation.reducedMotion ? "轻柔动效 · 已开启" : "轻柔动效", "leaf", () => {
                    animation.reducedMotion = !animation.reducedMotion;
                    document.body.classList.toggle("reduce-motion", animation.reducedMotion);
                    Store.write("fluffy-reduced-motion", animation.reducedMotion);
                    renderProfile();
                }],
            ["恢复首页布局", "reset", () => {
                    board.reset();
                    toast("布局已恢复。");
                }],
            ["导出我的记录", "export", () => downloadJSON("Fluffy-Cat-My-Journal.json", { version: 1, records: Store.records(), tasks: Store.tasks() })],
            ["API 设置", "sparkle", () => openSettings()],
            ["清除本机手记", "trash", () => ask("清除本机手记？", "这会清除当前浏览器里的手记和待办，不影响 GitHub 源码。建议先导出。", () => {
                    const ok = Store.write(Store.KEY, []) && Store.write(Store.TASKS_KEY, []);
                    if (ok) {
                        localStorage.removeItem("fluffy-cat-minimal-records-v1");
                        renderProfile();
                        board.update();
                        updateHomeStats();
                    }
                    else
                        toast("清除未完成。");
                }), true]
        ]) {
            const b = el("button", "setting-row" + (danger ? " danger" : ""));
            b.innerHTML = icon(name);
            b.append(el("span", "", Locale.t(text)));
            const arrow = el("span", "arrow");
            arrow.innerHTML = icon("arrow");
            b.append(arrow);
            b.onclick = action;
            root.append(b);
        }
        root.append(el("p", "profile-foot", "记录保存在当前浏览器，不会自动同步到其他设备。照片只在本次页面内处理，不进入历史或 GitHub。"));
    }
    /**
     * 输入：scene。
     * 输出：无。
     * 功能：渲染底部导航对应的真实子页。
     */
    function renderPage(scene) {
        if (scene === "history")
            renderHistory();
        else if (scene === "tasks")
            renderTasks();
        else if (scene === "profile")
            renderProfile();
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：中央对话入口选择类别并真实整理一段文字，或进入该类长按录音。
     */
    function chatSheet() {
        let selected = "sport";
        showSheet("今天，想讲些什么？", b => {
            const topics = el("div", "chat-topics");
            Object.entries(Catalog.CATEGORIES).forEach(([id, c]) => {
                const button = el("button", id === selected ? "active" : "");
                button.innerHTML = icon(c.icon);
                button.append(el("span", "", c.name));
                button.onclick = () => {
                    selected = id;
                    topics.querySelectorAll("button").forEach(n => n.classList.toggle("active", n === button));
                };
                topics.append(button);
            });
            b.append(topics);
            const input = el("textarea", "chat-input");
            input.placeholder = "例如：今天跑了 3 公里，20 分钟，感觉轻松。";
            input.maxLength = 1000;
            input.setAttribute("aria-label", "想对小猫说的话");
            b.append(input);
            const row = el("div", "sheet-buttons"), voice = el("button", "", "说给小猫听"), send = el("button", "solid", "交给小猫整理");
            voice.onclick = () => {
                closeSheet(false);
                openEntry(selected);
                bubble("长按底部按钮，我在听。");
            };
            send.onclick = async () => {
                const text = input.value.trim();
                if (!text) {
                    input.focus();
                    return;
                }
                if (!api.configured) {
                    closeSheet(false);
                    openSettings();
                    toast("deepseek-key");
                    return;
                }
                closeSheet(false);
                openEntry(selected);
                const serial = ++state.serial, pending = { category: selected, date: state.recordDate, editingId: state.editingId, versions: { ...state.versions }, text, interim: false, source: "text-ai" };
                state.pendingUtterance = pending;
                setPhase("thinking");
                bubble("thinking");
                $("speech-transcript").textContent = text;
                await organizeWords(pending, serial);
            };
            row.append(voice, send);
            b.append(row);
        });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：保留外部极简下拉框，不回显已有 Key。
     */
    function openSettings() {
        if (review?.active)
            review.cancel(false);
        if (!$("api-popover").hidden) {
            closeSettings();
            return;
        }
        cancelWork(false);
        bailianSettings?.close(false);
        gesture?.disarm();
        $("api-key").value = "";
        $("api-feedback").textContent = "";
        $("api-popover").hidden = false;
        $("open-settings").setAttribute("aria-expanded", "true");
        $("api-key").focus({ preventScroll: true });
    }
    /**
     * 输入：restoreFocus。
     * 输出：无。
     * 功能：关闭设置并取消未完成的验证，不破坏此前有效的 Key。
     */
    function closeSettings(restoreFocus = true) {
        state.keyTask?.abort();
        state.keyTask = null;
        state.keySerial++;
        $("api-popover").hidden = true;
        $("open-settings").setAttribute("aria-expanded", "false");
        $("api-key").value = "";
        $("save-api").disabled = false;
        $("save-api").textContent = "启用";
        if (restoreFocus)
            $("open-settings").focus({ preventScroll: true });
    }
    /**
     * 输入：event。
     * 输出：Promise<void>。
     * 功能：先验证候选 Key，再原子替换私有实例；失败保留旧 Key。
     */
    async function saveKey(event) {
        event.preventDefault();
        state.keyTask?.abort();
        const serial = ++state.keySerial, controller = state.keyTask = new AbortController(), candidate = new DeepSeekClient({ config: CONFIG, model: CONFIG.model }), key = $("api-key").value;
        $("api-feedback").textContent = "";
        try {
            candidate.setKey(key);
            $("save-api").disabled = true;
            $("save-api").textContent = "验证中…";
            const models = await candidate.check(controller.signal);
            if (serial !== state.keySerial || controller.signal.aborted)
                return;
            if (!models.includes(candidate.model))
                throw new Policy.AIError("ai-model", "当前 Key 暂时不能访问该模型。");
            api.setKey(key);
            Display.retry();
            Display.warm(Store.records().slice(0, 30));
            $("key-indicator").classList.add("enabled");
            state.keyTask = null;
            closeSettings();
        }
        catch (e) {
            if (serial === state.keySerial && e.name !== "AbortError")
                toast(e);
        }
        finally {
            candidate.clear();
            if (serial === state.keySerial) {
                state.keyTask = null;
                $("save-api").disabled = false;
                $("save-api").textContent = "启用";
            }
        }
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：清除 Key 和当前请求，不删除用户记录。
     */
    function clearKey() {
        if (review?.active)
            review.cancel(false);
        state.keyTask?.abort();
        state.keySerial++;
        cancelWork(false);
        api.clear();
        $("key-indicator").classList.remove("enabled");
        $("api-key").value = "";
        $("api-feedback").textContent = "";
        $("save-api").disabled = false;
        $("save-api").textContent = "启用";
    }
    /**
     * 输入：animation。
     * 输出：true。
     * 功能：统一管理真实界面的可见性；记录卡沿既有路径连续展开。
     */
    function synchronizeUI(a) {
        // 阶段一：页面级可见性，首页、表单和倒计时互斥。
        const scene = a.scene, home = scene === "home", entry = scene === "entry", record = scene === "record", hero = scene === "celebrate", inside = ["history", "tasks", "profile"].includes(scene), focus = scene === "focus", bridge = record && a.bridge ? M.range(a.time, 0, 1.55) : 1;
        $("screen").dataset.scene = scene;
        if (home && state.homeDay !== Store.dayKey()) {
            state.homeDay = Store.dayKey();
            board?.update();
            updateHomeStats();
        }
        $("home-scene").hidden = !home;
        $("home-cat").hidden = !home;
        $("bottom-nav").hidden = !(home || inside);
        $("inner-page").hidden = !inside;
        $("focus-page").hidden = !focus;
        const quiet = ["idle", "authorizing", "thinking"].includes(state.phase);
        $("entry-panel").hidden = !entry || !quiet;
        $("voice-panel").hidden = !entry || quiet;
        $("entry-heading").hidden = !entry && !(record && a.bridge && bridge < .8);
        $("entry-heading").style.opacity = entry ? 1 : 1 - M.range(bridge, 0, .6);
        $("entry-bubble").hidden = !entry && !(record && a.bridge && bridge < .6);
        $("entry-bubble").style.opacity = entry ? 1 : 1 - M.range(bridge, 0, .55);
        // 阶段二：保留原来的表单到记录卡几何过渡，不替换整屏截图。
        $("green-bg").style.opacity = hero ? 1 : 0;
        $("record-card").hidden = !entry && !record;
        const p = entry ? 0 : bridge;
        $("record-card").style.top = `${M.mix(368, 414, p)}px`;
        $("record-card").style.left = `${M.mix(23, 20, p)}px`;
        $("record-card").style.width = `${M.mix(347, 353, p)}px`;
        $("record-card").style.height = `${M.mix(344, 304, p)}px`;
        $("record-card").style.borderRadius = `${M.mix(29, 45, p)}px`;
        $("record-heading").hidden = !record;
        $("record-heading").style.opacity = record ? M.range(a.time, .45, 1.5) : 0;
        $("hero-quote").hidden = !hero;
        $("hero-subtitle").hidden = !hero;
        $("back").hidden = home || inside || hero || scene === "review";
        if (review)
            review.root.hidden = scene !== "review";
        $("primary").hidden = !(record || hero);
        $("confirm-entry").hidden = !entry;
        $("record-a11y").hidden = !record;
        $("hold-help").hidden = !entry;
        // 阶段三：书写页用独立两秒门闩；视觉不增加倒计时说明，完整动画可按用户意愿跳过。
        $("primary").classList.toggle("white", hero);
        if (continueGate.scene !== scene) continueGate.enter(scene);
        // 门闩的可访问性状态独立于动画帧更新；暂停动画也会在两秒后开放。
        if (state.continueEpoch !== continueGate.epoch) {
            state.continueEpoch = continueGate.epoch;
            clearTimeout(state.continueTimer);
            if (record) {
                const epoch = continueGate.epoch;
                state.continueTimer = setTimeout(() => {
                    if (animation.scene === "record" && continueGate.epoch === epoch) synchronizeUI(animation);
                }, Math.max(0, continueGate.delayMs - (performance.now() - continueGate.enteredAt)) + 8);
            }
        }
        $("primary").disabled = !a.ready || (hero ? a.time < 4.93 : false);
        $("primary").setAttribute("aria-disabled", String(!a.ready || (record ? !continueGate.ready() : hero && a.time < 4.93)));
        $("primary-label").textContent = Locale.t(hero ? "完成" : "继续");
        synchronizeEntryAction(a);
        entryMenu?.sync();
        $("hero-quote").style.opacity = M.range(a.time, 1.5, 2.5);
        $("hero-subtitle").style.opacity = M.range(a.time, .8, 1.5);
        $("pet").hidden = !(record || hero);
        $("pet").style.top = hero ? "371px" : "193px";
        $("pet").style.height = hero ? "248px" : "223px";
        const phase = record ? (a.time < a.writeEnd ? 2 : a.time < a.writeEnd + 3.75 ? 3 : 4) : 0;
        if (record) {
            const title = phase === 2 ? `Log Your ${Catalog.category(state.record?.category || state.category).en}` : phase === 3 ? "Almost done!" : "All set! ♡";
            $("record-title").textContent = title;
            $("record-subtitle").textContent = phase === 2 ? "Write it down, step by step!" : phase === 3 ? "Putting it away…" : "Rest well, you did it.";
        }
        if (hero) {
            const isFocus = state.record?.category === "focus";
            $("hero-subtitle").textContent = isFocus ? "You made time for what matters." : "Another little moment, saved.";
            $("hero-quote").innerHTML = isFocus ? Locale.t(`专注了 ${Math.round((state.record.focus?.elapsedMs || 0) / 6000) / 10} 分钟。<br>每一点认真，都算数。`, `${Math.round((state.record.focus?.elapsedMs || 0) / 6000) / 10} minutes focused.<br>Every little moment counts.`) : "Small steps make<br>a stronger you.";
        }
        // 阶段四：同步可访问性文字与导航，不改动用户输入。
        document.querySelectorAll(".nav-item[data-nav]").forEach(b => {
            b.classList.toggle("active", b.dataset.nav === scene);
            if (b.dataset.nav === scene)
                b.setAttribute("aria-current", "page");
            else
                b.removeAttribute("aria-current");
        });
        if (record && a.lastA11yRecord !== a.record) {
            $("record-a11y").textContent = a.rows.map(r => `${r.label}: ${r.value}`).join("。");
            a.lastA11yRecord = a.record;
        }
        return true;
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：波形读取真音量；思考使用不同的等待标记，不冒充输入。
     */
    function renderExtras() {
        review?.tick();
        if ($("voice-panel").hidden)
            return;
        const ctx = $("voice-wave").getContext("2d");
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 320, 105);
        if (state.phase === "thinking") {
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = `rgba(86,156,155,${.3 + .5 * (Math.sin(animation.idle * 3 - i * .8) + 1) / 2})`;
                ctx.beginPath();
                ctx.arc(143 + i * 17, 52, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }
        const colors = ["#8bcbb7", "#84b7d6", "#a5c9bc", "#d8c48f"];
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        wave.forEach((v, i) => {
            const h = 2 + v * 78, x = 13 + i * 4.1;
            ctx.strokeStyle = colors[Math.floor(i / 7) % 4];
            ctx.globalAlpha = .34 + .66 * Math.min(1, i / 13);
            ctx.beginPath();
            ctx.moveTo(x, 52 - h / 2);
            ctx.lineTo(x, 52 + h / 2);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：按可用宽度、安全区和键盘调整布局；短屏保留文字大小并允许滚动。
     */
    function resizePhone() {
        window.NavaJournal.layout?.resize();
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：图层就绪后开放首页；恢复计时器而不是悄悄重置。
     */
    function onReady() {
        resizePhone();
        const saved = Store.read("fluffy-active-focus-v1", null);
        if (saved?.record && Catalog.validate("focus", saved.record.data || {}).ok && timer.restore({...saved.timer,state:saved.timer.state==='running'?'paused':saved.timer.state})) {
            state.focusRecord = saved.record;
            state.timerNotified = false;
            navigate("focus");
            checkFocus();
        }
        else {
            openCategory(window.NavaJournal.initial.category);
        }
        if(state.focusRecord && window.NavaJournal.initial.category!=='focus')openCategory(window.NavaJournal.initial.category);
        window.NavaJournal.notify=toast;
        window.NavaJournal.interrupt=()=>{timer.pause();cancelWork(false);photo.stopCamera();persistFocus();renderFocus();};
        window.NavaJournal.call('ready').catch(()=>{});
        $("confirm-entry").disabled = false;
    }
    /**
     * 输入：node、action。
     * 输出：无。
     * 功能：为顶栏/导航补充长按快捷操作，不触发双击或改变原点击。
     */
    function bindContextHold(node, action) {
        let timeout = null, long = false;
        node.addEventListener("pointerdown", e => {
            if (e.button !== 0)
                return;
            long = false;
            timeout = setTimeout(() => {
                long = true;
                action();
            }, 500);
        });
        node.addEventListener("pointerup", () => clearTimeout(timeout));
        node.addEventListener("pointercancel", () => clearTimeout(timeout));
        node.addEventListener("pointerleave", () => clearTimeout(timeout));
        node.addEventListener("click", e => {
            if (long) {
                e.preventDefault();
                e.stopImmediatePropagation();
                long = false;
            }
        }, true);
        node.addEventListener("contextmenu", e => {
            e.preventDefault();
            action();
        });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：绑定真实按钮、媒体生命周期、键盘可访问性和计时操作。
     */
    function bind() {
        // 阶段一：首页、短按和长按各自绑定，避免一手势触发两条流程。
        document.querySelectorAll("[data-icon]").forEach(n => setIcon(n, n.dataset.icon));
        bailianSettings = new BailianSettings(bailian, CONFIG, { onError: error => toast(error),
            onOpen: () => { review?.cancel(false); cancelWork(false); gesture?.disarm(); closeSettings(false); }, onClear: () => { review?.cancel(false); cancelWork(false); },
            onEnabled: () => {
                if (currentPhotoJob() && state.photoJob.status === "waiting-key" && state.category === "food") analyzePhoto();
            }
        });
        Display.configure(() => api, () => {
            board?.update();
            if (["history", "tasks"].includes(animation.scene))
                renderPage(animation.scene);
            if (review?.active) {
                const at = review.chartStart;
                review.render();
                review.chartStart = at;
            }
        });
        // 新模块只在回顾页挂载；记录页的表单、按钮和语音提取流程不改变。
        review = new __fluffyModules["review.js"].ReviewPage({
            api, bailian, animation, microphone, navigate, showSheet, closeSheet, toast, onLanguage: changeLanguage,
            openSettings, openBailian: () => bailianSettings.open(),
            newEntry, editEntries: chooseEntry, offerIntent, Display
        });
        entryMenu = new EntryMenu($("screen"), {
            scene: () => animation.scene, date: () => state.recordDate, language: changeLanguage, changeDate: changeRecordDate,
            beforeOpen: () => {
                timeRange?.close(false);
                gesture?.disarm();
                if (state.phase !== "idle")
                    cancelWork(false);
            },
            recap: () => { const id = state.category, date = state.recordDate; navigate("review"); review.lang = Locale.language(); review.open(id, date); }
        });
        board = new HomeBoard($("home-board"), {
            open: openCategory, warn: toast, attend: id => {
                animation.homeLookTarget = board.order.indexOf(id) < 3 ? -.2 : .2;
            }, release: () => {
                animation.homeLookTarget = 0;
            }
        });
        gesture = new HoldGesture($("confirm-entry"), {
            short: confirmManual, long: beginSpeech, release: releaseSpeech, cancel: () => {
                if (["requesting", "listening"].includes(state.phase))
                    cancelWork();
            }
        }, CONFIG.longPressMs || 420);
        // 原生自动填充或辅助技术有时只触发 change；与 input 共用完成度更新。
        $("entry-form").addEventListener("change", preserveDraft);
        $("entry-form").addEventListener("submit", e => {
            e.preventDefault();
            confirmManual();
        });
        $("cancel-voice").onclick = () => cancelWork();
        $("primary").addEventListener("pointerdown", () => continueGate.down("pointer"));
        $("primary").addEventListener("pointercancel", () => continueGate.cancelPress());
        $("primary").addEventListener("blur", () => continueGate.cancelPress());
        $("primary").addEventListener("keydown", e => { if ([" ","Enter"].includes(e.key)) { if(e.repeat) e.preventDefault(); else continueGate.down("key"); } });
        $("primary").addEventListener("keyup", e => { if (e.key === "Escape") continueGate.cancelPress(); });
        $("primary").onclick = primaryAction;
        $("back").onclick = () => {
            if (animation.scene === "record")
                editRecord();
            else if (animation.scene === "focus") {
                navigate("home");
                homeBubble("计时仍在继续，随时回来。");
            }
            else
                navigate("home");
        };
        $("pet").onclick = () => {
            animation.petAt = animation.idle;
        };
        $("home-cat").onclick = () => {
            animation.petAt = animation.idle;
            homeBubble(["嗯？我在呢", "慢慢来就好\n我会陪着你", "摸摸收到了\n谢谢你呀喵"][(Math.floor(animation.idle / 3)) % 3]);
        };
        bindContextHold($("home-cat"), chatSheet);
        $("home-menu").onclick = homeMenu;
        bindContextHold($("home-menu"), homeMenu);
        $("today-stat").onclick = () => navigate("history");
        bindContextHold($("today-stat"), () => {
            updateHomeStats();
            homeBubble(`今天记了${Store.stats().today}项\n都好好收着呢`);
        });
        $("days-stat").onclick = () => navigate("profile");
        bindContextHold($("days-stat"), () => navigate("profile"));
        document.querySelectorAll("[data-nav]").forEach(b => {
            b.addEventListener("click", () => b.dataset.nav === "chat" ? chatSheet() : navigate(b.dataset.nav));
            bindContextHold(b, () => {
                if (b.dataset.nav === "chat")
                    chatSheet();
                else if (b.dataset.nav === "home")
                    homeMenu();
                else
                    navigate(b.dataset.nav);
            });
        });
        // 阶段二：面板、设置和键盘焦点遵守同一打开/关闭协议。
        $("sheet-close").onclick = () => closeSheet();
        $("sheet-layer").addEventListener("pointerdown", e => {
            if (e.target === $("sheet-layer"))
                closeSheet();
        });
        $("open-settings").onclick = openSettings;
        $("api-form").onsubmit = saveKey;
        $("forget-key").onclick = clearKey;
        document.addEventListener("pointerdown", e => {
            if (!$("api-popover").hidden && !$("api-popover").contains(e.target) && !$("open-settings").contains(e.target))
                closeSettings(false);
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                if (!$("api-popover").hidden)
                    closeSettings();
                else if (!$("sheet-layer").hidden)
                    closeSheet();
                else if (state.phase !== "idle")
                    cancelWork();
                board.cancel();
            }
            if (e.key === "Tab" && !$("sheet-layer").hidden && $("api-popover").hidden) {
                const nodes = [...$("sheet").querySelectorAll("button:not(:disabled),input,textarea,select,[tabindex='0']")].filter(n => !n.closest("[hidden]")), first = nodes[0], last = nodes.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                }
                else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        });
        // 阶段三：媒体与计时操作必须由真实用户手势触发。
        $("photo-library").onchange = selectPhotoFile;
        $("timer-pause").onclick = () => {
            timer.state === "running" ? timer.pause() : timer.resume();
            persistFocus();
            renderFocus();
        };
        $("timer-rest").onclick = () => {
            if (timer.state === "paused") {
                timer.resume();
            }
            timer.pause(true);
            persistFocus();
            renderFocus();
        };
        $("timer-reset").onclick = () => ask("重新开始这一段？", "本轮计时将从原定时长重新开始。", () => {
            timer.reset();
            state.timerNotified = false;
            persistFocus();
            renderFocus();
        });
        $("timer-stop").onclick = () => ask("结束这一段专注？", `已认真专注 ${Math.round(timer.tick().elapsedMs / 6000) / 10} 分钟，停止后会保留实际时间。`, finishFocus);
        const awake=el('button','journal-awake',Locale.t('屏幕常亮','Keep awake'));
        awake.type='button';awake.setAttribute('aria-pressed','false');
        awake.onclick=async()=>{if(awake.disabled)return;awake.disabled=true;try{const enabled=await window.NavaJournal.call('wake',{enabled:awake.getAttribute('aria-pressed')!=='true'});awake.setAttribute('aria-pressed',String(Boolean(enabled)));if(!enabled)toast(Locale.t('常亮已关闭或当前设备不支持。','Keep-awake is off or unavailable.'));}catch{toast(Locale.t('无法开启屏幕常亮。','Keep-awake is unavailable.'));}finally{awake.disabled=false;}};
        $('focus-page').append(awake);
        // 阶段四：离开页面释放音视频，保存专注截止时间，不保存密钥。
        window.addEventListener("resize", resizePhone);
        window.addEventListener("pagehide", () => {
            cancelWork(false);
            photo.stopCamera();
            persistFocus();
            closeSettings(false);
            api.clear();
            $("key-indicator").classList.remove("enabled");
            bailianSettings.close(false);
            bailianSettings.clear();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                timer.pause();
                // 已松手的听写收尾/文字请求可有限完成；只取消仍在采集的输入，不留假思考气泡。
                if (["listening","requesting"].includes(state.phase)) cancelWork(true);
                else if (state.phase === "thinking") state.workflowTrace?.mark("background");
                photo.stopCamera();
                persistFocus();
            }
            else {
                checkFocus();
                updateHomeStats();
            }
        });
        setInterval(checkFocus, 200);
    }
    $("entry-bubble").addEventListener("click", retryWords);
    $("entry-bubble").addEventListener("keydown", e => {
        if (["Enter", " "].includes(e.key) && $("entry-bubble").dataset.retry === "true") { e.preventDefault(); retryWords(); }
    });
    renderForm({});
    resizePhone();
    bind();
    homeBubble("home");
    animation.reducedMotion = Boolean(Store.read("fluffy-reduced-motion", matchMedia("(prefers-reduced-motion: reduce)").matches));
    document.body.classList.toggle("reduce-motion", animation.reducedMotion);
    animation.initialize().catch(() => {
        $("loading").textContent = "小猫图层没有加载完成，请刷新重试。";
    });
    if (new URLSearchParams(location.search).has("debug") || window.FLUFFY_TEST) {
        window.FluffyDebug = {
            animation, state, review, continueGate, Trace, retryWords, organizeWords, toast, openCategory, newEntry, chooseEntry, offerIntent, refreshEntryCompletion, synchronizeEntryAction, openReview, entryMenu, changeRecordDate, changeLanguage, board, timer, photo, speech, rawAudio, bailianSettings, microphone, gesture, get timeRange() { return timeRange; }, get formLayout() { return formLayout; }, languageSheet, prepareIntentDraft, estimateTime, acceptPhoto, selectPhotoFile, analyzePhoto, removePhoto, bubble, homeBubble, showPhoto, openEntry, navigate, fillForm, rawForm, confirmManual, primaryAction, beginSpeech, releaseSpeech, cancelWork, finishFocus, checkFocus, showSheet, closeSheet, renderForm, saveTaskLater, apiTest: window.FLUFFY_TEST ? api : undefined, bailianTest: window.FLUFFY_TEST ? bailian : undefined
        };
    }
    return {};
})();
