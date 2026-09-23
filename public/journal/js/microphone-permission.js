__fluffyModules["microphone-permission.js"] = (() => {
/**
 * 输入：浏览器依赖（mediaDevices、permissions），可在测试中替换。
 * 输出：MicrophonePermission 类。
 * 功能：将首次授权与正式长按录音分离；只记权限状态，不常驻占用麦克风。
 */
class MicrophonePermission {
    /**
     * 输入：env（可选的浏览器依赖）。
     * 输出：权限控制器实例。
     * 功能：初始化单次授权任务；不调用麦克风、不弹窗、不读写持久存储。
     */
    constructor(env = {}) {
        this.media = env.mediaDevices || globalThis.navigator?.mediaDevices;
        this.permissions = env.permissions || globalThis.navigator?.permissions;
        this.granted = false;
        this.task = null;
        this.permissionStatus = null;
    }
    /**
     * 输入：无。
     * 输出：Promise<string>，granted / prompt / denied / unknown。
     * 功能：查询浏览器真实授权状态；不使用 localStorage 冒充浏览器许可。
     */
    async status() {
        // 阶段一：优先询问 Permissions API，此操作本身不会申请麦克风。
        try {
            const status = await this.permissions.query({ name: "microphone" });
            this.permissionStatus = status;
            this.granted = status.state === "granted";
            return status.state;
        } catch {
            // 阶段二：不支持 microphone 查询的浏览器，只复用本页已成功授权的事实。
            // 正式 getUserMedia 仍会经过浏览器检查，不能跳过拒绝或已撤销的权限。
            return this.granted ? "granted" : "unknown";
        }
    }
    /**
     * 输入：无。
     * 输出：Promise<boolean>；用户允许返回 true，否则抛出浏览器错误。
     * 功能：同一时刻最多一个授权请求；允许后立即关闭测试流，不转写或保存音频。
     */
    authorize() {
        if (this.task) return this.task;
        if (!this.media?.getUserMedia) return Promise.reject(new Error("请通过 HTTPS 网页打开，再使用麦克风。"));
        // 阶段一：申请仅音频权限，重复点击共享同一 Promise，避免叠加授权请求。
        this.task = this.requestOnce().finally(() => { this.task = null; });
        return this.task;
    }
    /**
     * 输入：无。
     * 输出：Promise<boolean>。
     * 功能：短暂获取授权后释放每条轨道；即使用户已取消或离开，晚到的流也被关闭。
     */
    async requestOnce() {
        let stream = null;
        try {
            stream = await this.media.getUserMedia({ audio: true, video: false });
            this.granted = true;
            return true;
        } catch (error) {
            this.granted = false;
            throw error;
        } finally {
            // 阶段二：这里只验证许可，绝不保持录音状态等待下一次按压。
            stream?.getTracks().forEach(track => track.stop());
        }
    }
}
return { MicrophonePermission };
})();
