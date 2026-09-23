__fluffyModules["focus-timer.js"] = (() => {
    "use strict";
    class FocusTimer {
        /**
         * 输入：clock（毫秒时钟，可注入测试）。
         * 输出：计时器实例。
         * 功能：用绝对截止时间计时，不依赖动画帧数。
         */
        constructor(clock = () => Date.now()) {
            this.clock = clock;
            this.state = "idle";
            this.totalMs = 0;
            this.remainingMs = 0;
            this.deadline = 0;
            this.elapsedMs = 0;
            this.restStarted = 0;
            this.restMs = 0;
            this.activeSince = 0;
        }
        /**
         * 输入：minutes（大于零的分钟数）。
         * 输出：当前快照。
         * 功能：开始新的专注段，清除此前会话数据。
         */
        start(minutes) {
            if (!Number.isFinite(minutes) || minutes < .1 || minutes > 720)
                throw Error("专注时间应在 0.1 到 720 分钟之间。");
            this.totalMs = Math.round(minutes * 60000);
            this.remainingMs = this.totalMs;
            this.elapsedMs = 0;
            this.restMs = 0;
            this.state = "running";
            this.activeSince = this.clock();
            this.deadline = this.activeSince + this.remainingMs;
            return this.snapshot();
        }
        /**
         * 输入：无。
         * 输出：快照。
         * 功能：按截止时间同步剩余时间；到时封顶，不把后台多待的时间算作专注。
         */
        tick() {
            if (this.state === "running") {
                const now = this.clock();
                this.remainingMs = Math.max(0, Math.min(this.totalMs - this.elapsedMs, this.deadline - now));
                if (this.remainingMs === 0) {
                    this.elapsedMs = this.totalMs;
                    this.state = "completed";
                }
            }
            return this.snapshot();
        }
        /**
         * 输入：rest（是否进入休息）。
         * 输出：快照。
         * 功能：结算本段实际用时，暂停/休息均不继续累计专注。
         */
        pause(rest = false) {
            this.tick();
            if (this.state !== "running")
                return this.snapshot();
            this.elapsedMs = this.totalMs - this.remainingMs;
            this.state = rest ? "resting" : "paused";
            if (rest)
                this.restStarted = this.clock();
            return this.snapshot();
        }
        /**
         * 输入：无。
         * 输出：快照。
         * 功能：恢复剩余时间；结束休息并单独累计休息时长。
         */
        resume() {
            if (!["paused", "resting"].includes(this.state))
                return this.snapshot();
            if (this.state === "resting")
                this.restMs += Math.max(0, this.clock() - this.restStarted);
            this.activeSince = this.clock();
            this.deadline = this.activeSince + this.remainingMs;
            this.state = "running";
            return this.snapshot();
        }
        /**
         * 输入：无。
         * 输出：新快照。
         * 功能：从原定时长重新开始；调用前由界面确认会清除本轮进度。
         */
        reset() {
            return this.start(this.totalMs / 60000);
        }
        /**
         * 输入：无。
         * 输出：结束快照。
         * 功能：明确停止，保存实际专注和休息时间，不声称待办已完成。
         */
        stop() {
            this.tick();
            if (this.state === "completed")
                return this.snapshot();
            if (this.state === "resting")
                this.restMs += Math.max(0, this.clock() - this.restStarted);
            this.elapsedMs = this.totalMs - this.remainingMs;
            this.state = "stopped";
            return this.snapshot();
        }
        /**
         * 输入：无。
         * 输出：不包含函数的状态对象。
         * 功能：持久化与恢复计时器；Key 和照片不进入此状态。
         */
        snapshot() {
            return {
                state: this.state, totalMs: this.totalMs, remainingMs: this.remainingMs, deadline: this.deadline,
                elapsedMs: this.state === "running" ? this.totalMs - this.remainingMs : this.elapsedMs,
                restMs: this.restMs, restStarted: this.restStarted, activeSince: this.activeSince
            };
        }
        /**
         * 输入：raw（本机恢复数据）。
         * 输出：是否成功。
         * 功能：校验后恢复；刷新或后台不会重置倒计时。
         */
        restore(raw) {
            if (!raw || !["running", "paused", "resting"].includes(raw.state))
                return false;
            for (const key of ["totalMs", "remainingMs", "deadline", "elapsedMs", "restMs", "restStarted", "activeSince"])
                if (!Number.isFinite(raw[key]) || raw[key] < 0)
                    return false;
            if (raw.totalMs > 43200000 || raw.totalMs < 6000 || raw.remainingMs > raw.totalMs || raw.elapsedMs > raw.totalMs)
                return false;
            // 只恢复验证过的状态字段，拒绝覆盖 clock 或任何方法。
            this.state = raw.state;
            for (const key of ["totalMs", "remainingMs", "deadline", "elapsedMs", "restMs", "restStarted", "activeSince"])
                this[key] = raw[key];
            this.tick();
            return true;
        }
    }
    /**
     * 输入：milliseconds（剩余毫秒）。
     * 输出：mm:ss/h:mm:ss。
     * 功能：以秒向上取整，剩余不到一秒时不提前显示结束。
     */
    function formatTimer(milliseconds) {
        const s = Math.ceil(Math.max(0, milliseconds) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, "0");
        return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
    }
    return { FocusTimer, formatTimer };
})();
