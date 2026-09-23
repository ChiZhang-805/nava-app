/* 393 × 852 竖屏状态栏外观；时间来自设备，信号和电池为装饰图标。 */
(() => {
    "use strict";
    const clock = document.getElementById("system-clock");
    let timer = null;
    /**
     * 输入：date（设备本地 Date，默认当前时刻）。
     * 输出：24 小时制 H:mm 字符串。
     * 功能：读取本地系统时间，不依赖动画时钟或服务器时区。
     */
    function formatTime(date = new Date()) {
        return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
    }
    /**
     * 输入：无，读取设备系统时间及页面可见状态。
     * 输出：无，按需更新 time 元素并预约检查。
     * 功能：跨分钟、修改设备时钟或从后台恢复时同步时间；隐藏页面不轮询。
     */
    function synchronizeClock() {
        // 阶段一：清理旧计时器，避免恢复事件与定时检查叠加。
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (!clock) return;
        const now = new Date(), text = formatTime(now);
        // 阶段二：时间变化才写入 DOM，不触发辅助阅读器连续播报。
        if (clock.textContent !== text) {
            clock.textContent = text;
            clock.dateTime = now.toISOString();
            clock.setAttribute("aria-label", `系统时间 ${text}`);
        }
        // 阶段三：后台停止定时器，恢复后由事件重新同步。
        if (!document.hidden) timer = setTimeout(synchronizeClock, 1000 - now.getMilliseconds() + 8);
    }
    window.addEventListener("pageshow", synchronizeClock);
    window.addEventListener("focus", synchronizeClock);
    document.addEventListener("visibilitychange", synchronizeClock);
    window.addEventListener("pagehide", () => { if (timer !== null) clearTimeout(timer); timer = null; });
    synchronizeClock();
})();
