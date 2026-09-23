/* 全应用UI词典与旧视图兼容桥。只替换界面标签；用户输入值永远不在DOM遍历里改写。 */
__fluffyModules["locale-ui.js"] = (() => {
    "use strict";
    const L = __fluffyModules["entry-i18n.js"];
    const BASE = { t: L.t, message: L.message, bubble: L.bubble };
    const HAN = /[\u3400-\u9fff]/;
    const TEXT = {
        "要记下来？点气泡旁的记事按钮": "Want to save this? Tap the note button.",
        "Fluffy Cat 六类生活记录": "Fluffy Cat · six-part journal", "Fluffy Cat · 留一点时间给自己": "Fluffy Cat · A little time for yourself",
        "暂停了，不着急": "Paused. Take your time.", "休息一下，时间为你停留": "Rest a little. The timer can wait.", "这一段时间，认真度过了": "You made this moment count.", "这一段专注已结束": "This session is complete.", "准备开始": "Ready to begin", "正在专注": "Focusing", "留一点时间给自己": "A little time for yourself",
        "记录想法": "Save this thought", "关闭菜单": "Close menu", "新增记录模式": "New entry", "修改记录模式": "Editing an entry", "今天，想讲些什么？": "What would you like to share?", "写几句，或者长按说给小猫听。": "Type a little, or hold to tell your cat.", "让小猫整理": "Let the cat organize it", "去说给小猫听": "Speak to your cat", "记录不会自动提交，你可以先修改。": "Review and edit your draft before saving.",
        "说给小猫听": "Speak to your cat", "交给小猫整理": "Organize my notes", "已记录": "Logged", "情绪": "Mood", "饮食": "Meals", "运动": "Workout", "睡眠": "Sleep", "面部": "Check-in", "专注": "Focus", "首页": "Home", "手记": "Journal", "待办": "Tasks", "我的": "Profile",
        "今日": "Today", "天陪伴": "Days together", "未记录": "Not logged", "尚未记录": "Not logged", "尚未完成": "Not completed", "中文": "Chinese", "中英文": "Language", "阿里云百炼": "Bailian", "阿里云百炼设置": "Bailian settings", "启用": "Enable", "清除": "Clear", "检查中…": "Checking…", "已启用": "Enabled", "已清除": "Cleared",
        "今天的小空间": "Your little space", "查看所有手记": "View all entries", "看看待办": "Your tasks", "恢复首页排列": "Reset layout", "偏好与本机数据": "Preferences", "卡片已放回原来的位置。": "Your cards are back in place.",
        "还没有手记。\n从首页选一个入口，记下今天吧。": "No entries yet.\nChoose a category to begin.", "我的手记": "My journal", "每一个认真生活的片刻，都在这里。": "Your little moments, kept together.",
        "慢慢做，一件件来": "One thing at a time", "不必一次做完所有事。": "You don't need to do it all at once.", "新增一件待办": "Start a new task", "待办还是空的。\n先写下想专注的一件小事。": "No tasks yet.\nStart with one little thing.", "标记未完成": "Mark unfinished", "标记完成": "Mark complete", "删除": "Delete", "删除这件待办？": "Delete this task?",
        "这段日子，有你": "A little time for you", "认真照顾自己的每一天。": "A little care, every day.", "天有记录": "days logged", "条手记": "entries", "分钟专注": "minutes focused", "轻柔动效 · 已开启": "Gentle motion · on", "轻柔动效": "Gentle motion", "恢复首页布局": "Reset home layout", "布局已恢复。": "Layout restored.", "导出我的记录": "Export my entries", "API 设置": "AI settings", "清除本机手记": "Clear local entries", "清除本机手记？": "Clear local entries?", "这会清除当前浏览器里的手记和待办，不影响 GitHub 源码。建议先导出。": "This removes entries and tasks in this browser, not the website code. Export a backup first.", "清除未完成。": "Couldn't clear the entries.", "记录保存在当前浏览器，不会自动同步到其他设备。照片只在本次页面内处理，不进入历史或 GitHub。": "Entries stay in this browser. They do not sync across devices. Photos are not saved to your journal or repository.",
        "删除这条手记？": "Delete this entry?", "只删除这一条，其他记录保留。": "Only this entry will be removed.", "删除失败，记录仍保留。": "Couldn't delete it. Your entry is still saved.", "营养是估算，不是精确测量；以补充的份量与实际标签为准。": "Nutrition values are estimates based on portions and available food details.", "外观观察受光照与角度影响；不代表实际疲劳或医学诊断。": "Lighting and angle affect appearance. These observations do not establish fatigue or a diagnosis.", "确定": "Confirm",
        "聊点什么呢？": "What's on your mind?", "和小猫聊聊": "Talk with your cat", "想和小猫说什么": "What would you like to say?", "说给小猫": "Tell your cat", "文字聊聊": "Text chat", "语音记录": "Voice entry", "今天的记录": "Today's entries", "陪伴天数": "Days together", "首页菜单": "Home menu", "记录与设置": "Entries and settings", "底部导航": "Navigation", "和小猫说说话": "Talk with your cat", "摸摸小猫；长按打开对话": "Pet the cat; hold to talk", "摸摸小猫": "Pet the cat", "八个可放位置中的六个记录入口，右下角留给小猫气泡": "Six categories in eight movable positions; the bottom-right space is reserved for the cat", "系统状态栏外观": "Status bar", "语音输入": "Voice input", "实时麦克风音量": "Live microphone level", "小猫的连续动作与记录书写": "Animated cat and handwriting", "准备小猫的画笔…": "Getting the cat ready…", "小猫图层没有加载完成，请刷新重试。": "The cat could not load. Please refresh.", "从相册选择照片": "Choose a photo", "AI服务设置": "AI settings", "DeepSeek Chat 设置": "DeepSeek Chat settings",
        "安静地，专注当下": "A quiet moment of focus", "剩余专注时间": "Time remaining", "不着急，我在旁边陪你。": "Take your time. I'm here with you.", "重置": "Reset", "暂停": "Pause", "休息": "Break", "停止": "Stop", "继续专注": "Resume focus", "继续计时": "Resume", "休息中": "On a break", "已暂停": "Paused", "专注中": "Focusing", "这一段结束啦": "This session is complete", "重置倒计时": "Reset timer", "暂停休息": "Take a break", "完全停止": "End session", "专注倒计时": "Focus timer", "重新开始这一段？": "Restart this session?", "本轮计时将从原定时长重新开始。": "This restarts the timer from the original duration.", "结束这一段专注？": "End this focus session?", "这一段，认真过了。": "You gave this moment your attention.", "这一段结束了": "Your session is complete", "实际专注": "Time focused", "任务完成了吗？": "Did you finish the task?", "已完成任务": "Task completed", "还没完成": "Not finished yet", "记下这一段": "Save this session", "专注结束": "Session complete", "继续休息": "Continue break",
        "新增记录": "New entry", "修改记录": "Edit entry", "当日记录": "Day entries", "记录方式": "Save as", "新增一条": "New entry", "修改原条": "Edit original", "保持原样": "Keep as is", "取消操作": "Cancel", "选择记录": "Choose an entry", "返回回顾": "Back to review", "保存修改": "Save changes", "已保留原记录": "Original entry kept", "这次是新的一次，还是修改原来的记录？": "Is this a new moment or a correction?", "没有可修改的记录": "No entries to edit", "先记下这一刻吧": "Start with this moment", "正在准备英文…": "Preparing English…", "英文翻译暂不可用": "English translation unavailable", "新增记录不会覆盖原来的内容。": "A new entry keeps your earlier entries.", "将修改所选记录，其他条目保持不变。": "Only the selected entry will be updated.", "本次修改与其他窗口冲突，请重新打开记录。": "This entry changed in another tab. Reopen it before saving.", "要修改哪一条？": "Which entry would you like to edit?", "再记一笔": "Add another entry", "操作已取消": "Canceled",
        "当前浏览器不能保存布局，本次调整仍然有效。": "Layout cannot be saved in this browser; it still works for this visit.", "布局未能保存到浏览器。": "Couldn't save the layout.", "这里留给小猫说话，换个位置吧。": "This space is for the cat. Try another spot.",
        "请填写完整的 DeepSeek API Key。": "Enter a complete DeepSeek API Key.", "请填写完整的百炼 API Key。": "Enter a complete Bailian API Key.", "先在右上角填写 DeepSeek API Key，再长按说话。": "Enable a DeepSeek key at the top right first.", "DeepSeek Key 无效，请在右上角重新填写。": "Invalid DeepSeek key. Enter it again.", "DeepSeek 账户余额不足，请先充值。": "Your DeepSeek balance is insufficient.", "此 Key 没有访问权限。": "This key does not have access.", "无法连接 DeepSeek，请检查网络后重试。": "Can't reach DeepSeek. Check your connection.", "请求有点频繁，请稍后再试。": "Too many requests. Please try again shortly.", "整理超时了。请检查网络，或者先自己填写。": "The request timed out. Try again or type your entry.", "先在右上角启用 AI，再和小猫聊吧。": "Enable an AI key at the top right to chat.", "这次没有听清，再说一次吧。": "I couldn't hear that. Please try again.", "先说点什么，或选一张照片吧。": "Say something or choose a photo first.", "图片分析请先在右上角启用阿里云百炼。": "Enable Bailian at the top right to analyze a photo.", "声音理解需要百炼音频模型。": "Audio understanding needs a Bailian audio model.", "音频格式或大小不合适，请重新录音。": "The audio format or size is not supported. Try recording again.", "小猫的话还没说完整，请再试一次。": "The reply was incomplete. Please try again.", "回复格式没有整理好，请再试一次。": "The reply format was invalid. Please try again.", "没有收到完整回复，请再试一次。": "No complete reply was received. Please try again.", "没有收到小猫的回复，请再试一次。": "No reply was received. Please try again.", "English-only reply required": "The reply language was incorrect. Please try again.", "等待授权": "Awaiting permission", "准备好了，长按开始说话。": "All ready. Hold to speak.", "已取消": "Canceled"
    };
    const dynamic = [
        [/^休息 ([\d:]+)$/, m => `Break ${m[1]}`],
        [/^第(\d+)行第(\d+)列$/, m => `Row ${m[1]}, column ${m[2]}`],
        [/^(情绪|饮食|运动|睡眠|面部|专注)手记$/, m => `${TEXT[m[1]]} entry`],
        [/^预计 ([\d.]+) 分钟$/, m => `Planned: ${m[1]} min`],
        [/^实际专注 ([\d.]+) 分钟；休息 ([\d.]+) 分钟。计时结束不等于任务完成。$/, m => `${m[1]} min focused; ${m[2]} min on breaks. Finishing a timer does not mark a task complete.`],
        [/^已认真专注 ([\d.]+) 分钟，停止后会保留实际时间。$/, m => `You focused for ${m[1]} minutes. Stopping keeps the actual duration.`],
        [/^(.+)已拿起，拖到想放的位置。$/, m => `${TEXT[m[1]] || 'Card'} picked up. Drag to a new position.`],
        [/^(.+)已放在第(\d)行第(\d)列。$/, m => `${TEXT[m[1]] || 'Card'} moved to row ${m[2]}, column ${m[3]}.`],
        [/^系统时间 (.+)$/, m => `System time ${m[1]}`],
        [/^连接失败（HTTP (\d+)），你的输入仍然保留。$/, m => `Connection failed (HTTP ${m[1]}). Your input is still here.`]
    ];
    /**
     * 输入：界面原文和可选英文。
     * 输出：当前语言标签。
     * 功能：旧模块共用同一词典；中文模式不改动。
     */
    function t(zh, en) {
        if (L.language() !== "en")
            return zh;
        if (en !== undefined)
            return en;
        if (Object.hasOwn(TEXT, zh))
            return TEXT[zh];
        if (typeof zh === "string" && zh !== zh.trim())
            return zh.replace(zh.trim(), t(zh.trim()));
        for (const [pattern, format] of dynamic) {
            const match = pattern.exec(zh);
            if (match)
                return format(match);
        }
        return BASE.t(zh);
    }
    /**
     * 输入：错误或状态文字。
     * 输出：英文模式不会泄漏未翻译的系统报错。
     * 功能：已知消息精确翻译，未知上游消息保留在调试审计而不混入中文。
     */
    function message(text) {
        const result = t(String(text ?? ""));
        if (L.language() !== "en" || !HAN.test(result))
            return result;
        const base = BASE.message(text);
        if (!HAN.test(base))
            return base;
        if (/Key|API|百炼|DeepSeek|模型/.test(text))
            return "AI request failed. Check the key, model and connection, then try again.";
        if (/麦克风|录音|语音|音频/.test(text))
            return "Audio input failed. Check microphone permission or use text instead.";
        if (/照片|图片|摄像头/.test(text))
            return "Photo input failed. Try another image or check camera permission.";
        return "Please check your input and try again.";
    }
    let observer = null, scheduled = false;
    const originals = new WeakMap();
    /**
     * 输入：根节点。
     * 输出：无。
     * 功能：兼容老的静态HTML/弹层标签；跳过输入值及已声明的用户内容。
     */
    function translateDOM(root = document.body) {
        if (!root)
            return;
        observer?.disconnect();
        document.title = t("Fluffy Cat · 留一点时间给自己");
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
            const parent = n.parentElement;
            if (!parent || parent.closest('script,style,textarea,option,[data-user-content]'))
                continue;
            let saved = originals.get(n);
            if (saved && n.textContent !== saved.output)
                saved = null;
            const raw = saved?.raw ?? n.textContent;
            const output = L.language() === "en" ? t(raw) : raw;
            if (output !== raw || saved) {
                originals.set(n, { raw, output });
                if (n.textContent !== output)
                    n.textContent = output;
            }
        }
        for (const e of root.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) {
            if (e.closest('[data-user-content]'))
                continue;
            for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
                if (!e.hasAttribute(attr))
                    continue;
                const key = `i18nOriginal${attr.replace(/-/g, '')}`;
                const last = `i18nOutput${attr.replace(/-/g, '')}`;
                let raw = e.getAttribute(attr);
                if (e.dataset[last] === raw)
                    raw = e.dataset[key];
                const output = L.language() === "en" ? t(raw) : raw;
                e.dataset[key] = raw;
                e.dataset[last] = output;
                if (e.getAttribute(attr) !== output)
                    e.setAttribute(attr, output);
            }
        }
        if (observer)
            observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：每批DOM变化只翻译一次，不做逐帧轮询或修改HTML模板内容。
     */
    function schedule() {
        if (scheduled)
            return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; translateDOM(); });
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：初次加载安装本地化桥，不联网，不处理原始记录数据。
     */
    function start() { observer = new MutationObserver(schedule); translateDOM(); document.documentElement.lang = L.language() === "en" ? "en" : "zh-CN"; }
    L.t = t;
    L.message = message;
    if (typeof document !== "undefined")
        document.addEventListener("DOMContentLoaded", start, { once: true });
    return { t, message, translateDOM, TEXT, HAN };
})();
