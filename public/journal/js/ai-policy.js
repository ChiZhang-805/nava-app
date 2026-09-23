/* v12：固定服务边界。所有语言交给 DeepSeek；百炼只接收用户主动提交的照片。 */
__fluffyModules["ai-policy.js"] = (() => {
    "use strict";
    class AIError extends Error {
        /**
         * 输入：code（受控故障码）、message（内部说明）、meta（非敏感状态）。
         * 输出：可识别的错误实例。
         * 功能：将网络、鉴权、格式与听写错误分开，不把供应商正文或密钥带进气泡。
         */
        constructor(code, message, meta = {}) {
            super(message || code);
            this.name = "AIError";
            this.code = code;
            this.provider = meta.provider || "deepseek";
            this.status = Number(meta.status) || 0;
        }
    }
    /**
     * 输入：signal（可选 AbortSignal）。
     * 输出：无，取消时抛出 AbortError。
     * 功能：取消在请求前、读取后和校验后都生效，禁止迟到结果被使用。
     */
    function throwIfAborted(signal) {
        if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
    }
    /**
     * 输入：client（已配置的文本客户端）。
     * 输出：DeepSeek 客户端。
     * 功能：禁止语言任务落到百炼，不进行隐式供应商回退。
     */
    function language(client) {
        if (!client?.configured || client.provider === "bailian")
            throw new AIError("deepseek-key", "先启用 DeepSeek，再说给小猫听。", { provider: "deepseek" });
        return client;
    }
    /**
     * 输入：client（视觉客户端）、image（用户主动提交的图像）。
     * 输出：百炼客户端。
     * 功能：图像分析只走百炼；不能把语言 Key 或原始音频混入图像请求。
     */
    function vision(client, image) {
        if (!client?.configured || client.provider !== "bailian")
            throw new AIError("bailian-key", "先启用百炼，再让我看看照片。", { provider: "bailian" });
        if (!image || typeof image !== "string") throw new AIError("photo-missing", "先选一张照片吧。", { provider: "bailian" });
        return client;
    }
    /**
     * 输入：标准 Chat Completions 结果、可选供应商。
     * 输出：解析后的普通 JSON 对象。
     * 功能：检查终止原因、拒绝、空正文、对象类型及危险字段；只剥除完整代码围栏。
     */
    function json(result, provider = "deepseek") {
        const c = result?.choices?.[0], meta = { provider };
        if (!c || c.message?.refusal) throw new AIError("ai-refused", "没有收到可以使用的回复。", meta);
        if (c.finish_reason && c.finish_reason !== "stop")
            throw new AIError(c.finish_reason === "length" ? "ai-truncated" : "ai-incomplete", "回复没有完整返回。", meta);
        let text = typeof c.message?.content === "string" ? c.message.content.trim() : "";
        if (!text) throw new AIError("ai-empty", "模型没有返回内容。", meta);
        if (text.length > 150000) throw new AIError("ai-format", "模型回复过长。", meta);
        if (/^```(?:json)?\s*[\s\S]*\s*```$/i.test(text)) text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        let body;
        try { body = JSON.parse(text); }
        catch { throw new AIError("ai-format", "模型回复格式不正确。", meta); }
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new AIError("ai-format", "模型回复不是对象。", meta);
        /** 输入：value（JSON 节点）。输出：无。功能：拒绝原型污染字段，安全字段仍由业务白名单验证。 */
        function inspect(value, depth = 0) {
            if (depth > 40) throw new AIError("ai-format", "模型回复层级过深。", meta);
            if (!value || typeof value !== "object") return;
            for (const key of Object.keys(value)) {
                if (["__proto__", "constructor", "prototype"].includes(key)) throw new AIError("ai-format", "模型回复包含越权字段。", meta);
                inspect(value[key], depth + 1);
            }
        }
        inspect(body);
        return body;
    }
    return { AIError, throwIfAborted, language, vision, json };
})();
