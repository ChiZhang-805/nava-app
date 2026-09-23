/* 小猫气泡是唯一提示出口：错误用温柔、准确的本地对白；不另显示底部条。 */
__fluffyModules["bubble-copy.js"] = (() => {
    "use strict";
    const COPY = Object.freeze({
        home: "把今天的小事\n慢慢讲给我听",
        listening: "你慢慢地讲呀\n我在认真听呢",
        thinking: "我在整理你的话\n填好就给你看看",
        ready: "已经填好啦\n你再看一看",
        canceled: "先停在这里\n内容还留着",
        permission: "先允许麦克风\n再说给小猫听",
        voiceReady: "准备好啦\n长按说吧",
        voiceInvite: "长按下面按钮\n慢慢说给我听",
        estimating: "我来排排时间\n陪你专心做好",
        estimated: "时间安排好啦\n我们一起开始",
        photo: "让我仔细看看\n记下清楚的事",
        error: "这次没能接上\n内容还在这里",
        saved: "今天也辛苦啦\n都替你记好啦",
        focusAway: "时间还在走呀\n随时回来找我"
    });
    const ALIASES = Object.freeze({
        "已取消，填过的内容还在。": "canceled",
        "请先允许麦克风。": "permission",
        "准备好了，长按开始说话。": "voiceReady",
        "嗯，我在听。": "listening",
        "听到了，我整理一下。": "thinking",
        "写在框里了，确认后交给我记录。": "ready",
        "让我把时间估得实际一点。": "estimating",
        "我看看，再一起核对。": "photo",
        "只记下看得清的部分，你再看看。": "ready",
        "长按底部按钮，我在听。": "voiceInvite",
        "整理好了，确认后我来写。": "ready",
        "记下来了，今天也辛苦啦。": "saved",
        "计时仍在继续，随时回来。": "focusAway"
    });
    const players = new WeakMap();
    /**
     * 输入：text（状态或错误）、error、context（校验字段和语言）。
     * 输出：{text, detail}，detail始终为空。
     * 功能：错误直接变成小猫对白，不再让用户去找下方提示条。
     */
    function prepare(text, error = false, context = {}) {
        const original = String(text?.message ?? text ?? "").trim(), key = ALIASES[original] || original;
        const locale = __fluffyModules["entry-i18n.js"], F = __fluffyModules["cat-feedback.js"];
        if (context.question && __fluffyModules["journal-guidance.js"]?.fields(context.category).some(f => f.key === context.question.field))
            return {text:context.question.question, detail:""};
        if (error || context.field) return { text: F.say(text, context), detail: "" };
        if (COPY[key]) return { text: locale?.language() === "en" ? locale.bubble(key, COPY[key]) : COPY[key], detail: "" };
        const lines = original.split("\n");
        if (lines.length <= 2 && lines.every(line => [...line].length <= 8))
            return { text: locale?.language() === "en" ? locale.bubble(key, original) : original, detail: "" };
        return { text: F.say(text, context), detail: "" };
    }
    /**
     * 输入：node（一个小猫气泡）。
     * 输出：无。
     * 功能：停止旧的分页计时，新动作和新错误不会被旧提示盖回去。
     */
    function stop(node) {
        const old = players.get(node);
        if (old) clearTimeout(old.timer);
        players.delete(node);
    }
    /**
     * 输入：node、text/error、context。
     * 输出：空串，调用方无需再展示任何旁路提示。
     * 功能：根据真实气泡宽度显示完整短句；过长英文分成小页逐句说，最后一页保留。
     */
    function render(node, text, error = false, context = {}) {
        stop(node);
        const copy = prepare(text, error, context), Talk = __fluffyModules["review-conversation.js"];
        const content = [copy.text];
        for (const key of [context.followup, ...(context.followups || [])].filter(Boolean))
            content.push(__fluffyModules["cat-feedback.js"].say(key, context));
        let measure = null, width = 0;
        if (typeof getComputedStyle === "function" && Talk) {
            const style = getComputedStyle(node), c = document.createElement("canvas").getContext("2d");
            if (c) {
                c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                width = Math.max(node.clientWidth, parseFloat(style.maxWidth) || 0) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
                measure = str => c.measureText(str).width + [...str].length * (parseFloat(style.letterSpacing) || 0);
            }
        }
        const pages = [...new Set(content)].flatMap(value => {
            const lines = value.split("\n"), lang = __fluffyModules["entry-i18n.js"]?.language() || "zh";
            const over = lines.length > 2 || lines.some(line => measure && measure(line) > width) || lang === "zh" && [...value.replace(/\s/g, "")].length > 16;
            return Talk && over ? Talk.pages(value, measure || (t => [...t].length * 13), width > 10 ? width : 116, lang) : [lines];
        });
        const player = { timer: null, index: 0, pages };
        players.set(node, player);
        /** 输入：无。输出：无。功能：一页最多两行，使用textContent避免注入；新提示替换即终止。 */
        function show() {
            if (players.get(node) !== player) return;
            const lines = player.pages[player.index] || [copy.text];
            node.textContent = lines.join("\n");
            node.dataset.lines = String(lines.length);
            node.classList.remove("error");
            node.dataset.feedback = error ? "help" : "notice";
            node.setAttribute("aria-live", "polite");
            node.setAttribute("aria-atomic", "true");
            if (player.index < player.pages.length - 1) player.timer = setTimeout(() => { player.index++; show(); }, 3700);
        }
        show();
        return "";
    }
    return { COPY, prepare, render, stop };
})();
