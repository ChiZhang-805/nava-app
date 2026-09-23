/* v15：只解码陪伴对话正文；不把 reasoning_content、工具参数或上游错误正文展示给用户。 */
__fluffyModules["chat-stream.js"] = (() => {
    "use strict";
    const Policy = __fluffyModules["ai-policy.js"];
    /**
     * 输入：code（受控错误码）。
     * 输出：AIError。
     * 功能：传输错误只携带阶段代码，不保留请求正文、Key 或模型原文。
     */
    function fault(code) { return new Policy.AIError(code, code, { provider: "deepseek" }); }
    /**
     * 输入：标准 completion/chunk 的 choice。
     * 输出：正文字符串。
     * 功能：兼容正文文本块，拒绝把内部推理、拒绝或工具调用当成回答。
     */
    function contentOf(choice) {
        const message = choice?.delta || choice?.message;
        if (message?.refusal) throw fault("ai-refused");
        if (message?.tool_calls?.length) throw fault("ai-format");
        const content = message?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) return content.filter(x => x?.type === "text" && typeof x.text === "string").map(x => x.text).join("");
        return "";
    }
    /**
     * 输入：finish（模型终止原因）、text（已接收正文）。
     * 输出：无，失败时抛出分阶段错误。
     * 功能：截断不当作自然结束；真正空回答与格式缺失分开。
     */
    function finishCheck(finish, text) {
        if (finish === "length") throw fault("ai-truncated");
        if (finish === "content_filter") throw fault("ai-refused");
        if (finish !== "stop") throw fault("ai-incomplete");
        if (!text.trim()) throw fault("ai-empty");
    }
    /**
     * 输入：Response、AbortSignal、onDelta（正文增量回调）。
     * 输出：Promise<{text, finishReason}>。
     * 功能：读取 SSE/JSON；支持任意网络分块、中文 UTF-8、CRLF、usage 尾包及取消。
     */
    async function read(response, signal, onDelta = () => {}) {
        Policy.throwIfAborted(signal);
        // 阶段一：少数兼容网关忽略 stream，返回完整 JSON；不丢掉已有正常正文。
        const type = response.headers?.get?.("content-type") || "";
        if (/application\/json/i.test(type)) {
            let data;
            try { data = await response.json(); } catch { Policy.throwIfAborted(signal); throw fault("ai-format"); }
            Policy.throwIfAborted(signal);
            if (data?.error) throw fault("ai-format");
            const choice = data?.choices?.find(x => x.index === 0) || data?.choices?.[0];
            if (!choice) throw fault("ai-format");
            const text = contentOf(choice);
            if (text.length > 12000) throw fault("ai-format");
            if (text) onDelta(text);
            finishCheck(choice.finish_reason, text);
            return { text, finishReason: choice.finish_reason };
        }
        if (!response.body?.getReader) throw fault("ai-format");
        const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
        let buffer = "", text = "", finish = null, done = false, byteCount = 0;
        /** 输入：无。输出：无。功能：中止挂起的流读取，旧轮次不继续占用资源。 */
        const abort = () => { reader.cancel().catch(() => {}); };
        signal?.addEventListener("abort", abort, { once: true });
        /**
         * 输入：event（单个完整 SSE 事件）。
         * 输出：无，向上游提交正文增量。
         * 功能：只消费第0个候选的正文；心跳、角色包、usage 包不视为空回复。
         */
        function consume(event) {
            Policy.throwIfAborted(signal);
            const raw = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
            if (!raw || done) return;
            if (raw.trim() === "[DONE]") { done = true; return; }
            let data;
            try { data = JSON.parse(raw); } catch { throw fault("ai-format"); }
            if (data?.error) throw fault("ai-incomplete");
            if (!Array.isArray(data.choices)) throw fault("ai-format");
            const choice = data.choices.find(x => x.index === 0) || (data.choices[0]?.index == null ? data.choices[0] : null);
            if (!choice) return;
            const piece = contentOf(choice);
            if (piece) {
                text += piece;
                if (text.length > 12000) throw fault("ai-format");
                onDelta(piece);
            }
            if (choice.finish_reason) finish = choice.finish_reason;
        }
        try {
            // 阶段二：事件与网络块无关。半个汉字和半条 JSON 均留到下一块后再解析。
            while (!done) {
                Policy.throwIfAborted(signal);
                const part = await reader.read();
                Policy.throwIfAborted(signal);
                if (part.done) break;
                byteCount += part.value.byteLength;
                if (byteCount > 2_000_000) throw fault("ai-format");
                buffer += decoder.decode(part.value, { stream: true });
                let match;
                while ((match = /\r?\n\r?\n/.exec(buffer))) {
                    consume(buffer.slice(0, match.index));
                    buffer = buffer.slice(match.index + match[0].length);
                }
            }
            buffer += decoder.decode();
            if (buffer.trim() && !done) consume(buffer);
            Policy.throwIfAborted(signal);
            // 阶段三：必须有正常终止原因。已有完整句由播放器保留，未完成尾句不补造。
            finishCheck(finish, text);
            return { text, finishReason: finish };
        } catch (error) {
            Policy.throwIfAborted(signal);
            if (error.code) throw error;
            throw fault(error instanceof TypeError ? "ai-incomplete" : "ai-format");
        } finally {
            signal?.removeEventListener("abort", abort);
            try { await reader.cancel(); } catch { /* 连接可能已终止。 */ }
            reader.releaseLock();
        }
    }
    return { read, contentOf, finishCheck };
})();
