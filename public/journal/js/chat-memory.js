/* v15：会话内存不落盘。只有已经上屏的回答进入后续上下文，未显示的文字不假装说过。 */
__fluffyModules["chat-memory.js"] = (() => {
    "use strict";
    class ConversationMemory {
        /** 输入：无。输出：会话账本。功能：按当前板块/日期独立管理轮次与显示进度。 */
        constructor() { this.turns = []; this.earlier = []; this.nextId = 1; }
        /**
         * 输入：text、opening（是否首次问候）、retryId（复用失败轮次）。
         * 输出：逻辑轮次对象。
         * 功能：用户话语在发送前保留，重试不会重复新增用户消息。
         */
        begin(text, opening = false, retryId = null) {
            const old = retryId && this.turns.find(t => t.id === retryId);
            if (old && old.text === text && !old.presented.length) { old.status = "pending"; return old; }
            const turn = { id: this.nextId++, text: String(text || "").slice(0, 4000), opening, presented: [], pageIds: new Set(), status: "pending" };
            this.turns.push(turn);
            // 超过40轮，把早期的实际交流抽取成有界摘录；明确是摘录，不冒充完整记忆或AI总结。
            while (this.turns.length > 40) {
                const item = this.turns.shift();
                if (item.text || item.presented.length) this.earlier.push({ userExcerpt: item.text.slice(0, 180), shownReplyExcerpt: item.presented.join(" ").slice(0, 180), status: item.status });
                if (this.earlier.length > 8) this.earlier.shift();
            }
            return turn;
        }
        /** 输入：turn、pageId、text。输出：是否首次展示。功能：按页面ID去重，仅记录真实进入气泡的文字。 */
        present(turn, pageId, text) {
            if (!turn || turn.pageIds.has(pageId) || !text) return false;
            turn.pageIds.add(pageId); turn.presented.push(text); return true;
        }
        /** 输入：turn、status。输出：无。功能：区分已完成、被打断、失败，不把错误提示当AI回答。 */
        finish(turn, status) { if (turn) turn.status = status; }
        /**
         * 输入：excludeId（当前正在重试/发送的轮次）。
         * 输出：对话列表，只含原话和已上屏内容。
         * 功能：供历史面板阅读；未显示的尾句永不加入对话。
         */
        messages(excludeId = null) {
            return this.turns.filter(t => t.id !== excludeId).flatMap(t => [
                ...(!t.opening && t.text ? [{ role: "user", content: t.text }] : []),
                ...(t.presented.length ? [{ role: "assistant", content: t.presented.join("\n") }] : [])
            ]);
        }
        /**
         * 输入：excludeId。
         * 输出：{messages, earlierExcerpts, delivery}。
         * 功能：最近六轮为主、早期上下文为摘录；标记被打断/失败，避免误以为已问过未显示的问题。
         */
        context(excludeId = null) {
            const prior = this.turns.filter(t => t.id !== excludeId), recent = prior.slice(-6), older = prior.slice(0, -6);
            const excerpts = [...this.earlier, ...older.slice(-6).map(t => ({ userExcerpt: t.text.slice(0, 180), shownReplyExcerpt: t.presented.join(" ").slice(0, 180), status: t.status }))].slice(-8);
            let budget = 12000;
            const messages = [];
            // 从最近向前分配预算，不把无限增长的历史塞进每一轮请求。
            for (const t of [...recent].reverse()) {
                const pair = [];
                for (const m of [{role:"assistant",content:t.presented.join("\n")}, {role:"user",content:t.opening ? "" : t.text}]) {
                    if (!m.content || budget < 50) continue;
                    const allowance = Math.min(2500, budget), clipped = m.content.length > allowance;
                    const content = m.content.slice(0, allowance) + (clipped ? " [excerpt ends]" : "");
                    budget -= content.length; pair.unshift({ role: m.role, content });
                }
                messages.unshift(...pair);
            }
            return { messages, earlierExcerpts: excerpts, delivery: recent.map(t => ({ status: t.status, shownPages: t.presented.length })) };
        }
    }
    class Diagnostics {
        /** 输入：无。输出：诊断环形缓冲。功能：不自动上传/写盘，不包含Key、原话、回复、日期或照片。 */
        constructor() { this.events = []; this.start = Date.now(); }
        /**
         * 输入：id（本页临时轮次数字）、event（事件名）、meta（数值/代码）。
         * 输出：无。
         * 功能：只保存白名单统计，帮助区分第二轮听写、网络、格式、主动取消等故障。
         */
        add(id, event, meta = {}) {
            const allowed = new Set(["begin", "listening", "recognized", "request", "retry", "first-page", "page", "complete", "interrupted", "failed", "intent-failed", "cancelled"]);
            if (!allowed.has(event)) return;
            const item = { turn: Number(id) || 0, event, ms: Date.now() - this.start };
            for (const key of ["characters", "page", "attempt", "status"]) if (Number.isFinite(meta[key])) item[key] = meta[key];
            if (/^(?:ai|speech|auth|language|deepseek)-[a-z-]{1,30}$/.test(meta.code || "")) item.code = meta.code;
            this.events.push(item); if (this.events.length > 120) this.events.shift();
        }
        /** 输入：无。输出：安全事件副本。功能：仅显式请求时提供脱敏诊断，不暴露会话对象。 */
        snapshot() { return this.events.map(x => ({ ...x })); }
        /** 输入：无。输出：无。功能：用户或开发者清空当前页面的诊断计数。 */
        clear() { this.events = []; this.start = Date.now(); }
    }
    return { ConversationMemory, Diagnostics };
})();
