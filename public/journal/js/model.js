__fluffyModules["model.js"] = (() => {
const LIMITS = Object.freeze({ activity: 40, notes: 32 });
/**
 * 输入：value（任意用户文本）。
 * 输出：去除首尾空格和控制字符的字符串。
 * 功能：规范化显示文本；不解析 HTML，也不静默编造内容。
 */
function cleanText(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}
/**
 * 输入：value（文本）。
 * 输出：用户可见字符数组。
 * 功能：为手写排版保留完整的汉字和组合字符。
 */
function graphemes(value) {
    if (typeof Intl.Segmenter === "function") return [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(String(value))].map(item => item.segment);
    return Array.from(String(value));
}
/**
 * 输入：value（数值或输入框字符串）。
 * 输出：有限非负数，空值/无效文本为 null。
 * 功能：只接受整数或十进制小数，不接受指数、单位、负数和 NaN。
 */
function decimalNumber(value) {
    const text = String(value ?? "").trim().replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 65296)).replace(/．/g, ".");
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) && number <= 1e8 ? number : null;
}
/**
 * 输入：raw（四个字段），strict（是否要求全部填写）。
 * 输出：{ok,errors,value}，包含规范化字段和可读的校验结果。
 * 功能：手动提交要求四项齐全；AI 未提及的字段仍允许留空等待用户补充。
 */
function validateRecord(raw, strict = true) {
    // 阶段一：按字段解析，空白与数值零分别处理。
    const activity = cleanText(raw.activity), notes = cleanText(raw.notes);
    const distanceKm = decimalNumber(raw.distanceKm), durationMinutes = decimalNumber(raw.durationMinutes);
    const errors = {};
    if (strict && !activity) errors.activity = "先告诉我做了什么运动。";
    if (activity.length > LIMITS.activity) errors.activity = "运动项目请控制在 40 个字以内。";
    if ((strict || cleanText(raw.distanceKm)) && distanceKm == null) errors.distanceKm = "距离请填写数字，单位是 km。";
    if ((strict || cleanText(raw.durationMinutes)) && (durationMinutes == null || durationMinutes <= 0)) errors.durationMinutes = "时长请填写大于 0 的数字，单位是分钟。";
    if (strict && !notes) errors.notes = "再留下一句话备注吧。";
    if (notes.length > LIMITS.notes) errors.notes = "备注请控制在 32 个字以内。";
    // 阶段二：只返回声明过的字段，禁止把模型附加内容写进界面或状态。
    return { ok: Object.keys(errors).length === 0, errors, value: { activity, distanceKm, durationMinutes, notes } };
}
/**
 * 输入：record（当前记录）。
 * 输出：供动画使用的三行文字。
 * 功能：距离与项目同行，分钟保留小数；缺失信息不编造。
 */
function displayRows(record) {
    return [
        { label: "Activity", value: (record.activity || "—") + (record.distanceKm == null ? "" : ` · ${record.distanceKm} km`) },
        { label: "Time", value: record.durationMinutes == null ? "—" : `${record.durationMinutes} min` },
        { label: "Notes", value: record.notes || "—" }
    ];
}
/**
 * 输入：field（字段名），snapshot/current（请求开始与当前的版本映射）。
 * 输出：是否允许应用此字段的模型结果。
 * 功能：请求期间用户修改过的字段优先，迟到的 AI 响应不得覆盖。
 */
function mayApplyField(field, snapshot, current) { return snapshot[field] === current[field]; }
/**
 * 输入：rowIndex（行序号），offset（累计偏移），pitch（行高）。
 * 输出：该行在三圈中的连续位置。
 * 功能：形成首尾衔接的循环内页；字迹完成度始终跟随逻辑行。
 */
function circularPositions(rowIndex, offset, pitch = 90) {
    const period = pitch * 3, wrapped = ((rowIndex * pitch + offset) % period + period) % period;
    return [wrapped - period, wrapped, wrapped + period];
}
/**
 * 输入：payload（模型解析后的 JSON）。
 * 输出：规范化 AI 草稿和需要用户核对的警告。
 * 功能：验证响应类型，拒绝不明确数值；不让合法 JSON 被误当成准确事实。
 */
function parseDraft(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error("小猫收到的结果格式不对，请重试。");
    const fields = {};
    for (const key of ["activity", "notes"]) {
        const value = payload[key];
        if (value != null && typeof value !== "string") throw Error("返回的文字字段无效，请重试。");
        fields[key] = cleanText(value);
    }
    for (const key of ["distanceKm", "durationMinutes"]) {
        const value = payload[key];
        if (value != null && typeof value !== "number" && typeof value !== "string") throw Error("返回的数字字段无效，请重试。");
        fields[key] = value == null || value === "" ? null : decimalNumber(value);
        if (value != null && value !== "" && fields[key] == null) throw Error("小猫没能准确整理数字，请重试或自己填写。");
    }
    const checked = validateRecord(fields, false);
    if (!checked.ok) throw Error(Object.values(checked.errors)[0]);
    const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter(item => typeof item === "string").map(cleanText).slice(0, 4) : [];
    return { record: checked.value, warnings };
}

return {LIMITS,cleanText,graphemes,decimalNumber,validateRecord,displayRows,mayApplyField,circularPositions,parseDraft};
})();
