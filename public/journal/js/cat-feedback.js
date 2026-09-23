/* 错误和缺项也是小猫对白。不显示底部 toast，不回显上游响应；中英文都不需要模型翻译。 */
__fluffyModules["cat-feedback.js"] = (() => {
    "use strict";
    const COPY = Object.freeze({
        "dictation-tail": ["我在收好最后一句\n很快就帮你整理", "I'm catching the last bit.\nThen I'll tidy it up."],
        "entry-organizing": ["我在整理你的话\n填好就给你看看", "I'm tidying your words.\nYou'll have a draft soon."],
        "entry-paused": ["刚才先停下啦\n点我接着整理", "We paused for a moment.\nTap me to continue."],
        "entry-held": ["刚才先停下啦\n填过的内容还在", "We've paused.\nYour fields are safe."],
        "entry-partial": ["这些先帮你记下\n再补一点就好啦", "I've kept these details.\nAdd the rest in your time."],
        "entry-repair": ["这次没记对呀\n我们一起改好", "I didn't get that right.\nLet's fix it together."],
        "entry-no-question": ["好呀我先不问啦\n想说时我都在", "I won't ask more.\nI'm here when you need me."],
        "chat-partial": ["后面那句断开了\n你可以接着说呀", "The last bit stopped.\nYou can keep talking."],
        "photo-food-unclear": ["这张没看清食物\n换张照片给我吧", "I can't see the food.\nTry another photo."],
        "photo-food-partial": ["食物先记下来啦\n再添一点份量吧", "I've noted the food.\nAdd a little portion detail."],
        "photo-filled": ["这餐替你填好啦\n看看要不要修改", "Your meal is filled in.\nChange anything you like."],
        "photo-retry": ["照片还留在这里\n点我再看看这餐", "Your photo is still here.\nTap me to try again."],
        saved: ["已经替你记好啦\n今天也辛苦啦", "It's saved now.\nYou did well today."],
        "layout-restored": ["位置都放好啦\n看看合不合心意", "It's back in place.\nHave a little look."],
        "task-saved": ["已经放进待办啦\n准备好再开始", "It's on your list.\nStart when you're ready."],
        "focus-running": ["时间还在走呀\n先回去陪你专心", "Your timer is running.\nLet's return to it."],
        "delete-failed": ["这次还没删掉\n原记录还在呀", "I couldn't delete it.\nThe entry is still here."],
        "share-failed": ["这次没能分享\n先保存图片吧", "Sharing didn't work.\nSave the card instead."],
        "value-check": ["这个数值没对上\n再帮我看看呀", "That value doesn't fit.\nCheck it for me."],
        unknown: ["这次没能接上\n内容还在这里", "That didn't connect.\nYour draft is safe."],
        retry: ["刚才的话还留着\n点我再试一下", "I kept your words.\nTap me to retry."],
        ready: ["已经填好啦\n你再看一看", "I've filled it in.\nTake a little look."],
        review: ["我先替你记下\n你再帮我看看", "I've made a draft.\nPlease check it."],
        "deepseek-key": ["先启用DeepSeek\n再说给小猫听", "Enable DeepSeek,\nthen talk to me."],
        "bailian-key": ["先启用百炼呀\n再让我看照片", "Enable Bailian,\nthen send a photo."],
        "key-format": ["这份Key没填全\n再帮我看看呀", "Check your key.\nIt looks incomplete."],
        "auth-deepseek": ["Key好像没对上\n再检查一下呀", "Check your\nDeepSeek key."],
        "auth-bailian": ["百炼Key没对上\n再检查一下呀", "Check your\nBailian key."],
        "ai-balance": ["服务额度不足啦\n先填下来也好", "AI credit is low.\nYou can still type."],
        "ai-permission": ["这个模型没开通\n检查一下权限", "This model is locked.\nCheck API access."],
        "ai-model": ["这个模型没接上\n需要检查配置", "The model is missing.\nCheck its settings."],
        "ai-parameter": ["这次请求没对上\n先留着你的话", "The request failed.\nI kept your words."],
        "ai-busy": ["那边有点忙呀\n等一会再试吧", "The service is busy.\nLet's try in a bit."],
        "ai-network": ["网络好像断开了\n连好再来找我", "The connection dropped.\nTry when it's back."],
        "ai-timeout": ["这次等得有点久\n你的内容还在", "That took too long.\nYour draft is safe."],
        "ai-format": ["这次没整理好\n你的内容还在", "That reply went wrong.\nYour draft is safe."],
        "ai-empty": ["这次没收到回复\n你的内容还在", "No reply came back.\nYour draft is safe."],
        "ai-truncated": ["回复还没说完整\n点我再试一下", "The reply was cut off.\nTap me to retry."],
        "ai-incomplete": ["回复中途断开了\n你的内容还在", "The reply stopped.\nYour draft is safe."],
        "ai-refused": ["这次没整理出来\n换句话说说吧", "I couldn't use that.\nTry another wording."],
        "speech-permission": ["先允许麦克风\n我再听你慢慢说", "Allow the microphone,\nthen talk to me."],
        "speech-device": ["我还没听到声音\n看看麦克风吧", "Check your microphone.\nI can't hear it yet."],
        "speech-network": ["听写服务没连上\n先打字告诉我吧", "Dictation is offline.\nYou can type instead."],
        "speech-unsupported": ["这里暂时听不了\n先打字告诉我吧", "Voice isn't available.\nYou can type instead."],
        "speech-timeout": ["听写启动有点慢\n再长按试试吧", "Dictation took too long.\nHold to try again."],
        "speech-empty": ["这次没听到内容\n长按再说一次吧", "I didn't catch that.\nHold and try again."],
        "speech-partial": ["最后一句没听全\n你再帮我看看呀", "The last bit is unsure.\nPlease check my draft."],
        "speech-interrupted": ["听写中途断开了\n已听到的话还在", "Dictation was interrupted.\nI kept what I heard."],
        "speech-too-long": ["这段话有点长呀\n分两次讲给我吧", "That's a long story.\nTry a shorter part."],
        "manual-kept": ["你刚改的还在\n我没有动它呀", "I kept your edits.\nThey're still yours."],
        "nothing-extracted": ["这次没找全内容\n再说具体一点吧", "I need a little more.\nTell me a bit more."],
        "photo-missing": ["先选一张照片\n我再仔细看看", "Choose a photo first.\nI'll take a look."],
        "photo-large": ["这张照片有点大\n换张小一点的吧", "That photo is too big.\nTry a smaller one."],
        "photo-format": ["这张照片打不开\n换一张给我吧", "I can't open that photo.\nTry another one."],
        "camera-permission": ["先允许摄像头\n也能从相册选呀", "Allow the camera,\nor choose a photo."],
        "camera-device": ["摄像头没准备好\n从相册选一张吧", "The camera isn't ready.\nChoose a photo instead."],
        "save-failed": ["这次还没保存上\n内容先替你留着", "I couldn't save it yet.\nYour draft is still here."],
        "save-conflict": ["这条刚被改过啦\n重新打开看看吧", "This entry has changed.\nPlease reopen it."],
        "date-invalid": ["这个日期没对上\n重新选一天吧", "That date isn't valid.\nChoose another day."],
        "date-future": ["那天还没到呢\n选今天或之前吧", "That day hasn't come.\nChoose today or earlier."],
        "date-check": ["你提了另一天\n去菜单核对一下", "You mentioned another day.\nCheck the date menu."],
        "permission-ready": ["准备好啦\n长按说吧", "All ready now.\nHold to speak."],
        "canceled": ["先停在这里\n内容还留着", "We can pause here.\nYour draft is safe."],
        "hold": ["长按下面按钮\n慢慢说给我听", "Hold the button below.\nI'm here to listen."],
        "no-text": ["想说的话还空着\n慢慢写给我吧", "Write a little first.\nI'm here to listen."],
        "language-reply": ["回复语言没对上\n我再帮你理一理", "That wasn't in English.\nTap me to try again."],
        "thinking": ["让我想一想\n马上就写好", "Let me think.\nI'll write it down."],
        "playing": ["内容先留在这里\n慢慢来就好呀", "It's still here.\nTake your time."]
    });
    const FIELDS = Object.freeze({
        activity: ["运动项目还空着\n说说做了什么呀", "What did you do?\nTell me the activity."],
        durationMinutes: ["用了多少分钟呀\n填个时间给我吧", "How many minutes?\nAdd the time for me."],
        notes: ["还有个小空呢\n留句话给自己吧", "One little note to go.\nLeave yourself a line."],
        meal: ["这是哪一餐呀\n选好再告诉我吧", "Which meal was it?\nChoose one for me."],
        foods: ["这次吃了什么呀\n慢慢讲给我听", "What did you eat?\nTell me about it."],
        portion: ["大概吃了多少呀\n留个份量给我吧", "About how much?\nAdd a portion for me."],
        mood: ["此刻是什么心情\n慢慢说给我听", "How are you feeling?\nTake your time."],
        reason: ["发生了什么呀\n慢慢讲给我听", "What happened?\nTell me in your words."],
        bedtime: ["几点开始睡的呀\n选个时间给我吧", "When did you fall asleep?\nChoose a time for me."],
        wakeTime: ["几点醒过来的呀\n选个时间给我吧", "When did you wake up?\nChoose a time for me."],
        quality: ["醒来感觉如何呀\n慢慢讲给我听", "How did waking feel?\nTell me a little."],
        feeling: ["今天感觉如何呀\n慢慢讲给我听", "How do you feel today?\nTell me a little."],
        eyeArea: ["眼周有什么变化\n写下看到的就好", "How does the eye area look?\nWrite what you notice."],
        skinAppearance: ["皮肤有什么变化\n写下看到的就好", "How does your skin look?\nWrite what you notice."],
        task: ["想专心做什么呀\n告诉小猫就好", "What will you focus on?\nTell me your task."]
    });
    /**
     * 输入：错误或文字、上下文（字段及服务）。
     * 输出：受控语义键。
     * 功能：优先使用明确故障码，兼容旧校验消息，不把原始错误串直接显示。
     */
    function classify(value, context = {}) {
        const code = value?.code || (typeof value === "string" && COPY[value] ? value : "");
        if (COPY[code]) return code;
        const raw = String(value?.message ?? value ?? "");
        // 已成功的操作与故障分开，不能把“布局已恢复”误说成失败。
        if (/放进待办|added to.*list/i.test(raw)) return "task-saved";
        if (/卡片已放回|布局已恢复|layout.*restor|back in place/i.test(raw)) return "layout-restored";
        if (/已有.*专注.*进行|timer.*running/i.test(raw)) return "focus-running";
        if (/删除失败|清除未完成|delete.*fail|clear.*fail/i.test(raw)) return "delete-failed";
        if (/分享未完成|save the image instead|shar.*fail/i.test(raw)) return "share-failed";
        if (/已经保存|已保存|记下来了|successfully saved/i.test(raw)) return "saved";
        if (/请输入.*数字|有效.*数字|分钟数|数值|Enter a number|valid.*number/i.test(raw)) return "value-check";
        if (/按住说话|hold to speak/i.test(raw)) return "hold";
        if (/停下来|we can pause/i.test(raw)) return "canceled";
        if (/取消|Canceled|cancelled|pause here/i.test(raw)) return "canceled";
        if (/麦克风|microphone|语音|听写|听清|听到|录音|dictation|speech/i.test(raw)) {
            if (/允许|权限|not.allowed|permission|denied/i.test(raw)) return "speech-permission";
            if (/网络|服务连接|network|offline/i.test(raw)) return "speech-network";
            if (/超时|timeout/i.test(raw)) return "speech-timeout";
            if (/不支持|不可用|不允许语音|unsupported|换.*浏览器/i.test(raw)) return "speech-unsupported";
            if (/设备|找到|占用|audio.capture|device|not.readable/i.test(raw)) return "speech-device";
            if (/长按|hold to|hold again|再次按住/i.test(raw) && !/没有|没听|没录|中断/i.test(raw)) return /准备好|Ready/i.test(raw) ? "permission-ready" : "hold";
            return "speech-empty";
        }
        if (/Key|密钥|API key|启用.*AI/i.test(raw)) {
            if (/权限|access/i.test(raw)) return "ai-permission";
            if (/无效|invalid|不匹配/i.test(raw)) return /百炼|Bailian/i.test(raw) ? "auth-bailian" : "auth-deepseek";
            if (/完整|格式|incomplete/i.test(raw)) return "key-format";
            return /百炼|Bailian/i.test(raw) ? "bailian-key" : "deepseek-key";
        }
        if (/摄像头|camera/i.test(raw)) return /允许|permission/i.test(raw) ? "camera-permission" : "camera-device";
        if (/照片|photo|image/i.test(raw)) return /大|large/i.test(raw) ? "photo-large" : /先选|first/i.test(raw) ? "photo-missing" : "photo-format";
        if (/余额|额度|credit|balance/i.test(raw)) return "ai-balance";
        if (/频繁|繁忙|较多|busy|rate|429/i.test(raw)) return "ai-busy";
        if (/超时|timeout|timed out/i.test(raw)) return "ai-timeout";
        if (/网络|连接|network|connect/i.test(raw)) return "ai-network";
        if (/语言|English.only/i.test(raw)) return "language-reply";
        if (/格式|结构|JSON|字段无效|format|schema/i.test(raw)) return "ai-format";
        if (/完整返回|完整回复|说完整|incomplete/i.test(raw)) return "ai-incomplete";
        if (/空.*回复|没.*回复|empty reply/i.test(raw)) return "ai-empty";
        if (/冲突|其他窗口|conflict/i.test(raw)) return "save-conflict";
        if (/保存|存储|save|storage/i.test(raw)) return "save-failed";
        if (/未来|future/i.test(raw)) return "date-future";
        if (/另一个日期|another day|another date/i.test(raw)) return "date-check";
        if (/日期|date/i.test(raw)) return "date-invalid";
        if (/核对|推测|确认|不确定|estimated|check|uncertain/i.test(raw)) return "review";
        return "unknown";
    }
    /**
     * 输入：message（故障或校验信息）、context（field/invalid/language）。
     * 输出：一条双语短对白，不含用户正文、Key或供应商错误正文。
     * 功能：本地组织有原因、有下一步的提示；断网时也不需要额外调用AI。
     */
    function say(message, context = {}) {
        const lang = context.language || __fluffyModules["entry-i18n.js"]?.language() || "zh";
        let pair;
        if (["bedtime", "wakeTime"].includes(context.field) && context.invalid) pair = ["这个时间没对上\n重新选一下吧", "That time doesn't fit.\nChoose it once more."];
        else if (context.field && context.invalid) pair = ["这个数字没对上\n再帮我看一下呀", "That value doesn't fit.\nCheck it once more."];
        else if (context.field && FIELDS[context.field]) pair = FIELDS[context.field];
        else pair = COPY[classify(message, context)] || COPY.unknown;
        return pair[lang === "en" ? 1 : 0];
    }
    /**
     * 输入：气泡节点、短句。
     * 输出：实际的一至两行文本。
     * 功能：按真实字体测量，优先保留自然断句；英文较长时交共用分行器平衡换行。
     */
    function fit(node, text) {
        if (!node || typeof getComputedStyle !== "function") return text;
        const style = getComputedStyle(node), canvas = document.createElement("canvas"), c = canvas.getContext("2d");
        if (!c) return text;
        c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const width = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
        const measure = s => c.measureText(s).width + [...s].length * (parseFloat(style.letterSpacing) || 0);
        if (width <= 0 || text.split("\n").every(line => measure(line) <= width)) return text;
        const pages = __fluffyModules["review-conversation.js"]?.pages(text, measure, width);
        // 完整返回所有短页给播放器，不通过缩小字号隐藏可读性问题。
        return pages?.length === 1 ? pages[0].join("\n") : text;
    }
    return { COPY, FIELDS, classify, say, fit };
})();
