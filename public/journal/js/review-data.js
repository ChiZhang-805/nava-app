/* 回顾数据与评分：只读取用户已确认记录。确定性规则不等同于医疗评价，也不让模型编造分数。 */
__fluffyModules["review-data.js"] = (() => {
    "use strict";
    const C = __fluffyModules["catalog.js"], S = __fluffyModules["journal-store.js"];
    const GOALS_KEY = "fluffy-review-goals-v1";
    const META = {
        sport: { zh: "运动回顾", en: "Workout review", color: "#65b88c", pale: "#edf7ef", icon: "sport" },
        sleep: { zh: "睡眠回顾", en: "Sleep review", color: "#9995e8", pale: "#f2f0fc", icon: "sleep" },
        food: { zh: "饮食回顾", en: "Meal review", color: "#d5a763", pale: "#fcf5e9", icon: "food" },
        mood: { zh: "情绪回顾", en: "Mood review", color: "#82b6d6", pale: "#eef7fc", icon: "mood" },
        face: { zh: "面部回顾", en: "Daily check-in", color: "#83bebe", pale: "#ecf7f6", icon: "face" },
        focus: { zh: "专注回顾", en: "Focus review", color: "#779dc7", pale: "#edf3fa", icon: "focus" }
    };
    /**
     * 输入：value（任意值）。
     * 输出：有限非负数字或 null。
     * 功能：未知值不伪装成零。
     */
    function number(value) { return value === "" || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value); }
    /**
     * 输入：记录。
     * 输出：本地 YYYY-MM-DD。
     * 功能：六类都按用户选定的记录日归组，写入时间仅用于同日排序。
     */
    function dateOf(record) { return S.dateOf(record); }
    /**
     * 输入：日期、日偏移。
     * 输出：本地日期键。
     * 功能：日历算术跨月跨年，不按固定24小时跨夏令时。
     */
    function shiftDate(key, offset) { const [y, m, d] = key.split("-").map(Number); return S.dayKey(new Date(y, m - 1, d + offset, 12)); }
    /**
     * 输入：可选任意目标。
     * 输出：经校验的目标。
     * 功能：公开默认值并容错恢复用户设置，不改变记录。
     */
    function goals(raw = S.read(GOALS_KEY, {})) { return { sport: number(raw.sport) >= 1 && raw.sport <= 1440 ? Number(raw.sport) : 30, sleep: number(raw.sleep) >= 1 && raw.sleep <= 16 ? Number(raw.sleep) : 8 }; }
    /**
     * 输入：目标对象。
     * 输出：持久化成功标记。
     * 功能：只存目标偏好，不改历史数据。
     */
    function saveGoals(value) { return S.write(GOALS_KEY, goals(value)); }
    /**
     * 输入：数值。
     * 输出：最多一位小数的字符串。
     * 功能：避免浮点尾数与过长指标破坏布局。
     */
    function format(value) { return value == null ? "—" : String(Math.round(value * 10) / 10); }
    /**
     * 输入：非负分子与正分母。
     * 输出：0..100分或null。
     * 功能：透明且有界的完成比例，不奖励超额。
     */
    function ratio(value, target) { return value == null || !Number.isFinite(target) || target <= 0 ? null : Math.min(100, Math.max(0, Math.round(value / target * 100))); }
    /**
     * 输入：一天的记录与字段名。
     * 输出：已填写数值的和或null。
     * 功能：部分记录缺数据时只累计已知项。
     */
    function sum(list, key) { const values = list.map(r => number(r.data[key])).filter(v => v != null); return values.length ? values.reduce((a, b) => a + b, 0) : null; }
    /**
     * 输入：记录和字段列表。
     * 输出：0..100完整分。
     * 功能：衡量记录覆盖，而非食物健康、疲劳或外貌。
     */
    function coverage(list, fields) {
        if (!list.length)
            return null;
        const count = list.reduce((n, r) => n + fields.filter(k => r.data[k] != null && String(r.data[k]).trim() !== "").length, 0);
        return Math.round(count / (list.length * fields.length) * 100);
    }
    /**
     * 输入：同一记录日的睡眠条目。
     * 输出：{hours,segments,overlaps}，只累计可确定的时间区间。
     * 功能：夜间与午睡可并存；重叠段取并集，避免把同一段睡眠重复累加。
     */
    function sleepTotal(list) {
        const intervals = list.map(r => {
            const d = r.data, endDay = d.wakeDate || S.dateOf(r), startDay = d.bedDate || (d.bedtime > d.wakeTime ? shiftDate(endDay, -1) : endDay);
            const start = Date.parse(`${startDay}T${d.bedtime}`), end = Date.parse(`${endDay}T${d.wakeTime}`);
            return { start, end };
        }).filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start).sort((a, b) => a.start - b.start);
        let total = 0, current = null, overlaps = false;
        for (const part of intervals) {
            if (!current) {
                current = { ...part };
                continue;
            }
            if (part.start < current.end) {
                overlaps = true;
                current.end = Math.max(current.end, part.end);
            }
            else {
                total += current.end - current.start;
                current = { ...part };
            }
        }
        if (current)
            total += current.end - current.start;
        return { hours: intervals.length ? total / 3600000 : null, segments: intervals.length, overlaps };
    }
    /**
     * 输入：类别、一天的确认记录、目标。
     * 输出：确定性日汇总。
     * 功能：不同板块使用合适指标，情绪不作好坏排序。
     */
    function daily(id, list, target) {
        // 阶段一：同日排序并处理缺失。空白日与实际零分分开。
        const sorted = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), last = sorted.at(-1), data = last?.data || {};
        const base = { count: list.length, score: null, scoreKind: "", value: null, unit: "", text: "", detail: "", data, last };
        if (!last)
            return base;
        // 阶段二：只计算已知事实，不用预期时长冒充实际专注，不以热量多少判断饮食好坏。
        if (id === "sport")
            return { ...base, value: sum(list, "durationMinutes"), score: ratio(sum(list, "durationMinutes"), target.sport), scoreKind: "goal", unit: "min", text: data.activity, detail: data.notes || "" };
        if (id === "sleep") {
            const sleep = sleepTotal(list);
            return { ...base, value: sleep.hours, score: sleep.hours == null ? null : Math.round(Math.max(0, 1 - Math.abs(sleep.hours - target.sleep) / target.sleep) * 100), scoreKind: "sleepGoal", unit: "h", text: data.quality, detail: [...new Set(sorted.map(r => `${r.data.bedtime || "—"} — ${r.data.wakeTime || "—"}`))].join(" · "), sleep };
        }
        if (id === "focus") {
            const timed = list.filter(r => number(r.focus?.elapsedMs) != null), actual = timed.length ? timed.reduce((s, r) => s + Number(r.focus.elapsedMs) / 60000, 0) : null;
            // 原计时计划独立保存；修改实际用时不把它当成原计划，旧记录才回退兼容字段。
            const planned = timed.reduce((s, r) => s + (Object.prototype.hasOwnProperty.call(r.focus, "plannedMs") ? (number(r.focus.plannedMs) || 0) / 60000 : number(r.data.durationMinutes) || 0), 0);
            return { ...base, value: actual, score: timed.some(r => r.focus.provenance === "self-reported") ? null : ratio(actual, planned), scoreKind: "focusGoal", unit: "min", text: data.task, detail: data.notes || "", planned, restMinutes: timed.reduce((s, r) => s + (number(r.focus.restMs) || 0) / 60000, 0) };
        }
        if (id === "food")
            return { ...base, value: sum(list, "calories"), score: coverage(list, ["meal", "foods", "portion", "calories", "protein", "carbs", "fat"]), scoreKind: "coverage", unit: "kcal", text: data.foods, detail: data.meal, macros: { protein: sum(list, "protein"), carbs: sum(list, "carbs"), fat: sum(list, "fat") } };
        if (id === "face")
            return { ...base, value: list.length, score: coverage(list, ["feeling", "eyeArea", "skinAppearance"]), scoreKind: "observation", unit: "entries", text: data.feeling, detail: data.eyeArea || data.skinAppearance || "" };
        return { ...base, value: list.length, text: data.mood, detail: data.reason || data.notes || "" };
    }
    /**
     * 输入：类别、截止日期、确认记录、目标。
     * 输出：独立的7天回顾视图。
     * 功能：保持视图只读、去重、排除未来与其他类别。
     */
    function build(id, date, records = S.records(), target = goals()) {
        C.category(id);
        const end = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : S.dayKey();
        const start = shiftDate(end, -6), seen = new Set();
        const relevant = records.filter(r => {
            if (!r || r.category !== id || seen.has(r.id) || !Number.isFinite(Date.parse(r.createdAt)))
                return false;
            const key = dateOf(r);
            if (key < start || key > end)
                return false;
            seen.add(r.id);
            return true;
        });
        relevant.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        const week = Array.from({ length: 7 }, (_, i) => { const key = shiftDate(end, i - 6); return { date: key, ...daily(id, relevant.filter(r => dateOf(r) === key), target) }; });
        return { id, date: end, today: week[6], week, goals: { ...target }, records: relevant, meta: META[id] };
    }
    /**
     * 输入：回顾快照。
     * 输出：供模型读取的最少必要资料。
     * 功能：不发送其他板块、原图、密钥、记录ID或未确认表单。
     */
    function context(view) {
        return { category: view.id, date: view.date, deviceDate: S.dayKey(), historical: view.date !== S.dayKey(), scoring: { type: view.today.scoreKind || "none", score: view.today.score, goals: ["sport", "sleep"].includes(view.id) ? { [view.id]: view.goals[view.id] } : undefined, meaning: "Personal target / record coverage only; not health, mood or beauty assessment" },
            weekly: view.week.map(d => ({ date: d.date, entries: d.count, value: d.value, unit: d.unit, score: d.score, confirmedFeeling: view.id === "mood" ? d.text : undefined })),
            confirmedRecords: view.records.slice(-30).map(r => ({ date: dateOf(r), fields: Object.fromEntries([...C.category(view.id).fields.map(f => f.key), ...(view.id === "sleep" ? ["hours", "recordDate", "bedDate", "wakeDate"] : [])].filter(k => r.data[k] != null).map(k => [k, typeof r.data[k] === "string" ? r.data[k].slice(0, 600) : r.data[k]])), actualFocus: r.focus ? { elapsedMs: r.focus.elapsedMs, restMs: r.focus.restMs, plannedMs: r.focus.plannedMs, provenance: r.focus.provenance || "timer" } : undefined })) };
    }
    return { META, GOALS_KEY, number, dateOf, shiftDate, goals, saveGoals, format, ratio, sleepTotal, daily, build, context };
})();
