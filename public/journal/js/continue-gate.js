/* 两秒防误触只控制书写页交互，不控制动画速度，也不显示等待说明。 */
__fluffyModules["continue-gate.js"] = (() => {
    "use strict";
    class ContinueGate {
        /** 输入：clock、delayMs。输出：独立门闩。功能：用单调时间判断交互资格，不以帧数或系统日期计时。 */
        constructor(clock = () => performance.now(), delayMs = 2000) { this.clock=clock; this.delayMs=delayMs; this.epoch=0; this.scene=""; this.press=null; this.locked=false; this.enteredAt=0; }
        /** 输入：scene。输出：无。功能：真正切入场景才重置，两秒后需新的有效点击，不执行提前排队的操作。 */
        enter(scene) { this.scene=scene; this.enteredAt=this.clock(); this.epoch++; this.press=null; this.locked=false; }
        /** 输入：无。输出：boolean。功能：书写页满两秒并且没有正在提交时才允许继续。 */
        ready() { return this.scene === "record" && !this.locked && this.clock()-this.enteredAt >= this.delayMs; }
        /** 输入：source（pointer/key）。输出：无。功能：记录按下时刻和场景，提前按住到两秒后松开仍无效。 */
        down(source = "pointer") { this.press={at:this.clock(), epoch:this.epoch, source}; }
        /** 输入：无。输出：无。功能：取消手势不留下下一次点击的状态。 */
        cancelPress() { this.press=null; }
        /** 输入：无。输出：boolean。功能：点击时复核按下时刻，合法时原子锁定，防双击重复保存。 */
        take() { const p=this.press; this.press=null; if (!this.ready() || p && (p.epoch !== this.epoch || p.at-this.enteredAt < this.delayMs)) return false; this.locked=true; return true; }
        /** 输入：无。输出：无。功能：保存失败允许重新点击，但不撤销已经保存的记录。 */
        unlock() { this.locked=false; }
    }
    return {ContinueGate};
})();
