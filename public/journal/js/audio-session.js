/* 用户主动长按的原始音频采集。只用于提交后的音频理解；没有常驻监听、落盘或音量情绪评分。 */
__fluffyModules["audio-session.js"] = (() => {
    "use strict";
    const PROCESSOR = `class FluffyPCM extends AudioWorkletProcessor {
    /**
     * 输入：AudioWorklet选项。
     * 输出：处理器。
     * 功能：收集单声道PCM缓冲。
     */
    constructor() {
        super();
        this.buffer = new Float32Array(2048);
        this.used = 0;
        this.stopped = false;
        this.port.onmessage = e => { if (e.data === 'flush') {
            this.emit();
            this.stopped = true;
            this.port.postMessage({ flushed: true });
        } };
    }
    /**
     * 输入：无。
     * 输出：无。
     * 功能：发送有效样本到主线程，尾部不足一块也保留。
     */
    emit() { if (!this.used)
        return; const data = this.buffer.slice(0, this.used); this.port.postMessage({ samples: data }, [data.buffer]); this.used = 0; }
    /**
     * 输入：真实音频输入与静音输出。
     * 输出：继续处理标记。
     * 功能：采集输入，不把麦克风声音回放到扬声器。
     */
    process(inputs) { if (this.stopped)
        return false; const input = inputs[0]?.[0]; if (input) {
        for (let i = 0; i < input.length; i++) {
            this.buffer[this.used++] = input[i];
            if (this.used === this.buffer.length)
                this.emit();
        }
    } return true; }
}
registerProcessor('fluffy-pcm', FluffyPCM);`;
    /**
     * 输入：Float32Array[]、输入采样率、输出采样率（默认16kHz）。
     * 输出：WAV ArrayBuffer。
     * 功能：用区间均值降采样并写 PCM16 WAV，不改变整体音高或人为放大声音。
     */
    function encodeWAV(chunks, rate, target = 16000) {
        const total = chunks.reduce((sum, a) => sum + a.length, 0);
        if (!total || rate < 8000)
            throw Error("没有录到有效音频。");
        const input = new Float32Array(total);
        let at = 0;
        for (const chunk of chunks) {
            input.set(chunk, at);
            at += chunk.length;
        }
        const length = Math.floor(total * target / rate), buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
        /**
         * 输入：偏移和ASCII文字。
         * 输出：无。
         * 功能：写入RIFF格式头。
         */
        const write = (offset, text) => { for (let i = 0; i < text.length; i++)
            view.setUint8(offset + i, text.charCodeAt(i)); };
        write(0, "RIFF");
        view.setUint32(4, 36 + length * 2, true);
        write(8, "WAVE");
        write(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, target, true);
        view.setUint32(28, target * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        write(36, "data");
        view.setUint32(40, length * 2, true);
        // 阶段二：保留实际声学变化；均值降采样只作格式适配，不依据音量打情绪标签。
        for (let i = 0; i < length; i++) {
            const start = i * rate / target, end = (i + 1) * rate / target;
            let sum = 0, weight = 0;
            for (let j = Math.floor(start); j < Math.min(total, Math.ceil(end)); j++) {
                const w = Math.min(end, j + 1) - Math.max(start, j);
                if (w > 0) {
                    sum += input[j] * w;
                    weight += w;
                }
            }
            const sample = Math.max(-1, Math.min(1, sum / (weight || 1)));
            view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        }
        input.fill(0);
        return buffer;
    }
    /**
     * 输入：ArrayBuffer。
     * 输出：Base64。
     * 功能：分块编码避免大音频触发参数栈上限。
     */
    function base64(buffer) { const bytes = new Uint8Array(buffer); let binary = ""; for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }
    class AudioSession {
        /**
         * 输入：状态回调与可注入环境。
         * 输出：采集器。
         * 功能：管理真实音频、音量、取消及内存清理。
         */
        constructor(callbacks = {}, env = {}) { this.callbacks = callbacks; this.env = env; this.serial = 0; this.chunks = []; this.active = false; this.pending = false; this.history = Array(72).fill(0); this.level = 0; }
        /**
         * 输入：无。
         * 输出：boolean。
         * 功能：原始音频不依赖浏览器/Google语音识别服务。
         */
        supported() { return Boolean((this.env.mediaDevices || globalThis.navigator?.mediaDevices)?.getUserMedia && (this.env.AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext)); }
        /**
         * 输入：maximumSeconds。
         * 输出：是否开始。
         * 功能：取得许可后接入音频处理器，晚到资源立即关闭。
         */
        async start({ maximumSeconds = 90 } = {}) {
            this.cancel();
            const serial = ++this.serial;
            this.pending = true;
            this.maximumSeconds = Math.min(90, Math.max(1, maximumSeconds));
            this.history.fill(0);
            this.chunks = [];
            this.samplesCount = 0;
            this.peak = 0;
            if (!this.supported())
                throw Error("当前浏览器不能录音，请使用 HTTPS 网页或手动填写。");
            let stream, context;
            try {
                // 阶段一：不启用自动增益，保留语气变化；取消过程中取得的流不能继续采集。
                stream = await (this.env.mediaDevices || navigator.mediaDevices).getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
                if (serial !== this.serial) {
                    stream.getTracks().forEach(t => t.stop());
                    return false;
                }
                this.stream = stream;
                const C = this.env.AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
                context = this.context = new C();
                await context.resume();
                if (serial !== this.serial) {
                    stream.getTracks().forEach(t => t.stop());
                    await context.close();
                    return false;
                }
                this.rate = context.sampleRate;
                this.source = context.createMediaStreamSource(stream);
                this.gain = context.createGain();
                this.gain.gain.value = 0;
                // 阶段二：优先AudioWorklet；旧环境以独立音频回调兼容，不使用定时器伪造PCM。
                if (context.audioWorklet && (this.env.AudioWorkletNode || globalThis.AudioWorkletNode)) {
                    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: "text/javascript" }));
                    try {
                        await context.audioWorklet.addModule(url);
                    }
                    finally {
                        URL.revokeObjectURL(url);
                    }
                    if (serial !== this.serial)
                        return false;
                    const Node = this.env.AudioWorkletNode || globalThis.AudioWorkletNode;
                    this.node = new Node(context, "fluffy-pcm");
                    this.node.port.onmessage = e => { if (serial !== this.serial)
                        return; if (e.data.samples)
                        this.accept(e.data.samples); if (e.data.flushed)
                        this.flushDone?.(); };
                }
                else {
                    this.node = context.createScriptProcessor(2048, 1, 1);
                    this.node.onaudioprocess = e => { if (serial === this.serial)
                        this.accept(new Float32Array(e.inputBuffer.getChannelData(0))); };
                }
                this.source.connect(this.node);
                this.node.connect(this.gain);
                this.gain.connect(context.destination);
                this.pending = false;
                this.active = true;
                this.startedAt = performance.now();
                this.callbacks.onStarted?.();
                this.limitTimer = setTimeout(() => this.callbacks.onLimit?.(), this.maximumSeconds * 1000);
                return true;
            }
            catch (e) {
                if (serial !== this.serial)
                    return false;
                this.cancel();
                if (e.name === "NotAllowedError")
                    throw Error("请在网站权限中允许麦克风。");
                if (e.name === "NotFoundError")
                    throw Error("没有找到麦克风。");
                throw Error(e.message || "录音没有开始，请重新长按。");
            }
        }
        /**
         * 输入：真实单声道样本。
         * 输出：无。
         * 功能：保存限长PCM并平滑真实RMS波形；低声不被直接判成负面情绪。
         */
        accept(samples) {
            if (!this.active && !this.stopping)
                return;
            const remaining = Math.floor(this.rate * this.maximumSeconds) - this.samplesCount;
            if (remaining <= 0)
                return;
            const copy = samples.slice(0, remaining);
            this.chunks.push(copy);
            this.samplesCount += copy.length;
            let power = 0;
            for (const x of copy) {
                power += x * x;
                this.peak = Math.max(this.peak, Math.abs(x));
            }
            const target = Math.max(0, Math.min(1, Math.sqrt(power / (copy.length || 1)) * 8));
            this.level += (target - this.level) * (target > this.level ? .45 : .18);
            this.history.shift();
            this.history.push(this.level);
            this.callbacks.onLevel?.(this.level, [...this.history]);
        }
        /**
         * 输入：无。
         * 输出：Promise<{audio,duration,canceled}>。
         * 功能：松手停轨道，取完尾样本后输出内存WAV，静音不调用模型。
         */
        async stop() {
            if (this.stopping)
                return this.stopPromise;
            if (!this.active) {
                this.cancel();
                return { canceled: true };
            }
            this.active = false;
            this.stopping = true;
            clearTimeout(this.limitTimer);
            const serial = this.serial;
            // 松手即关闭输入轨道，只等待已经收进缓冲的尾部；不会继续监听。
            this.stream?.getTracks().forEach(t => t.stop());
            this.stopPromise = (async () => {
                if (this.node?.port) {
                    await new Promise(resolve => { const timeout = setTimeout(resolve, 160); this.flushDone = () => { clearTimeout(timeout); resolve(); }; this.node.port.postMessage("flush"); });
                }
                if (serial !== this.serial)
                    return { canceled: true };
                const duration = this.samplesCount / this.rate;
                try {
                    if (duration < .35 || this.peak < .001)
                        throw Error("这次没有录到清楚的声音，长按再说一次吧。");
                    const buffer = encodeWAV(this.chunks, this.rate), data = "data:audio/wav;base64," + base64(buffer);
                    return { canceled: false, audio: { data, format: "wav" }, duration };
                }
                finally {
                    this.stopping = false;
                    this.release();
                }
            })();
            const pending = this.stopPromise;
            pending.then(() => { if (this.stopPromise === pending)
                this.stopPromise = null; }, () => { if (this.stopPromise === pending)
                this.stopPromise = null; });
            return pending;
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：断开音频节点、关闭上下文并清零PCM内存。
         */
        release() {
            clearTimeout(this.limitTimer);
            this.stream?.getTracks().forEach(t => t.stop());
            for (const n of [this.source, this.node, this.gain]) {
                try {
                    n?.disconnect();
                }
                catch { /* 节点可能已关闭。 */ }
            }
            if (this.node?.port)
                this.node.port.onmessage = null;
            if (this.node && "onaudioprocess" in this.node)
                this.node.onaudioprocess = null;
            const context = this.context;
            this.stream = this.source = this.node = this.gain = this.context = null;
            if (context && context.state !== "closed")
                context.close().catch(() => { });
            this.chunks.forEach(a => a.fill(0));
            this.chunks = [];
            this.level = 0;
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：取消阻止迟到启动、回填或上传；释放设备及临时音频。
         */
        cancel() { this.serial++; this.active = this.pending = this.stopping = false; this.flushDone?.(); this.flushDone = null; this.release(); this.stopPromise = null; }
    }
    return { AudioSession, encodeWAV, base64 };
})();
