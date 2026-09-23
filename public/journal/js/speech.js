__fluffyModules["speech.js"] = (() => {
/**
 * 输入：code（浏览器识别/权限错误码）。
 * 输出：可读的处理建议。
 * 功能：区分权限、网络与不支持，不能拿假文本补齐失败的语音。
 */
function speechError(code) {
    return ({
        "not-allowed": "麦克风未获允许。请在浏览器里允许后，再长按说话。",
        "service-not-allowed": "浏览器不允许语音识别，先直接填写也可以。",
        "audio-capture": "没有找到可用的麦克风，请检查输入设备。",
        "network": "浏览器语音识别服务连接失败。请检查网络，或先手动填写。",
        "language-not-supported": "当前语音服务不支持中文，请换支持中文识别的浏览器。",
        "no-speech": "这次没有听到说话，长按再试一次吧。",
        "NotAllowedError": "请允许麦克风，然后重新长按说话。",
        "NotFoundError": "没有找到麦克风，请检查输入设备。",
        "NotReadableError": "麦克风暂时不可用，可能被其他程序占用。"
    })[code] || "语音没有完成，请重新长按，或直接填写。";
}
/**
 * 输入：浏览器错误码。
 * 输出：分阶段错误对象。
 * 功能：听写服务失败不是DeepSeek失败，不再统一说成没听清。
 */
function speechFault(code) {
    const P = __fluffyModules["ai-policy.js"], key = ({"not-allowed":"speech-permission","service-not-allowed":"speech-unsupported","audio-capture":"speech-device","network":"speech-network","language-not-supported":"speech-unsupported","no-speech":"speech-empty","NotAllowedError":"speech-permission","NotFoundError":"speech-device","NotReadableError":"speech-device"})[code] || "speech-interrupted";
    return P ? new P.AIError(key, speechError(code), {provider:"browser"}) : Error(speechError(code));
}
class SpeechSession {
    /**
     * 输入：callbacks（音量、转写、状态、错误、时长上限回调），env（可注入的浏览器依赖）。
     * 输出：SpeechSession 实例。
     * 功能：管理真实麦克风与浏览器转写；录音不写磁盘，Key 不参与音频识别。
     */
    constructor(callbacks = {}, env = {}) {
        this.callbacks = callbacks;
        this.env = env;
        this.serial = 0;
        this.active = false;
        this.pending = false;
        this.context = null;
        this.stream = null;
        this.recognition = null;
        this.history = Array(72).fill(0);
        this.level = 0;
        this.committed = "";
        this.finalText = "";
        this.interimText = "";
        this.settle = null;
        this.completedResult = null;
        this.interrupted = false;
    }
    /**
     * 输入：无。
     * 输出：当前环境是否同时提供麦克风与语音转写。
     * 功能：开始之前做能力检测，缺失能力时不显示伪造的录音动画。
     */
    supported() {
        const Recognition = this.env.Recognition || globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
        const media = this.env.mediaDevices || globalThis.navigator?.mediaDevices;
        return Boolean(Recognition && media?.getUserMedia);
    }
    /**
     * 输入：options（language、maximumSeconds）。
     * 输出：Promise<boolean>，真正开始为 true，被取消为 false。
     * 功能：取得麦克风后同时启用 RMS 音量采样和语音转写，并处理授权期间松手的竞态。
     */
    async start(options = {}) {
        this.cancel();
        if (!this.supported()) throw Error("当前浏览器不支持语音转写。请用支持语音识别的 Chrome/Safari，或直接填写。");
        // 阶段一：先取得真实输入流；旧的异步授权完成时必须立即释放，不能偷开麦克风。
        const generation = ++this.serial;
        this.pending = true;
        this.history.fill(0);
        this.committed = this.finalText = this.interimText = "";
        this.completedResult = null;
        this.interrupted = false;
        this.interimCarry = "";
        const media = this.env.mediaDevices || navigator.mediaDevices;
        let stream;
        try { stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
        catch (error) { if (generation !== this.serial) return false; this.pending = false; throw speechFault(error.name); }
        if (generation !== this.serial) { stream.getTracks().forEach(track => track.stop()); return false; }
        this.stream = stream;
        try {
            // 阶段二：Web Audio 只读取麦克风，不接扬声器；静音时柱形保持低幅而不是随机跳动。
            const AudioContextClass = this.env.AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!AudioContextClass) throw Error("当前浏览器无法读取音量，请换一个浏览器。");
            const context = this.context = new AudioContextClass();
            await context.resume();
            if (generation !== this.serial) {
                stream.getTracks().forEach(track => track.stop());
                if (context.state !== "closed") context.close().catch(() => {});
                return false;
            }
            this.source = this.context.createMediaStreamSource(stream);
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 1024;
            this.source.connect(this.analyser);
            this.samples = new Uint8Array(this.analyser.fftSize);
            this.startedAt = performance.now();
            this.lastSample = 0;
            this.active = true;
            this.pending = false;
            this.stopping = false;
            this.resultPromise = new Promise(resolve => { this.settle = resolve; });
            // 阶段三：识别服务接收音频、返回文本；它不是 DeepSeek 的音频接口。
            const Recognition = this.env.Recognition || globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
            const recognition = this.recognition = new Recognition();
            recognition.lang = options.language || "zh-CN";
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            recognition.onstart = () => {
                if (generation !== this.serial || !this.active || this.stopping) return;
                clearTimeout(this.startTimer);
                this.callbacks.onStarted?.();
            };
            recognition.onresult = event => {
                if (generation !== this.serial) return;
                let finalText = "", interimText = "";
                for (let i = 0; i < event.results.length; i++) {
                    if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
                    else interimText += event.results[i][0].transcript;
                }
                this.interimCarry = "";
                this.finalText = finalText;
                this.interimText = interimText;
                this.callbacks.onText?.(this.text());
                if (this.stopping) this.scheduleStableFinish();
            };
            recognition.onerror = event => {
                if (generation !== this.serial || this.stopping && event.error === "aborted") return;
                if (event.error === "no-speech" && this.active) return;
                // 有可核对原话时保留，不因识别服务尾部断线把整段已经听到的文字抹掉。
                if (this.text() && !["not-allowed", "service-not-allowed"].includes(event.error)) {
                    this.interrupted = true;
                    const wasStopping = this.stopping;
                    this.finishResult();
                    if (!wasStopping) this.callbacks.onLimit?.();
                    return;
                }
                const fault = speechFault(event.error);
                this.cancel();
                this.callbacks.onError?.(fault);
            };
            recognition.onend = () => {
                if (generation !== this.serial) return;
                if (this.stopping || !this.active) { this.finishResult(); return; }
                // 静默停句后继续识别下一句，直到用户松手；已确定文本只追加一次。
                this.committed += (/\w$/.test(this.committed) && /^\w/.test(this.finalText) ? " " : "") + this.finalText;
                this.interimCarry = this.interimText;
                this.finalText = this.interimText = "";
                this.restartTimer = setTimeout(() => {
                    if (generation !== this.serial || !this.active) return;
                    try { recognition.start(); } catch { this.cancel(); this.callbacks.onError?.(speechFault("aborted")); }
                }, 120);
            };
            // 识别真正启动前只显示等待；请求弹出或启动失败不会冒充正在识别。
            this.startTimer = setTimeout(() => {
                if (generation !== this.serial) return;
                this.cancel();
                this.callbacks.onError?.(new (__fluffyModules["ai-policy.js"]?.AIError || Error)("speech-timeout", "语音服务启动超时，请再试一次。"));
            }, 15000);
            recognition.start();
            this.sampleFrame();
            this.limitTimer = setTimeout(() => this.callbacks.onLimit?.(), Math.min(90, Math.max(1, options.maximumSeconds || 90)) * 1000);
            return true;
        } catch (error) {
            if (generation !== this.serial) return false;
            this.cancel();
            throw error;
        }
    }
    /**
     * 输入：无。
     * 输出：本次会话已确定文字加正在识别的尾句。
     * 功能：实时展示转写，不改写用户话语。
     */
    text() { return (this.committed + this.finalText + (this.interimText || this.interimCarry || "")).trim(); }
    /**
     * 输入：无，读取真实音频缓存。
     * 输出：无；推送音量和右到左滚动历史。
     * 功能：计算 RMS 并进行轻微平滑，声音越大波形越高。
     */
    sampleFrame() {
        if (!this.active || !this.analyser) return;
        this.analyser.getByteTimeDomainData(this.samples);
        let power = 0;
        for (const sample of this.samples) { const x = (sample - 128) / 128; power += x * x; }
        const rms = Math.sqrt(power / this.samples.length);
        const target = Math.max(0, Math.min(1, (rms - .004) * 7));
        this.level += (target - this.level) * (target > this.level ? .4 : .13);
        const now = performance.now();
        if (now - this.lastSample >= 35) {
            this.history.shift(); this.history.push(this.level); this.lastSample = now;
            this.callbacks.onLevel?.(this.level, this.history, (now - this.startedAt) / 1000);
        }
        this.frameId = requestAnimationFrame(this.sampleFrame.bind(this));
    }
    /**
     * 输入：无。
     * 输出：Promise<{text,canceled,interim}>。
     * 功能：松手立刻关闭音频流，短暂等待转写尾句；超时仍可返回已收到文本。
     */
    async stop() {
        if (this.completedResult) { const result = this.completedResult; this.completedResult = null; return result; }
        if (this.pending) { this.cancel(); return { text: "", canceled: true }; }
        if (!this.active && !this.stopping) return { text: "", canceled: true };
        if (this.stopping) return this.resultPromise;
        this.stopping = true;
        this.active = false;
        clearTimeout(this.limitTimer); clearTimeout(this.restartTimer);
        this.releaseAudio();
        this.stopTimer = setTimeout(() => this.finishResult(), this.env.stopWaitMs ?? 2200);
        try { this.recognition?.stop(); } catch { this.finishResult(); }
        if (this.stopping) this.scheduleStableFinish();
        return this.resultPromise;
    }
    /**
     * 输入：无，读取转写最终/临时结果。
     * 输出：无。
     * 功能：已有稳定最终句时尽早结束，临时尾句仍等待final/onend或有界超时，不切掉最后几个字。
     */
    scheduleStableFinish() {
        clearTimeout(this.stableTimer);
        if (!this.stopping || !this.text() || this.interimText || this.interimCarry) return;
        const generation=this.serial;
        this.stableTimer=setTimeout(() => { if (generation === this.serial && this.stopping && !this.interimText && !this.interimCarry) this.finishResult(); }, this.env.finalWaitMs ?? 180);
    }
    /**
     * 输入：无。
     * 输出：无，完成本次结果 Promise。
     * 功能：只结算一次，并终止识别服务，防止松手后继续监听。
     */
    finishResult() {
        clearTimeout(this.stableTimer); clearTimeout(this.startTimer); clearTimeout(this.stopTimer); clearTimeout(this.restartTimer); clearTimeout(this.limitTimer);
        const result = { text: this.text(), canceled: false, interim: Boolean(this.interimText || this.interimCarry), interrupted: this.interrupted };
        this.completedResult = result;
        this.active = false;
        this.stopping = false;
        this.releaseAudio();
        this.detachRecognition();
        this.settle?.(result); this.settle = null;
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：关闭轨道、断开分析节点并释放 AudioContext，错误与取消共用此出口。
     */
    releaseAudio() {
        cancelAnimationFrame(this.frameId);
        this.stream?.getTracks().forEach(track => track.stop());
        try { this.source?.disconnect(); } catch { /* 节点可能已因关闭 context 被释放。 */ }
        const context = this.context;
        this.stream = this.source = this.analyser = this.context = null;
        if (context && context.state !== "closed") context.close().catch(() => {});
        this.level = 0;
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：先移除回调再 abort，避免取消时触发旧的网络错误处理。
     */
    detachRecognition() {
        const recognition = this.recognition;
        this.recognition = null;
        if (!recognition) return;
        recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
        try { recognition.abort(); } catch { /* 未 start 的识别器也可以安全清理。 */ }
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：使旧授权/识别响应失效；取消不会向模型提交任何文本。
     */
    cancel() {
        this.serial++;
        this.pending = this.active = this.stopping = false;
        this.completedResult = null;
        clearTimeout(this.stableTimer); clearTimeout(this.startTimer); clearTimeout(this.stopTimer); clearTimeout(this.limitTimer); clearTimeout(this.restartTimer);
        this.releaseAudio(); this.detachRecognition();
        this.settle?.({ text: "", canceled: true }); this.settle = null;
    }
}

return {speechError,speechFault,SpeechSession};
})();
