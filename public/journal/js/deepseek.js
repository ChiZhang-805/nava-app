__fluffyModules["deepseek.js"] = (() => {
    const OFFICIAL = "https://api.deepseek.com";
    // 结构化记录的提示词由ai-journal和journal-guidance统一生成，不再保留旧版距离字段模板。
    /**
     * 输入：locationLike（浏览器地址），config（公开配置）。
     * 输出：chat/models 的请求地址。
     * 功能：独立 HTML 直连官方服务；本机 Node 服务使用同源代理避免跨域障碍。
     */
    function apiRoutes(locationLike, config = {}) {
        const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(locationLike.hostname || "");
        const proxy = config.localProxy !== false && local && /^https?:$/.test(locationLike.protocol);
        return proxy ? { chat: "/api/deepseek/chat", models: "/api/deepseek/models" } : { chat: `${OFFICIAL}/chat/completions`, models: `${OFFICIAL}/models` };
    }
    /**
     * 输入：status（HTTP状态码）。
     * 输出：不含密钥或服务商响应正文的错误说明。
     * 功能：在鉴权、余额、限流、模型名变化时给出可操作的提示。
     */
    function apiError(status) {
        return ({ 400: "DeepSeek 不接受当前请求或模型，请检查源码里的模型配置。", 401: "DeepSeek Key 无效，请在右上角重新填写。", 402: "DeepSeek 账户余额不足，请先充值。", 403: "此 Key 没有访问权限。", 404: "DeepSeek 模型或接口不可用，请检查模型配置。", 422: "DeepSeek 返回参数校验错误，请重试。", 429: "请求有点频繁，请稍后再试。", 500: "DeepSeek 暂时不可用，请稍后再试。", 503: "DeepSeek 当前繁忙，请稍后再试。" })[status] || `连接失败（HTTP ${status}），你的输入仍然保留。`;
    }
    class DeepSeekClient {
        #key = "";
        /**
         * 输入：options（模型、地址与可替换的网络函数）。
         * 输出：DeepSeekClient 实例。
         * 功能：封装官方 Chat 请求；密钥仅存于实例私有内存，不写存储、不打印日志。
         */
        constructor(options = {}) {
            this.provider = "deepseek";
            this.requestTimeoutMs = options.requestTimeoutMs ?? 60000;
            this.keyVersion = 0;
            this.routes = options.routes || apiRoutes(globalThis.location || {}, options.config || {});
            this.model = options.model || "deepseek-flash";
            this.fetch = options.fetchImpl || globalThis.fetch.bind(globalThis);
        }
        /**
         * 输入：无。
         * 输出：是否已在本次页面设置 Key。
         * 功能：区分已配置与网络验证成功；不宣称模型已经可用。
         */
        get configured() { return this.#key.length > 0; }
        /**
         * 输入：key（用户输入）。
         * 输出：无；格式不合适时抛出错误。
         * 功能：启用本次页面的 Key，不把 Key 存入 localStorage、源码或 URL。
         */
        setKey(key) {
            const trimmed = String(key).trim();
            if (trimmed.length < 12 || trimmed.length > 256 || /\s/.test(trimmed))
                throw Error("请填写完整的 DeepSeek API Key。");
            this.#key = trimmed;
            this.keyVersion++;
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：立即清空当前实例的密钥引用。
         */
        clear() { this.#key = ""; this.keyVersion++; }
        /**
         * 输入：path（固定目标）、payload（请求体或null）、signal（外部取消信号）。
         * 输出：解析后的响应 JSON。
         * 功能：统一处理超时、取消和 HTTP 错误；只允许向指定官方/本机路由发送 Key。
         */
        async request(path, payload, signal) {
            const P = __fluffyModules["ai-policy.js"], ErrorType = P?.AIError || Error;
            P?.throwIfAborted(signal);
            if (!this.configured) throw new ErrorType("deepseek-key", "先启用 DeepSeek，再说给小猫听。");
            if (!Object.values(this.routes).includes(path)) throw new ErrorType("ai-parameter", "不允许向这个地址发送 Key。");
            // 阶段一：同一个请求代次共享取消、密钥快照和总超时；更换Key使旧结果失效。
            const version = this.keyVersion, key = this.#key, controller = new AbortController();
            let timedOut = false;
            /** 输入：无。输出：无。功能：将用户取消传到网络与重试等待。 */
            const cancel = () => controller.abort();
            signal?.addEventListener("abort", cancel, { once: true });
            const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, payload ? this.requestTimeoutMs : 20000);
            /** 输入：毫秒数。输出：Promise。功能：有上限的退避；取消后不再重试。 */
            const wait = ms => new Promise((resolve, reject) => {
                let timer;
                const aborted = () => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); };
                if (controller.signal.aborted) { aborted(); return; }
                controller.signal.addEventListener("abort", aborted, { once: true });
                timer = setTimeout(() => { controller.signal.removeEventListener("abort", aborted); resolve(); }, ms);
            });
            try {
                // 阶段二：仅对明确的限流/临时HTTP故障重试一次；不重复未知状态的网络请求。
                for (let attempt = 0; attempt < 2; attempt++) {
                    P?.throwIfAborted(controller.signal);
                    if (version !== this.keyVersion) throw new DOMException("Canceled", "AbortError");
                    const response = await this.fetch(path, {
                        method: payload ? "POST" : "GET", redirect: "error", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
                        headers: { Authorization: `Bearer ${key}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
                        ...(payload ? { body: JSON.stringify(payload) } : {}), signal: controller.signal
                    });
                    P?.throwIfAborted(controller.signal);
                    if (!response.ok) {
                        const retryAfter = response.headers?.get?.("Retry-After"), number = Number(retryAfter);
                        const delay = retryAfter ? (Number.isFinite(number) ? number * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : 700;
                        if (!attempt && [429, 500, 502, 503, 504].includes(response.status) && delay >= 0 && delay <= 2500) {
                            try { await response.body?.cancel(); } catch { /* 故障正文不需要读取。 */ }
                            await wait(Math.max(150, delay));
                            continue;
                        }
                        const code = ({400:"ai-parameter",401:"auth-deepseek",402:"ai-balance",403:"ai-permission",404:"ai-model",422:"ai-parameter",429:"ai-busy",500:"ai-busy",502:"ai-busy",503:"ai-busy",504:"ai-timeout"})[response.status] || "ai-network";
                        throw new ErrorType(code, apiError(response.status), { provider: "deepseek", status: response.status });
                    }
                    // 阶段三：读取和形状错误与听写失败分开，不回显服务商正文。
                    let result;
                    try { result = await response.json(); }
                    catch (e) { if (controller.signal.aborted) throw e; throw new ErrorType("ai-format", "DeepSeek 返回格式不正确。"); }
                    P?.throwIfAborted(controller.signal);
                    if (version !== this.keyVersion) throw new DOMException("Canceled", "AbortError");
                    if (!result || typeof result !== "object" || result.error) throw new ErrorType("ai-format", "DeepSeek 返回结构不正确。");
                    return result;
                }
            } catch (error) {
                if (timedOut) throw new ErrorType("ai-timeout", "整理超时了，你的输入还在。");
                if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
                if (error instanceof TypeError) throw new ErrorType("ai-network", "无法连接 DeepSeek，请检查网络。");
                throw error;
            } finally {
                clearTimeout(timeout);
                signal?.removeEventListener("abort", cancel);
            }
        }
        /**
         * 输入：payload（文字聊天请求）、signal、onDelta（正文回调）、options（剩余总时限）。
         * 输出：Promise<{text, finishReason}>。
         * 功能：独立的陪伴流式通道；不影响原有结构化记录请求，不自行无限重试。
         */
        async streamText(payload, signal, onDelta, options = {}) {
            const P = __fluffyModules["ai-policy.js"], Stream = __fluffyModules["chat-stream.js"];
            P.throwIfAborted(signal);
            if (!this.configured) throw new P.AIError("deepseek-key", "DeepSeek key required");
            const version = this.keyVersion, key = this.#key, controller = new AbortController();
            let timedOut = false;
            /** 输入：无。输出：无。功能：将旧轮取消传给 fetch 和 SSE 读取。 */
            const cancel = () => controller.abort();
            signal?.addEventListener("abort", cancel, { once: true });
            const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(this.requestTimeoutMs, options.timeoutMs ?? this.requestTimeoutMs)));
            try {
                // 阶段一：仅使用当前 DeepSeek Key；强制正文流，移除聊天不需要的 JSON 契约。
                const body = { ...payload, model: this.model, stream: true, thinking: { type: "disabled" } };
                delete body.response_format;
                const response = await this.fetch(this.routes.chat, {
                    method: "POST", redirect: "error", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
                    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                    body: JSON.stringify(body), signal: controller.signal
                });
                P.throwIfAborted(controller.signal);
                if (!response.ok) {
                    const code = ({400:"ai-parameter",401:"auth-deepseek",402:"ai-balance",403:"ai-permission",404:"ai-model",422:"ai-parameter",429:"ai-busy",500:"ai-busy",502:"ai-busy",503:"ai-busy",504:"ai-timeout"})[response.status] || "ai-network";
                    const error = new P.AIError(code, apiError(response.status), { provider: "deepseek", status: response.status });
                    const header = response.headers?.get?.("Retry-After");
                    error.retryAfterMs = header ? (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 500;
                    try { await response.body?.cancel(); } catch { /* 不保存服务商错误正文。 */ }
                    throw error;
                }
                // 阶段二：每次正文回调和结束都检查代次，换 Key 后旧流不能继续显示。
                const result = await Stream.read(response, controller.signal, delta => {
                    P.throwIfAborted(controller.signal);
                    if (version !== this.keyVersion) { controller.abort(); throw new DOMException("Canceled", "AbortError"); }
                    onDelta?.(delta);
                });
                if (version !== this.keyVersion) throw new DOMException("Canceled", "AbortError");
                P.throwIfAborted(controller.signal);
                return result;
            } catch (error) {
                if (timedOut) throw new P.AIError("ai-timeout", "Chat stream timed out");
                if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
                if (error.code) throw error;
                throw new P.AIError(error instanceof TypeError ? "ai-network" : "ai-format", "Chat transport failed");
            } finally {
                clearTimeout(timeout);
                signal?.removeEventListener("abort", cancel);
            }
        }
        /**
         * 输入：signal（取消信号，可选）。
         * 输出：可用模型名称数组。
         * 功能：读取模型列表验证 Key；不生成聊天内容，不宣称语音识别已经接通。
         */
        async check(signal) {
            const result = await this.request(this.routes.models, null, signal);
            if (!Array.isArray(result.data))
                throw Error("DeepSeek 未返回有效的模型列表。");
            return result.data.map(model => model.id).filter(id => typeof id === "string");
        }
        /**
         * 输入：text（真实语音转写），signal（取消信号）。
         * 输出：{record,warnings} 的可编辑草稿。
         * 功能：调用非思考 Chat 模式输出少量结构化字段，不将音频假装发送给文本模型。
         */
        async extract(text, signal) {
            const draft = await __fluffyModules["ai-journal.js"].extract(this, "sport", text, null, signal);
            return {record:draft.fields, warnings:draft.warnings};
        }
    }
    return { apiRoutes, apiError, DeepSeekClient };
})();
