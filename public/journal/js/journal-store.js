__fluffyModules["journal-store.js"] = (() => {
    "use strict";
    const KEY = "fluffy-six-journal-v1", TASKS_KEY = "fluffy-six-tasks-v1";
    const { validate, category } = __fluffyModules["catalog.js"];
    const Dates = __fluffyModules["sleep-time.js"];
    /**
     * 输入：key、fallback。
     * 输出：解析结果或默认值。
     * 功能：容错读取本机数据，损坏文件不阻断记录。
     */
    function read(key, fallback) {
        return structuredClone(window.NavaJournal.initial.settings[key] ?? fallback);
    }
    /**
     * 输入：key、value。
     * 输出：boolean。
     * 功能：容量或权限不足时明确返回失败，UI 不虚报保存。
     */
    function write(key, value) {
        window.NavaJournal.initial.settings[key]=structuredClone(value);
        window.NavaJournal.call('settings',{key,value}).catch(()=>window.NavaJournal.notify?.('设置未同步，请重试。'));
        return true;
    }
    /**
     * 输入：无。
     * 输出：类别校验后的历史记录。
     * 功能：恢复真实历史，兼容旧版运动记录而不覆盖旧存储。
     */
    function records() {
        const current = window.NavaJournal.initial.records;
        const legacy = [];
        const source = Array.isArray(current) ? current : (Array.isArray(legacy) ? legacy : []).filter(r => r && typeof r === "object").map(r => ({
            id: r.id, category: "sport", data: r, createdAt: r.createdAt, source: r.source || "manual"
        }));
        // 阶段一：旧记录只在内存补出recordDate，不更改真实创建时间或删除历史数据。
        const normalized = [];
        for (const r of source) {
            if (!r || typeof r.id !== "string" || !Number.isFinite(Date.parse(r.createdAt)))
                continue;
            try {
                const recordDate = dateOf(r), checked = validate(r.category, r.data || {}, true, { recordDate });
                if (checked.ok)
                    normalized.push({ ...r, recordDate, data: checked.value });
            }
            catch { /* 损坏的单条记录不会阻断其他记录读取。 */ }
        }
        // 阶段二：按事情发生日排序；今天补记上周，不得挤掉首页最近那天的摘要。
        return sortRecords(normalized);
    }
    /**
     * 输入：record（已确认记录）。
     * 输出：是否成功。
     * 功能：同一 ID 幂等保存，不随动画重播重复添加；不持久化照片或密钥。
     */
    async function save(record) {
        if (!record || typeof record.id !== "string" || !Number.isFinite(Date.parse(record.createdAt)))
            return false;
        const recordDate = dateOf(record);
        if (!Dates.validDate(recordDate) || recordDate > dayKey() || (record.recordDate && !Dates.validDate(record.recordDate)))
            return false;
        const checked = validate(record.category, record.data, true, { recordDate });
        if (!checked.ok)
            return false;
        // 阶段二：乐观并发校验；另一标签页已改过原条目时不能静默覆盖。
        const prior = records().find(r => r.id === record.id);
        if (record.expectedUpdatedAt !== undefined && (!prior || (prior.updatedAt || prior.createdAt) !== record.expectedUpdatedAt))
            return false;
        const changed = prior && (JSON.stringify(prior.data) !== JSON.stringify(checked.value) || dateOf(prior) !== recordDate);
        const revisions = changed ? [...(prior.revisions || []), { data: prior.data, recordDate: dateOf(prior), updatedAt: prior.updatedAt || prior.createdAt }].slice(-8) : prior?.revisions || [];
        const safe = {
            id: record.id, category: record.category, data: checked.value, recordDate, createdAt: record.createdAt, updatedAt: new Date(Math.max(Date.now(), (Date.parse(prior?.updatedAt || prior?.createdAt) || 0) + 1)).toISOString(), source: record.source || "manual", revisions, estimated: Boolean(record.estimated), focus: record.focus || null
        };
        try {
            const saved=await window.NavaJournal.call('save',{record:{...safe,expectedUpdatedAt:record.expectedUpdatedAt},expectedVersion:record.expectedUpdatedAt!==undefined ? prior?.version : null});
            window.NavaJournal.initial.records=sortRecords([saved,...records().filter(item=>item.id!==saved.id)]);
            Object.assign(record,saved);
            return true;
        } catch { return false; }
    }
    /**
     * 输入：id（记录 ID）。
     * 输出：是否删除成功。
     * 功能：用户明确确认后删除一条，不影响其他类别。
     */
    async function remove(id) {
        try { await window.NavaJournal.call('delete',{id});window.NavaJournal.initial.records=records().filter(r=>r.id!==id);return true; }
        catch{return false;}
    }
    /**
     * 输入：date（日期）。
     * 输出：本地日期键。
     * 功能：今日统计使用本地日期，不按 UTC 错分跨夜记录。
     */
    function dayKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    /**
     * 输入：record（新记录或旧记录）。
     * 输出：本地日历日期键。
     * 功能：事情发生日独立于写入时间，兼容原来的睡眠日期。
     */
    function dateOf(record) {
        return Dates.validDate(record.recordDate) || Dates.validDate(record.data?.recordDate) || Dates.validDate(record.data?.wakeDate) || dayKey(new Date(record.createdAt));
    }
    /**
     * 输入：记录数组。
     * 输出：新排序数组。
     * 功能：按记录日倒序、同日按创建时间倒序，不修改调用者数组。
     */
    function sortRecords(list) { return [...list].sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || Date.parse(b.createdAt) - Date.parse(a.createdAt)); }
    /**
     * 输入：list（历史）。
     * 输出：今日类别数、记录总数和陪伴天数。
     * 功能：用真实数据驱动顶部信息条，不创建虚假健康评分。
     */
    function stats(list = records()) {
        const today = dayKey(), days = new Set(list.map(dateOf));
        return {
            today: new Set(list.filter(r => dateOf(r) === today).map(r => r.category)).size, count: list.length, days: days.size, minutes: Math.round(list.filter(r => r.category === "focus").reduce((s, r) => s + (r.focus?.elapsedMs || 0), 0) / 60000)
        };
    }
    /**
     * 输入：无。
     * 输出：有效待办数组。
     * 功能：与完成记录分开保存尚未开始/未勾选完成的任务。
     */
    function tasks() {
        const items = read(TASKS_KEY, []);
        return Array.isArray(items) ? items.filter(t => t && typeof t.id === "string" && validate("focus", t.data || {}).ok).slice(0, 100) : [];
    }
    /**
     * 输入：task（待办）。
     * 输出：成功标记。
     * 功能：同一 ID 更新，不把倒计时结束自动当作完成任务。
     */
    function saveTask(task) {
        return write(TASKS_KEY, [task, ...tasks().filter(t => t.id !== task.id)].slice(0, 100));
    }
    /**
     * 输入：id。
     * 输出：成功标记。
     * 功能：删除选定待办。
     */
    function removeTask(id) {
        return write(TASKS_KEY, tasks().filter(t => t.id !== id));
    }
    return {
        read, write, records, save, remove, dayKey, dateOf, sortRecords, stats, tasks, saveTask, removeTask, KEY, TASKS_KEY
    };
})();
