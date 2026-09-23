/* v15：自然语言正文 → 有界短句 → 一/两行气泡。中文最多16个可见字符，数字与词组优先整体保留。 */
__fluffyModules["chat-text.js"] = (() => {
    "use strict";
    const P = __fluffyModules["ai-policy.js"];
    const segments = typeof Intl.Segmenter === "function" ? { grapheme: new Intl.Segmenter(undefined, {granularity:"grapheme"}), zh: new Intl.Segmenter("zh", {granularity:"word"}), en: new Intl.Segmenter("en", {granularity:"word"}) } : null;
    const HAN = /[\u3400-\u9fff]/u, CLOSE = /^[，。！？、；：,.!?;:）)】\]”’]/u;
    /** 输入：text。输出：可见字素数组。功能：中文、代理对、组合字符和emoji不按UTF-16半字切分。 */
    function graphemes(text) {
        return segments ? [...segments.grapheme.segment(String(text))].map(x => x.segment) : [...String(text)];
    }
    /** 输入：text。输出：去掉换行的可见字符数。功能：标点计数，换行不占16字配额。 */
    function count(text) { return graphemes(String(text).replace(/[\r\n]/g, "")).length; }
    /** 输入：text。输出：规范纯文本。功能：仅整理显示空白和简单Markdown标记，不执行HTML或脚本。 */
    function clean(text) { return String(text || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/^\s*(?:#{1,6}|[-*])\s+/gm, "").replace(/\*\*|__/g, "").replace(/\s+/gu, " ").trim(); }
    /**
     * 输入：text、lang。
     * 输出：保留空格的语义单元。
     * 功能：先保护时间、小数及单位，再按语言分词；分词不可用时安全逐字回退。
     */
    function words(text, lang) {
        const out = [], pattern = /(?:\d+(?:[.:/]\d+)*(?:\s*(?:公里|千米|公斤|分钟|小时|毫升|克|米|秒|km|kg|kcal|minutes?|hours?|min|ml|g|h))?)/gi;
        let at = 0, match;
        /** 输入：part。输出：无。功能：将非数值片段分成词语、标点与空白。 */
        function append(part) {
            if (!part) return;
            if (segments) out.push(...[...segments[lang === "en" ? "en" : "zh"].segment(part)].map(x => x.segment));
            else out.push(...(part.match(/[A-Za-z]+(?:['’.-][A-Za-z]+)*|\s+|./gu) || []));
        }
        while ((match = pattern.exec(text))) { append(text.slice(at, match.index)); out.push(match[0]); at = pattern.lastIndex; }
        append(text.slice(at));
        return out;
    }
    /**
     * 输入：parts（语义单元）、measure、width。
     * 输出：一至两行，放不下则null。
     * 功能：真实测量字体宽度，平衡换行；标点不另起一行，否定词不悬在行尾。
     */
    function fitLines(parts, measure, width) {
        const text = parts.join("").trim();
        if (!text) return null;
        if (measure(text) <= width) return [text];
        let result = null, best = Infinity;
        for (let i = 1; i < parts.length; i++) {
            const a = parts.slice(0, i).join("").trim(), b = parts.slice(i).join("").trim(), wa = measure(a), wb = measure(b);
            if (!a || !b || wa > width || wb > width || CLOSE.test(b) || /[（(【\[“‘]$/.test(a)) continue;
            const cost = Math.abs(wa - wb) + (/[，,；;。.!?！？]$/.test(a) ? -12 : 0) + (/[不没未别很更]$/.test(a) ? 35 : 0);
            if (cost < best) { best = cost; result = [a, b]; }
        }
        return result;
    }
    /**
     * 输入：text、measure（实际宽度函数）、width、lang。
     * 输出：每页一/两行字符串数组。
     * 功能：动态规划分段，优先语义边界和饱满两行，不截掉长回复、不挤小字号。
     */
    function pages(text, measure, width, lang) {
        const normalized = clean(text);
        if (!normalized) return [];
        lang = lang || (HAN.test(normalized) ? "zh" : "en");
        const limit = lang === "en" ? 64 : 16, target = lang === "en" ? 48 : 14;
        width = Math.max(20, width || 122);
        // 阶段一：只有单个超长词实在放不下时才拆字；3.5公里/23:00等正常单位不拆。
        const units = words(normalized, lang).flatMap(t => count(t) > limit || measure(t.trim()) > width ? graphemes(t) : [t]);
        const rawMeasure = measure, widths = new Map();
        measure = value => { if (!widths.has(value)) widths.set(value, rawMeasure(value)); return widths.get(value); };
        const n = units.length, dp = Array(n + 1).fill(Infinity), choice = Array(n);
        dp[n] = 0;
        // 阶段二：16字硬上限与两行宽度同时满足，再按自然停顿和尾页饱满度选择切点。
        for (let i = n - 1; i >= 0; i--) {
            for (let j = i + 1; j <= n; j++) {
                const chunk = units.slice(i, j).join("").trim(), size = count(chunk);
                if (size > limit) break;
                const lines = fitLines(units.slice(i, j), measure, width);
                if (!lines || j < n && CLOSE.test(units[j].trim() || units[j + 1] || "")) continue;
                const stop = /[。！？.!?；;，,]$/.test(chunk), small = size < (lang === "en" ? 12 : 6);
                const cost = 110 + Math.abs(target - size) * 2 + (small ? 70 : 0) + (stop ? -26 : 0) + (/[不没未别很更]$/.test(chunk) ? 80 : 0) + dp[j];
                if (cost < dp[i]) { dp[i] = cost; choice[i] = { end: j, lines }; }
            }
        }
        const output = [];
        for (let i = 0; i < n;) {
            if (choice[i]) { output.push(choice[i].lines); i = choice[i].end; }
            else {
                // 极窄环境兜底：依然保留原字；正常手机宽度不会进入这一分支。
                const part = units[i++].trim();
                if (part) output.push([part]);
            }
        }
        return output;
    }
    /**
     * 输入：raw（旧式完整JSON正文）。
     * 输出：已识别的回答文本。
     * 功能：兼容字符串数组/对象数组；缺少gesture不能导致已有回答丢失，未知结构不猜。
     */
    function legacyText(raw) {
        let body;
        try { body = JSON.parse(String(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
        catch { throw new P.AIError("ai-format", "Unexpected chat envelope"); }
        const values = Array.isArray(body) ? body : Array.isArray(body?.replies) ? body.replies : [body?.reply ?? body?.text ?? body?.content ?? body?.message?.content];
        const texts = values.map(x => typeof x === "string" ? x : typeof x?.text === "string" ? x.text : "").filter(x => x.trim());
        if (!texts.length) throw new P.AIError("ai-empty", "Empty chat envelope");
        return texts.join("\n");
    }
    class PhraseBuffer {
        /**
         * 输入：lang、measure、width、onPage（完整短句回调）。
         * 输出：独立一轮的增量分句器。
         * 功能：网络增量不直接上屏，只把完整句/自然半句交给播放器。
         */
        constructor({ lang = "zh", measure = t => count(t) * 13, width = 122, onPage = () => {} } = {}) {
            this.lang = lang; this.measure = measure; this.width = width; this.onPage = onPage;
            this.buffer = ""; this.raw = ""; this.mode = null; this.emitted = 0; this.closed = false;
        }
        /** 输入：delta。输出：无。功能：缓冲网络片段，屏蔽协议JSON直到完整解析。 */
        push(delta) {
            if (this.closed) return;
            this.raw += delta; this.buffer += delta;
            if (this.raw.length > 12000) throw new P.AIError("ai-format", "Chat too long");
            if (!this.mode && this.buffer.trim()) this.mode = /^[{[`]/.test(this.buffer.trimStart()) ? "envelope" : "plain";
            if (this.mode !== "plain") return;
            this.drain(false);
        }
        /**
         * 输入：text（可提交显示的完整片段）。
         * 输出：无。
         * 功能：语言检查后逐页提交；动作由本地温和节奏决定，不要求模型动作字段。
         */
        emit(text) {
            text = clean(text);
            if (!text) return;
            if (this.lang === "en" && HAN.test(text)) throw new P.AIError("language-reply", "English reply required");
            for (const lines of pages(text, this.measure, this.width, this.lang)) {
                const gesture = /[?？]/.test(lines.join("")) ? "think" : this.emitted % 4 === 0 ? "nod" : this.emitted % 4 === 2 ? "wave" : "soft";
                this.onPage({ lines, text: lines.join(this.lang === "en" ? " " : ""), gesture, index: this.emitted++ });
            }
        }
        /**
         * 输入：final（是否正常结束）。
         * 输出：无。
         * 功能：句末优先、长句带前瞻分页；小数点不当句号，失败时未完成尾句不显示。
         */
        drain(final) {
            let match;
            while ((match = /[。！？!?；;\n]|\.(?!\d)(?=\s|$)/u.exec(this.buffer))) {
                const end = match.index + match[0].length;
                if (!final && match[0] === "." && end === this.buffer.length) break;
                this.emit(this.buffer.slice(0, end)); this.buffer = this.buffer.slice(end);
            }
            // 没有标点的长句保留后半段前瞻，避免输出一个字一个字跳动的半截词。
            const threshold = this.lang === "en" ? 130 : 40;
            while (count(this.buffer) > threshold) {
                const part = pages(this.buffer, this.measure, this.width, this.lang)[0], compact = part.join(this.lang === "en" ? " " : "");
                const wanted = compact.replace(/\s/g, "");
                let used = 0, acc = "";
                for (const g of graphemes(this.buffer)) { used += g.length; acc += g.replace(/\s/g, ""); if (acc === wanted) break; }
                if (!used || acc !== wanted) break;
                this.emit(this.buffer.slice(0, used)); this.buffer = this.buffer.slice(used);
            }
            if (final) { this.emit(this.buffer); this.buffer = ""; }
        }
        /** 输入：无。输出：已输出页数。功能：仅在正常EOF后展示尾句，并兼容旧式完整JSON。 */
        finish() {
            if (this.closed) return this.emitted;
            if (this.mode === "envelope") { const text = legacyText(this.buffer); this.buffer = text; this.mode = "plain"; }
            this.drain(true); this.closed = true;
            if (!this.emitted) throw new P.AIError("ai-empty", "No chat text");
            return this.emitted;
        }
        /** 输入：无。输出：无。功能：用户打断或请求失败时丢弃未成句尾巴，不再触发回调。 */
        cancel() { this.closed = true; this.buffer = this.raw = ""; }
    }
    return { count, graphemes, clean, words, pages, legacyText, PhraseBuffer };
})();
