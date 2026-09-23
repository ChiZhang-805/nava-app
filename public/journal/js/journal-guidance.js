/* 字段语义契约。类型、单位、枚举、长度仍从catalog读取；本文件只补充含义/来源/边界。 */
__fluffyModules["journal-guidance.js"] = (() => {
    "use strict";
    const C = __fluffyModules["catalog.js"], S = __fluffyModules["sleep-time.js"];
    const GUIDE = Object.freeze({
        sport: {
            activity: ["本次实际做的运动名称；示例不构成允许值清单。", "用户描述", "不放时间、距离或感受；多个独立运动不能无依据合并。"],
            durationMinutes: ["这一次已经进行的运动总时长，统一分钟，允许小数。", "用户明确时长或准确单位换算", "距离、次数不是分钟；未说时长不能按常识推算。"],
            notes: ["运动名称和时长以外的信息：距离、组数、次数、重量、训练细节、用户感受。", "本轮明确表达", "不把助手的鼓励或默认好心情写成用户自述。"]
        },
        food: {
            meal: ["本次食用属于哪一餐。", "用户选择或明确描述", "不按当前时刻、拍照时间或图像外观猜餐次。"],
            foods: ["这次实际食用的食物名称，可以有多种。", "用户描述或清晰可见食物", "不默认整桌食物都归用户，不虚构隐藏食材。"],
            portion: ["用户吃下的数量或比例，例如半碗、两个、约150克；例子不是限制。", "用户补充优先；视觉模式可合理推算", "区分盘中总量与吃下份量；共享餐食信息不足时只问食用比例。"],
            calories: ["本次食用部分的总热量，kcal，不是每100克。", "标签/用户数值，或有食物及份量依据的推算", "推算取合理精度并设置estimated；未知用null而不是0。"],
            protein: ["本次食用部分的蛋白质总克数。", "标签/用户数值或配方份量推算", "JSON数字不含g，不与碳水或热量混淆。"],
            carbs: ["本次食用部分的碳水化合物总克数。", "标签/用户数值或配方份量推算", "不是食物总重量，也不是糖含量；未知留空。"],
            fat: ["本次食用部分的脂肪总克数。", "标签/用户数值或配方份量推算", "烹饪油可作配方假设但不能伪装成已观察事实。"],
            notes: ["用户希望保留的口味、做法或用餐感受。", "用户明确表达", "不填免责声明、减重评价或助手的鼓励。"]
        },
        mood: {
            mood: ["用户此刻自己的感受，可用多个词表达混合情绪。", "自述优先；文字隐含情绪只能作待确认候选", "不从他人经历/否定词/反讽直接贴标签，不输出强度或心理诊断。"],
            reason: ["用户说过的与心情相关的事情。", "本人的实际叙述", "不知道原因就留空，不从心情倒推虚构事件。"],
            notes: ["用户自己想留给自己的话。", "用户原话", "助手安慰和励志建议不属于这个字段。"]
        },
        sleep: {
            bedtime: ["该段睡眠的入睡时分，24小时HH:mm。", "用户明确时间及上下文；记录日通常为醒来日", "日期由程序计算；多组/矛盾时核对，不猜睡眠分期。"],
            wakeTime: ["同一段睡眠的醒来时分，24小时HH:mm。", "用户明确时间及入睡语境", "23:00到07:00跨午夜，01:00到07:00同日；上午/午睡优先于夜间默认。"],
            quality: ["用户醒来的精神、困倦或身体感受，自由描述。", "用户自述", "不能由睡了多久推断睡得好，也不把‘累’改成精神好。"],
            notes: ["中途醒来、梦、午睡等用户补充。", "用户明确表达", "不补造睡眠问题、病因或健康结论。"]
        },
        face: {
            feeling: ["用户自己报告的今天感受。", "仅用户文字描述", "绝不能从脸部照片推断真实疲劳、情绪或精神状态。"],
            eyeArea: ["眼周可见阴影、浮肿等外观观察。", "用户观察或清晰图片", "不推断年龄、身份、疾病、颜值或实际疲惫；光照妨碍时留空核对。"],
            skinAppearance: ["可见泛红、纹理、肤色外观等，不是医学检查。", "用户观察或清晰图片", "不同光照/角度不能直接当成皮肤改善恶化，不诊断或打分。"],
            notes: ["用户愿意保留的其他描述。", "用户明确表达", "不替用户写感受，不从照片推断隐藏属性。"]
        },
        focus: {
            task: ["这一次想专注做的具体任务。", "用户表达", "不将长周期目标当已完成任务，不添加用户没说的子任务。"],
            durationMinutes: ["普通新增为预计分钟；补记/编辑已完成记录为实际分钟；由operation区分。", "用户明确时长；估时只能通过用户主动点击的估时任务", "整理阶段不自动估时，不把计划当完成，不改计时器测得的已完成时长。"],
            notes: ["这一段专注希望达到的具体边界或用户补充。", "用户描述", "不是泛泛鼓励，不擅自把任务标为完成。"]
        }
    });
    const QUESTIONS = Object.freeze({
        activity:["这次做了什么呀？","What did you do?"], durationMinutes:["这次用了多少分钟呀？","How many minutes was it?"],
        notes:["还有什么想记下呀？","Anything else to note?"], meal:["这是哪一餐呀？","Which meal was this?"],
        foods:["这次吃了些什么呀？","What did you eat?"], portion:["这一份你吃了多少呀？","How much did you eat?"],
        mood:["现在感觉怎么样呀？","How do you feel now?"], reason:["发生什么事了呀？","What happened?"],
        bedtime:["几点开始睡的呀？","When did you fall asleep?"], wakeTime:["几点醒过来的呀？","When did you wake up?"],
        quality:["醒来感觉怎么样呀？","How did waking feel?"], feeling:["今天感觉怎么样呀？","How do you feel today?"],
        eyeArea:["眼周有什么变化呀？","What did you notice near your eyes?"], skinAppearance:["皮肤有什么变化呀？","What did you notice on your skin?"],
        task:["这次想专心做什么呀？","What will you focus on?"], calories:["这份热量你知道吗？","Do you know its calories?"],
        protein:["蛋白质有多少克呀？","How much protein was there?"], carbs:["碳水有多少克呀？","How many grams of carbs?"], fat:["脂肪有多少克呀？","How many grams of fat?"]
    });
    /** 输入：id（类别）。输出：包含字段说明的序列。功能：界面类型/范围与AI说明使用同一字段配置，不维护冲突的第二套schema。 */
    function fields(id) {
        return C.category(id).fields.map(f => {
            const guide = GUIDE[id]?.[f.key];
            if (!guide) throw Error(`Missing field guide: ${id}.${f.key}`);
            return { key:f.key, label:f.label, type:f.type || "text", unit:f.unit || "", options:f.options,
                maxLength:f.max, minimum:f.minValue, maximum:f.maxValue, required:Boolean(f.required),
                meaning:guide[0], source:guide[1], exclude:guide[2], missing:f.type === "decimal" ? null : "" };
        });
    }
    /** 输入：id、mode（new/edit/retrospective）。输出：结构化整理的附加系统规则。功能：限制为本轮补丁，保留用户原值并提供单项追问方向。 */
    function instructions(id, mode = "new") {
        return `\n逐字段填写说明（例子仅解释含义，不枚举所有允许值）：${fields(id).map(f => `${f.key}（${f.label}，${f.type}${f.unit ? "，单位"+f.unit : ""}${f.options ? "，选项"+f.options.join("/") : ""}${f.maxLength ? "，最多"+f.maxLength+"字" : ""}${f.minimum != null ? "，最小"+f.minimum : ""}${f.maximum != null ? "，最大"+f.maximum : ""}）：${f.meaning} 来源：${f.source} 边界：${f.exclude}`).join("\n")}\n` +
            `这是${mode === "edit" ? "修改已选中记录" : mode === "retrospective" ? "补记实际经历" : "新增记录草稿"}。current仅是参考，fields只返回本轮新说出/修正的字段，不照抄current，不用空值擦除旧内容。必填不是命令你编造；缺失可省略或留空，保留有依据的部分。助手鼓励不写入用户备注。` +
            `lastQuestion是用户实际看到的上一个字段问题；简短回答例如“半小时”“我只吃了一半”要结合它和current理解。用户改话题、说不想回答或在抱怨时不能机械塞进上一个空。只问一个最必要问题，不追问用户跳过的可选项。` +
            `可选返回clarification:{field:"当前字段key",kind:"missing|ambiguous"}，程序将用短句询问；不要返回长篇提问或技术说明。用户明确要清空时，可返回clearFields:[字段key]，其他空字段不表示清空。` +
            `可选返回intent:{operation:"keep|ask|add|edit",targetIndex:null}。明确入口操作优先；描述冲突、多次事件或对象不明用ask，不保存、不删除、不合并任何记录。candidates只用于指出需用户确认的对象。`;
    }
    /** 输入：id、options（表单/问题快照）。输出：最小白名单上下文。功能：不发送其他类别字段、Key、原图或历史聊天。 */
    function context(id, options = {}) {
        const current = {}, definitions = fields(id);
        for (const f of definitions) {
            const v = options.current?.[f.key];
            if (["string","number"].includes(typeof v)) current[f.key] = String(v).slice(0, f.maxLength || 100);
        }
        const q = options.lastQuestion;
        return { operation:options.operation || "new", current,
            missing:definitions.filter(f => !String(current[f.key] || "").trim()).map(f => f.key),
            lastQuestion:q && definitions.some(f => f.key === q.field) ? {field:q.field, question:String(q.question || "").slice(0,80)} : null,
            candidates:(options.candidates || []).slice(0,12).map((r,index) => ({index, data:Object.fromEntries(definitions.filter(f => r.data?.[f.key] != null).map(f => [f.key,String(r.data[f.key]).slice(0,100)]))})) };
    }
    /** 输入：id、原文。输出：明确要求清空的字段keys。功能：模型空值不能删除原内容，清空还需原文包含具体字段或全称。 */
    function explicitClears(id, text) {
        const value = String(text || "");
        if (!/清空|删掉|删除|去掉|\b(clear|remove|delete)\b/i.test(value) || /不要|别|不用|do not|don['’]t/i.test(value)) return [];
        const aliases = {notes:/备注|补充|留给自己|\bnotes?\b/i, reason:/原因|发生了什么|\breason\b/i,
            quality:/醒来.{0,4}感受|\bquality\b/i, portion:/份量|分量|\bportion\b/i};
        return fields(id).filter(f => value.includes(f.label) || value.includes(f.key) || aliases[f.key]?.test(value)).map(f => f.key);
    }
    /** 输入：id、原文、options。输出：可以先展示的确定性时间草稿及日期。功能：仅在无歧义时快速填时间，不用情绪/感觉猜字段。 */
    function early(id, text, options = {}) {
        if (id === "sleep") {
            const p = S.fromSpeech(text, {recordDate:options.recordDate});
            if (!p.warnings.length && p.fields.bedtime && p.fields.wakeTime && (!p.dates?.wakeDate || p.dates.wakeDate === options.recordDate))
                return {fields:p.fields, dates:p.dates};
        }
        return {fields:{}, dates:{}};
    }
    /** 输入：id、模型建议、合并草稿、语言和操作类型。输出：可信的单字段追问或null。功能：只允许已知字段，缺项只追问必填项，内容由本地模板生成。 */
    function question(id, suggestion, current = {}, language = "zh", operation = "new") {
        const defs = fields(id), selected = defs.find(f => f.key === suggestion?.field);
        let f = selected && (suggestion.kind === "ambiguous" || selected.required && !String(current[selected.key] ?? "").trim()) ? selected : null;
        if (!f) f = defs.find(x => x.required && !String(current[x.key] ?? "").trim());
        const timeQuestion = ["edit","retrospective"].includes(operation) ? ["这次专注了多久呀？","How long did you focus?"] : ["这次想专注多久呀？","How long would you like to focus?"];
        const text = f && (id === "focus" && f.key === "durationMinutes" ? timeQuestion : QUESTIONS[f.key])?.[language === "en" ? 1 : 0];
        return text ? {field:f.key, question:text} : null;
    }
    return {GUIDE, fields, instructions, context, explicitClears, early, question};
})();
