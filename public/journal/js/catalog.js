/* 六类记录的唯一字段定义；界面、AI 草稿、校验、历史摘要共用同一个模型。 */
__fluffyModules["catalog.js"] = (() => {
    "use strict";
    const { cleanText, decimalNumber } = __fluffyModules["model.js"];
    const Sleep = __fluffyModules["sleep-time.js"];
    const CATEGORIES = Object.freeze({
        mood: {
            name: "情绪", en: "Mood", title: "今天的心情，讲给我听。", greeting: "心情慢慢讲呀\n我会好好听的", icon: "mood", tone: "blue", fields: [
                {
                    key: "mood", label: "现在的心情", placeholder: "例如：有点失落，但也松了一口气", max: 60, required: true
                },
                {
                    key: "reason", label: "发生了什么", placeholder: "例如：完成了一件挂心的事", max: 60
                },
                {
                    key: "notes", type: "textarea", label: "留给自己一句话", placeholder: "我想对自己说…", max: 32
                }
            ]
        },
        food: {
            name: "饮食", en: "Meal", title: "今天的美味，记下来吧。", greeting: "拍下这份美味\n一起好好记下", icon: "food", tone: "light", photo: true, fields: [
                {
                    key: "meal", label: "哪一餐", type: "choice", options: ["早餐", "午餐", "晚餐", "加餐"], required: true
                },
                {
                    key: "foods", label: "吃了什么", placeholder: "例如：米饭、鸡胸肉和西兰花", max: 60, required: true
                },
                {
                    key: "portion", label: "大概份量", placeholder: "例如：米饭半碗，鸡胸肉约 100 g", max: 50
                },
                {
                    key: "notes", type: "textarea", label: "一句话备注", placeholder: "慢慢吃，好好照顾自己。", max: 32
                },
                {
                    key: "calories", label: "热量", type: "decimal", unit: "kcal", maxValue: 15000, group: "nutrition"
                },
                {
                    key: "protein", label: "蛋白质", type: "decimal", unit: "g", maxValue: 2000, group: "nutrition"
                },
                {
                    key: "carbs", label: "碳水化合物", type: "decimal", unit: "g", maxValue: 2000, group: "nutrition"
                },
                {
                    key: "fat", label: "脂肪", type: "decimal", unit: "g", maxValue: 2000, group: "nutrition"
                }
            ]
        },
        focus: {
            name: "专注", en: "Focus", title: "这一小段时间，留给你。", greeting: "现在就开始吧\n我在旁边陪你", icon: "focus", tone: "light", fields: [
                {
                    key: "task", label: "想专注做什么", placeholder: "例如：读完论文的方法部分", max: 60, required: true
                },
                {
                    key: "durationMinutes", label: "预计时间", type: "decimal", unit: "分钟", placeholder: "25", minValue: .1, maxValue: 720, required: true, estimate: true
                },
                {
                    key: "notes", type: "textarea", label: "希望做到哪一步", placeholder: "把目标写得小一点、具体一点。", max: 60
                }
            ]
        },
        sport: {
            name: "运动", en: "Workout", title: "今天的运动，讲给我听。", greeting: "每一步的努力\n我都帮你记下", icon: "sport", tone: "blue", fields: [
                {
                    key: "activity", label: "运动项目", placeholder: "例如：跑步", max: 40, required: true
                },
                {
                    key: "durationMinutes", label: "时长", type: "decimal", unit: "分钟", placeholder: "30", minValue: .01, maxValue: 1440, required: true
                },
                {
                    key: "notes", type: "textarea", label: "备注", placeholder: "例如：跑了 5 公里，或练了 4 组深蹲", max: 60, required: true
                }
            ]
        },
        sleep: {
            name: "睡眠", en: "Sleep", title: "昨晚，睡得还好吗？", greeting: "昨晚睡得怎样\n慢慢讲给我听", icon: "sleep", tone: "light", fields: [
                {
                    key: "bedtime", label: "入睡时间", type: "time", required: true
                },
                {
                    key: "wakeTime", label: "醒来时间", type: "time", required: true
                },
                {
                    key: "quality", label: "醒来的感受", placeholder: "例如：还有点困，但比昨天精神", max: 60, required: true
                },
                {
                    key: "notes", type: "textarea", label: "一句话备注", placeholder: "例如：中途醒过一次", max: 32
                }
            ]
        },
        face: {
            name: "面部", en: "Check-in", title: "今天的状态，轻轻看看。", greeting: "把今天的模样\n轻轻留在这里", icon: "face", tone: "blue", photo: true, fields: [
                {
                    key: "feeling", label: "自己的感受", placeholder: "例如：有点困，但精神还好", max: 40, required: true
                },
                {
                    key: "eyeArea", label: "眼周观察", placeholder: "自己填写，或拍照后整理", max: 50
                },
                {
                    key: "skinAppearance", label: "皮肤外观", placeholder: "例如：局部泛红、光照偏暗", max: 60
                },
                {
                    key: "notes", type: "textarea", label: "一句话备注", placeholder: "还有什么想记下来？", max: 32
                }
            ]
        }
    });
    const DEFAULT_ORDER = ["mood", "food", "focus", "sport", "sleep", "face"];
    /**
     * 输入：id（类别）。
     * 输出：字段配置。
     * 功能：安全获取类别，未知值不当成运动记录。
     */
    function category(id) {
        if (!Object.hasOwn(CATEGORIES, id))
            throw Error("找不到这个记录入口。");
        return CATEGORIES[id];
    }
    /**
     * 输入：raw（新表单或旧运动数据，不修改原对象）。
     * 输出：距离已合并到备注的副本。
     * 功能：取消独立距离字段但保留历史公里数；反复读取/编辑不会重复追加。
     */
    function sportData(raw = {}) {
        const next = { ...raw }, km = decimalNumber(raw.distanceKm);
        if (km === null || km < 0 || km > 2000) return next;
        const notes = cleanText(raw.notes);
        // 阶段一：识别备注中已写的等值公里或米，避免迁移时复制同一信息。
        const distances = [...notes.matchAll(/(\d+(?:\.\d+)?)\s*(公里|千米|km|米|m)(?![a-z])/gi)];
        const mentioned = distances.some(match => Math.abs(Number(match[1]) / (/^(米|m)$/i.test(match[2]) ? 1000 : 1) - km) < 1e-8);
        // 阶段二：未写出的旧距离作为备注补充，不清空用户原来的感受或训练信息。
        if (!mentioned) next.notes = `${notes}${notes ? "；" : ""}距离 ${km} 公里`;
        return next;
    }
    /**
     * 输入：id、raw（用户输入）、strict（是否提交校验）。
     * 输出：{ok,value,errors}。
     * 功能：统一校验数字、长度、选项及跨日睡眠。
     */
    function validate(id, raw, strict = true, context = {}) {
        if (id === "sport") raw = sportData(raw);
        const def = category(id), value = {}, errors = {};
        // 阶段一：仅处理白名单字段，不将 API 附加字段直接保存或插入 HTML。
        for (const field of def.fields) {
            const text = cleanText(raw[field.key]);
            if (field.type === "decimal") {
                const n = decimalNumber(text);
                value[field.key] = n;
                if ((text || (strict && field.required)) && (n === null || n < (field.minValue ?? field.min ?? 0) || n > (field.maxValue ?? field.max ?? 100000)))
                    errors[field.key] = `${field.label}请填写有效数字。`;
            }
            else {
                value[field.key] = text;
                if (strict && field.required && !text)
                    errors[field.key] = `先填一下${field.label}。`;
                if (text.length > (field.max || 100))
                    errors[field.key] = `${field.label}请写得简短一点。`;
                if (text && field.options && !field.options.includes(text))
                    errors[field.key] = `请选择${field.label}。`;
                if (field.type === "time") {
                    value[field.key] = text ? Sleep.clock(text) : "";
                    if (text && !value[field.key])
                        errors[field.key] = "请填写有效的 24 小时制时分。";
                }
            }
        }
        // 阶段二：只显示时分；日期取记录日，历史记录与语音显式日期单独保留。
        if (id === "sleep" && value.bedtime && value.wakeTime && !errors.bedtime && !errors.wakeTime) {
            const resolved = Sleep.resolve({ ...raw, ...value, bedDate: raw.bedDate || (String(raw.bedtime).includes("T") ? String(raw.bedtime).split("T")[0] : ""), wakeDate: raw.wakeDate || (String(raw.wakeTime).includes("T") ? String(raw.wakeTime).split("T")[0] : "") }, context);
            Object.assign(errors, resolved.errors);
            if (resolved.ok)
                Object.assign(value, resolved.value);
        }
        return { ok: !Object.keys(errors).length, value, errors };
    }
    /**
     * 输入：s（日期时间字符串）。
     * 输出：HH:mm 或空串。
     * 功能：显示时分，保留存储中的完整日期。
     */
    function shortTime(s) {
        return Sleep.clock(s);
    }
    /**
     * 输入：record（已校验、已确认的记录）。
     * 输出：完整笔记字段数组，数量不限于三项。
     * 功能：所有已确认信息进入书写及完成后的阅读；未知营养值保留空缺，不生成新数值。
     */
    function rows(record) {
        const id = record.category, v = id === "sport" ? sportData(record.data) : record.data;
        // 阶段一：保留原字段顺序；运动继续项目、时长、备注三项。
        if (id === "sport")
            return [{ label: "Activity", value: v.activity || "—" }, { label: "Time", value: `${v.durationMinutes} min` }, { label: "Notes", value: v.notes || "—" }];
        // 阶段二：饮食的份量和四个营养值各自成项，不再摘要掉碳水与脂肪。
        if (id === "food")
            return [{ label: v.meal || "Meal", value: v.foods || "—" },
                { label: "Portion", value: v.portion || "—" },
                ...[["Calories", "calories", "kcal"], ["Protein", "protein", "g"], ["Carbs", "carbs", "g"], ["Fat", "fat", "g"]]
                    .map(([label, key, unit]) => ({ label, value: v[key] == null || v[key] === "" ? "—" : `${v[key]} ${unit}` })),
                { label: "Notes", value: v.notes || "—" }];
        if (id === "mood")
            return [{ label: "Feeling", value: v.mood || "—" }, { label: "Moment", value: v.reason || "—" }, { label: "Notes", value: v.notes || "未填写备注" }];
        if (id === "sleep")
            return [{ label: "Sleep", value: `${shortTime(v.bedtime)} → ${shortTime(v.wakeTime)}` },
                { label: "Duration", value: v.hours == null ? "—" : `${v.hours} h` },
                { label: "Feeling", value: v.quality || "—" }, { label: "Notes", value: v.notes || "—" }];
        // 阶段三：面部同时展示眼周与皮肤，不再用二选一的 Observation 丢弃另一项。
        if (id === "face")
            return [{ label: "My feeling", value: v.feeling || "—" }, { label: "Eye area", value: v.eyeArea || "—" },
                { label: "Skin", value: v.skinAppearance || "—" }, { label: "Notes", value: v.notes || "—" }];
        return [{ label: "Focus", value: v.task || "—" }, { label: "Time", value: `${v.durationMinutes} min` }, { label: "Notes", value: v.notes || "—" }];
    }
    /**
     * 输入：record 或空值。
     * 输出：卡片上的简短数据与副标题。
     * 功能：仅展示真实历史，不虚构健康/能量分数。
     */
    function summary(record) {
        if (!record)
            return { value: "— —", sub: "尚未记录" };
        const v = record.data;
        return ({
            sport: { value: `${v.durationMinutes} min`, sub: v.activity }, food: { value: v.calories == null ? v.meal : `约 ${v.calories}`, sub: v.calories == null ? v.foods : "kcal · " + v.meal }, mood: { value: v.mood, sub: v.reason || "自己的感受" }, sleep: { value: `${v.hours} h`, sub: v.quality }, face: { value: "已记录", sub: v.feeling }, focus: { value: `${Math.round((record.focus?.elapsedMs ?? v.durationMinutes * 60000) / 6000) / 10} min`, sub: v.task }
        })[record.category];
    }
    /**
     * 输入：order（任意存储值）。
     * 输出：六个唯一合法类别。
     * 功能：恢复拖拽排序，同时修复旧版或损坏的数据。
     */
    function validOrder(order) {
        return [...new Set([...(Array.isArray(order) ? order : []), ...DEFAULT_ORDER])].filter(id => CATEGORIES[id]).slice(0, 6);
    }
    return {
        CATEGORIES, DEFAULT_ORDER, category, sportData, validate, rows, summary, validOrder
    };
})();
