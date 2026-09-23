/* 记录页底部按钮的纯状态规则。照片不计入填空完成度；录音表现仍由原记录模块负责。 */
__fluffyModules["entry-action.js"] = (() => {
    "use strict";
    const Catalog = __fluffyModules["catalog.js"];
    const INVITATIONS = Object.freeze({
        sport: Object.freeze({ zh: "长按和小猫聊运动", en: "Hold to log your workout" }),
        food: Object.freeze({ zh: "长按告诉小猫吃了啥", en: "Hold to share your meal" }),
        mood: Object.freeze({ zh: "长按和小猫说心情", en: "Hold to share how you feel" }),
        sleep: Object.freeze({ zh: "长按和小猫聊睡眠", en: "Hold to talk about sleep" }),
        face: Object.freeze({ zh: "长按说说今天的状态", en: "Hold to share your skin notes" }),
        focus: Object.freeze({ zh: "长按告诉小猫你的计划", en: "Hold to tell me your plan" })
    });
    /**
     * 输入：category（记录类别）、language（zh/en）。
     * 输出：该板块专属的单行长按提示；未知类别返回通用提示。
     * 功能：运动聊运动、饮食讲食物，避免把所有生活记录都称为倾诉；不使用用户原文拼按钮。
     */
    function invitationFor(category, language = "zh") {
        const lang = language === "en" ? "en" : "zh";
        return Object.hasOwn(INVITATIONS, category)
            ? INVITATIONS[category][lang]
            : (lang === "en" ? "Hold to tell your cat" : "长按和小猫说一说");
    }
    /**
     * 输入：category（六类记录之一）、raw（当前字段值）、context（记录日期等校验上下文）。
     * 输出：{complete, canSubmit, missing, invalid}，不包含用户原文。
     * 功能：把“所有文字/数字/时分已填好”与既有提交校验分开；绝不把照片、API Key 算作填空。
     */
    function inspect(category, raw = {}, context = {}) {
        // 阶段一：只遍历类别定义的记录字段，折叠营养项仍算字段，0 是有效已填值。
        const fields = Catalog.category(category).fields;
        const missing = fields.filter(field => String(raw[field.key] ?? "").trim() === "").map(field => field.key);
        // 阶段二：仅计算状态，不展示错误、不改变字段，也不增加营养数据的必填约束。
        const checked = Catalog.validate(category, raw, true, context);
        const invalid = Object.keys(checked.errors);
        return { complete: missing.length === 0 && checked.ok, canSubmit: checked.ok, missing, invalid };
    }
    /**
     * 输入：category、complete、phase、language、editing、past、loaded（当前交互状态）。
     * 输出：{mode, label, disabled, accessibleLabel, help}，用于同一个按钮的显示。
     * 功能：未填完显示该板块的长按提示，填完恢复继续/专注动作；授权、录音、整理优先于完成度。
     */
    function describe({ category, complete = false, phase = "idle", language = "zh", editing = false, past = false, loaded = true } = {}) {
        const english = language === "en";
        const busy = {
            authorizing: ["等待麦克风…", "Allow microphone…"],
            requesting: ["等待麦克风…", "Allow microphone…"],
            listening: ["松开结束", "Release to finish"],
            thinking: ["停止整理", "Stop"]
        };
        let mode, label;
        // 阶段一：真实录音生命周期永远优先，不能因AI回填而在收音时闪回“继续”。
        if (Object.hasOwn(busy, phase)) {
            mode = "busy";
            label = busy[phase][english ? 1 : 0];
        }
        else if (!complete) {
            mode = "invite";
            label = invitationFor(category, language);
        }
        else {
            // 阶段二：专注必须先计时/补记，不能被普通记录的“继续”覆盖业务含义。
            mode = "confirm";
            label = category === "focus"
                ? editing ? (english ? "Save changes" : "保存修改")
                    : past ? (english ? "Log past focus" : "补记专注")
                        : (english ? "Start focusing" : "开始专注")
                : editing ? (english ? "Save changes" : "保存修改") : (english ? "Finish & continue" : "完成并继续");
        }
        // 阶段三：屏幕阅读器仍能发现手动提交入口，不把可选信息变为强制填报。
        const help = english
            ? "Tap to submit the fields you filled in. Hold to speak and release to finish. Hold Space with the keyboard; Escape cancels."
            : "短按按原有规则检查并提交手动记录；长按说话，松开结束。键盘可长按空格，Escape 取消。";
        const accessibleLabel = mode === "invite"
            ? label + (english ? "; you can also tap to check your entry" : "；也可短按检查手动填写的记录")
            : label + (mode === "confirm" ? (english ? "; hold to speak" : "；仍可长按说话") : "");
        return { mode, label, disabled: !loaded || phase === "authorizing", accessibleLabel, help };
    }
    return { inspect, describe, invitationFor };
})();
