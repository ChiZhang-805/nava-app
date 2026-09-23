/* 照片回填的字段所有权：只更新未被用户改动的空白/照片字段，不清理历史记录。 */
__fluffyModules["photo-draft.js"] = (() => {
    "use strict";
    /**
     * 输入：当前字段、版本号、上次照片回填的所有权表。
     * 输出：仍属于上一张照片且可安全清空的字段名。
     * 功能：换图/移除时避免把旧图的营养数据当新图结果，同时保留用户修改。
     */
    function staleKeys(values, versions, owned = {}) {
        return Object.keys(owned).filter(key => owned[key].version === versions[key]
            && String(values[key] ?? "") === owned[key].value);
    }
    /**
     * 输入：模型字段、当前值/版本、请求开始版本、照片字段所有权表。
     * 输出：{fields, protectedCount}，只包含允许回填的项目。
     * 功能：保护上传前已有的手动值、请求中的修改及用户主动清空的字段。
     */
    function writable(fields, values, versions, snapshot, owned = {}) {
        const accepted = {}, known = new Set(staleKeys(values, versions, owned));
        let protectedCount = 0;
        for (const [key, value] of Object.entries(fields || {})) {
            if (["__proto__", "constructor", "prototype"].includes(key) || value == null || value === "") continue;
            if (snapshot[key] !== versions[key] || String(values[key] ?? "").trim() && !known.has(key)) {
                protectedCount++;
                continue;
            }
            accepted[key] = value;
        }
        return { fields: accepted, protectedCount };
    }
    /**
     * 输入：实际写入字段、回填后的控件值、版本号、原所有权表。
     * 输出：新的所有权表，不包含图片或密钥。
     * 功能：仅标记真正写入的字段，供下一次换图时安全移除旧结果。
     */
    function remember(fields, values, versions, owned = {}) {
        const result = { ...owned };
        for (const key of Object.keys(fields)) result[key] = { value: String(values[key] ?? ""), version: versions[key] };
        return result;
    }
    return { staleKeys, writable, remember };
})();
