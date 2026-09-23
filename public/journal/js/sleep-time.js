/* 睡眠的本地日历与时分语义；不依赖模型计算日期，不把本地午夜转成 UTC 日期。 */
__fluffyModules["sleep-time.js"] = (() => {
    "use strict";
    /**
     * 输入：date（Date）。
     * 输出：YYYY-MM-DD。
     * 功能：读取设备所在时区的日历日期。
     */
    function dateKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    /**
     * 输入：value（日期字符串）。
     * 输出：合法日期或空串。
     * 功能：拒绝 2 月 30 日等自动进位的伪日期。
     */
    function validDate(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
        if (!m)
            return "";
        const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
        return dateKey(d) === value ? value : "";
    }
    /**
     * 输入：key（日期）、days（整天偏移）。
     * 输出：日期。
     * 功能：按日历加减天数，兼容夏令时的非24小时日。
     */
    function addDays(key, days) {
        if (!validDate(key))
            throw Error("记录日期无效。");
        const [y, m, d] = key.split("-").map(Number), date = new Date(y, m - 1, d, 12);
        date.setDate(date.getDate() + days);
        return dateKey(date);
    }
    /**
     * 输入：value（时分或旧版完整时间）。
     * 输出：HH:mm 或空串。
     * 功能：兼容旧记录并规范半角/全角时间。
     */
    function clock(value) {
        const t = String(value || "").trim().replace(/[０-９]/g, c => String(c.charCodeAt(0) - 65296)).replace(/：/g, ":");
        const m = /^(?:\d{4}-\d{2}-\d{2}T)?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(t);
        return m && +m[1] < 24 && +m[2] < 60 ? `${String(+m[1]).padStart(2, "0")}:${m[2]}` : "";
    }
    /**
     * 输入：日期与 HH:mm。
     * 输出：本地 Date。
     * 功能：拒绝夏令时跳过的时间，而不是悄悄改到下一小时。
     */
    function localMoment(day, time) {
        const [y, m, d] = day.split("-").map(Number), [h, minute] = time.split(":").map(Number);
        const result = new Date(y, m - 1, d, h, minute);
        if (dateKey(result) !== day || result.getHours() !== h || result.getMinutes() !== minute)
            throw Error("这个时间在本地时区不存在，请确认时分。");
        return result;
    }
    /**
     * 输入：raw（bedtime、wakeTime，可附 bedDate/wakeDate）、context（recordDate，默认设备当天）。
     * 输出：{ok,value,errors}，value 同时保留显示用时分、真实日期及睡眠小时数。
     * 功能：默认以记录日的醒来为锚点，23→07跨昨天、01→07留在当天；显式日期优先。
     */
    function resolve(raw, context = {}) {
        const bedtime = clock(raw.bedtime), wakeTime = clock(raw.wakeTime), errors = {};
        if (!bedtime)
            errors.bedtime = "入睡时间请填写 24 小时制时分。";
        if (!wakeTime)
            errors.wakeTime = "醒来时间请填写 24 小时制时分。";
        for (const [dateField, timeField] of [["bedDate", "bedtime"], ["wakeDate", "wakeTime"]]) {
            const explicit = raw[dateField] || (String(raw[timeField]).includes("T") ? String(raw[timeField]).split("T")[0] : "");
            if (explicit && !validDate(explicit))
                errors[timeField] = "记录日期无效，请确认这条历史记录。";
        }
        if (Object.keys(errors).length)
            return { ok: false, value: {}, errors };
        // 阶段一：历史记录自带的日历日期优先，普通输入只需要两个时分。
        const recordDate = validDate(context.recordDate) || dateKey();
        let wakeDate = validDate(raw.wakeDate) || validDate(String(raw.wakeTime).split("T")[0]) || recordDate;
        let bedDate = validDate(raw.bedDate) || validDate(String(raw.bedtime).split("T")[0]);
        if (!bedDate)
            bedDate = bedtime > wakeTime ? addDays(wakeDate, -1) : wakeDate;
        // 阶段二：按本地时间计算真实时长，零时长和超过一天不猜成正常的一晚。
        let start, end, hours;
        try {
            start = localMoment(bedDate, bedtime);
            end = localMoment(wakeDate, wakeTime);
            hours = (end.getTime() - start.getTime()) / 3600000;
            if (hours <= 0 || hours > 24)
                errors.wakeTime = "请确认起止时间；本次睡眠应大于 0 且不超过 24 小时。";
        }
        catch (e) {
            errors.wakeTime = e.message;
        }
        return { ok: !Object.keys(errors).length, errors, value: {
                bedtime, wakeTime, bedDate, wakeDate, recordDate: wakeDate,
                hours: Number.isFinite(hours) ? Math.round(hours * 100) / 100 : null,
                startedAt: start?.toISOString(), endedAt: end?.toISOString()
            } };
    }
    /**
     * 输入：中文/阿拉伯整数。
     * 输出：数字或 NaN。
     * 功能：解析口述的十一、二十三、两点等时分。
     */
    function spokenNumber(value) {
        if (/^\d+$/.test(value))
            return Number(value);
        const map = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
        if (value === "十")
            return 10;
        if (value.includes("十")) {
            const [a, b] = value.split("十");
            return (a ? map[a] : 1) * 10 + (b ? map[b] : 0);
        }
        return [...value].every(c => Object.hasOwn(map, c)) ? Number([...value].map(c => map[c]).join("")) : NaN;
    }
    /**
     * 输入：时刻前的语句片段。
     * 输出：明确日期偏移或 null。
     * 功能：识别昨天/前天/今天，不把昨晚当成当前午夜之后。
     */
    function dayOffset(prefix) {
        const matches = [...prefix.matchAll(/前天|前晚|昨天|昨晚|昨夜|今早|今天|今晚|今晨|今夜|明天|明早/g)];
        const word = matches.at(-1)?.[0];
        return !word ? null : /前/.test(word) ? -2 : /昨/.test(word) ? -1 : /明/.test(word) ? 1 : 0;
    }
    /**
     * 输入：原话、context（recordDate）。
     * 输出：时分字段、显式日历字段、核对项。
     * 功能：提取睡眠语义，避免仅靠数字大小误判上午/晚上。
     */
    function fromSpeech(text, context = {}) {
        const input = String(text || "").replace(/：/g, ":").replace(/[０-９]/g, c => String(c.charCodeAt(0) - 65296));
        const re = /([零〇一二两三四五六七八九十\d]{1,3})(?::([0-9]{1,2})|[点时](?!间|长)(?:(半|一刻|二刻|三刻)|([零〇一二两三四五六七八九十\d]{1,3})分?)?)/g;
        const matches = [...input.matchAll(re)].filter(m => !/小$/.test(input.slice(Math.max(0, m.index - 1), m.index)));
        if (matches.length < 2)
            return { fields: {}, dates: {}, warnings: [] };
        if (matches.length > 2)
            return { fields: {}, dates: {}, warnings: ["听到了多组时间，请确认这次的入睡和醒来时间。"] };
        // 阶段一：保留“上午/下午/夜间”等修饰语，识别半点与一刻，不仅抽数字。
        const parsed = matches.map((m, i) => {
            const prefix = input.slice(i ? matches[i - 1].index + matches[i - 1][0].length : 0, m.index);
            let h = spokenNumber(m[1]), min = m[2] ? +m[2] : m[4] ? spokenNumber(m[4]) : m[3] === "半" ? 30 : m[3] ? ({ 一刻: 15, 二刻: 30, 三刻: 45 }[m[3]] ?? NaN) : 0;
            const periods = [...prefix.matchAll(/下午|傍晚|晚上|晚间|夜里|夜间|昨晚|昨夜|今晚|前晚|凌晨|清晨|早上|上午|今早|今晨|半夜|中午/g)];
            const period = periods.at(-1)?.[0] || "";
            const night = /晚上|晚间|夜里|夜间|昨晚|昨夜|今晚|前晚/.test(period);
            const pm = /下午|傍晚/.test(period);
            const am = /凌晨|清晨|早上|上午|今早|今晨|半夜/.test(period);
            const explicit = Boolean(period) || h > 12 || Boolean(m[2]);
            let offset = dayOffset(prefix);
            // “昨晚凌晨一点”指该夜跨午夜之后；“昨天凌晨一点”仍严格是昨天。
            const afterMidnight = (night && (h === 12 || h < 6)) || (am && h < 6 && /昨晚|昨夜|前晚|今晚/.test(prefix));
            if (night) {
                if (h === 12)
                    h = 0;
                else if (h >= 6 && h < 12)
                    h += 12;
            }
            else if (pm && h < 12)
                h += 12;
            else if (h === 12 && am)
                h = 0;
            else if (period === "中午" && h < 4)
                h += 12;
            if (afterMidnight && offset !== null)
                offset += 1;
            return { h, min, explicit, offset, prefix, afternoon: pm || period === "中午" };
        });
        // 阶段二：“11点到7点”在夜间睡眠上下文中按23→07；显式午睡或时制绝不覆盖。
        const [bed, wake] = parsed;
        const nap = /午睡|小睡|白天/.test(input);
        if (!wake.explicit && (nap || bed.afternoon) && bed.h >= 12 && wake.h >= 1 && wake.h < 12)
            wake.h += 12;
        if (!bed.explicit && !nap && wake.h <= 12 && bed.h >= 8 && bed.h <= 11)
            bed.h += 12;
        if (!bed.explicit && !nap && bed.h === 12 && wake.h < 12)
            bed.h = 0;
        if (parsed.some(v => !Number.isFinite(v.h) || !Number.isFinite(v.min) || v.h < 0 || v.h > 23 || v.min < 0 || v.min > 59))
            return { fields: {}, dates: {}, warnings: ["请确认刚才说的时分。"] };
        const fmt = v => `${String(v.h).padStart(2, "0")}:${String(v.min).padStart(2, "0")}`;
        const fields = { bedtime: fmt(bed), wakeTime: fmt(wake) }, dates = {}, anchor = validDate(context.recordDate) || dateKey();
        if (bed.offset !== null)
            dates.bedDate = addDays(anchor, bed.offset);
        if (wake.offset !== null)
            dates.wakeDate = addDays(anchor, wake.offset);
        if (dates.bedDate && !dates.wakeDate)
            dates.wakeDate = fields.bedtime > fields.wakeTime ? addDays(dates.bedDate, 1) : dates.bedDate;
        const checked = resolve({ ...fields, ...dates }, { recordDate: anchor });
        return checked.ok ? { fields, dates, warnings: [] } : { fields, dates, warnings: Object.values(checked.errors) };
    }
    return { dateKey, validDate, addDays, clock, localMoment, resolve, fromSpeech, spokenNumber };
})();
