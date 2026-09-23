/* 仅保留白名单阶段/耗时的有界内存诊断。不包含原话、字段值、密钥、图片或供应商错误正文。 */
__fluffyModules["workflow-trace.js"] = (() => {
    "use strict";
    const traces = [], stages = new Set(["dictation","extract","draft","question","done","failed","canceled","local","background"]);
    let serial = 0;
    /** 输入：类别、时钟（可注入）。输出：阶段记录器。功能：在同一逻辑请求里记录真实耗时，避免把各阶段都叫思考。 */
    function begin(category, clock = () => performance.now()) {
        const start = clock(), row = {id:++serial, category:["sport","food","mood","sleep","face","focus"].includes(category) ? category : "unknown", events:[]};
        traces.push(row); if (traces.length > 32) traces.shift();
        let closed = false;
        /** 输入：受控阶段、受控错误码。输出：无。功能：只追加相对毫秒和白名单码，阻止任意原文进入日志。 */
        function mark(stage, code = "") {
            if (closed || !stages.has(stage)) return;
            row.events.push({stage, ms:Math.max(0, Math.round(clock()-start)), code:/^(?:ai|speech|auth|deepseek|save)-[a-z-]{1,24}$/.test(code) ? code : ""});
            if (row.events.length > 12) row.events.shift();
            if (["done","failed","canceled"].includes(stage)) closed = true;
        }
        return {id:row.id, mark};
    }
    /** 输入：无。输出：不含敏感内容的诊断副本。功能：调试时分清听写、模型与回填耗时，不写浏览器持久存储。 */
    function read() { return JSON.parse(JSON.stringify(traces)); }
    // 生产页面只公开只读的非敏感快照，不暴露写入器或原始AI数据。
    if (typeof window !== "undefined") window.FluffyWorkflowDiagnostics = Object.freeze({snapshot:read});
    return {begin, read};
})();
