/* 记录页中英文本地化。界面文案与用户记录分开：永远不翻译或改写用户填写的值。 */
__fluffyModules["entry-i18n.js"] = (() => {
    "use strict";
    const KEY = "fluffy-review-language-v1";
    let current = "zh";
    current=window.NavaJournal.initial.locale==='en'?'en':'zh';
    const TEXT = Object.freeze({
        "调整日期": "Record date", "语言切换": "Language", "数据回顾": "View recap", "记录菜单": "Entry menu", "取消": "Cancel", "拍一张照片": "Take a photo", "正在等待摄像头…": "Waiting for camera…", "拍下这一张": "Take photo", "确定日期": "Set date", "回到今天": "Today", "记录日期": "Record date",
        "上一月": "Previous month", "下一月": "Next month", "关闭": "Close", "返回": "Back", "日期无效，请重新选择。": "Choose a valid date.", "不能补记未来的日期。": "Choose today or an earlier date.",
        "运动项目": "Activity", "时长": "Duration", "备注": "Notes", "一句话备注": "Notes", "分钟": "min", "预计时间": "Planned time", "专注时长": "Time focused", "想专注做什么": "What will you focus on?", "希望做到哪一步": "What would you like to finish?", "让小猫估时": "Plan with me",
        "睡眠时间": "Sleep time", "入睡时间": "Bedtime", "醒来时间": "Wake-up time", "醒来的感受": "How did you feel?", "小时": "Hour", "分钟选择": "Minute",
        "现在的心情": "How are you feeling?", "发生了什么": "What happened?", "留给自己一句话": "A note to yourself",
        "哪一餐": "Which meal?", "吃了什么": "What did you eat?", "大概份量": "Portion", "热量": "Energy", "蛋白质": "Protein", "碳水化合物": "Carbohydrates", "脂肪": "Fat", "营养信息 · 估算": "Nutrition · estimated",
        "早餐": "Breakfast", "午餐": "Lunch", "晚餐": "Dinner", "加餐": "Snack", "自己的感受": "How do you feel?", "眼周观察": "Eye area", "皮肤外观": "Skin appearance",
        "拍照": "Camera", "选择照片": "Choose photo", "等待照片": "Your photo goes here", "照片预览框": "Photo preview", "删除照片": "Remove photo", "移除照片": "Remove photo", "让小猫看看": "Let me take a look", "重拍": "Retake", "使用照片": "Use photo",
        "完成并继续": "Finish & continue", "长按和小猫说一说": "Hold to tell your cat", "确认并继续": "Confirm & continue", "开始专注": "Start focusing", "补记专注": "Log past focus", "修改专注": "Edit focus session", "保存补记": "Save this session", "保存修改": "Save changes", "完成": "Done", "继续": "Continue", "修改记录": "Edit entry",
        "等待麦克风…": "Allow microphone…", "等待麦克风": "Allow microphone", "松开结束": "Release to finish", "停止整理": "Stop", "小猫正在整理": "Thinking it through", "正在听你说": "I'm listening", "整理好后，你可以修改每个字段": "You can edit the draft", "松开，交给我整理": "Release when you're done", "慢慢说，我在听。": "Take your time. I'm listening.",
        "整理好了，请核对。": "Your draft is ready to review.", "先写下想做的事情。": "Tell me what you'd like to do first.", "已保留你刚才手动修改的内容。": "Your recent edits have been kept.",
        "例如：跑步": "For example: running", "例如：跑了 5 公里，或练了 4 组深蹲": "For example: 5 km or four sets of squats",
        "例如：有点失落，但也松了一口气": "For example: disappointed, but also relieved", "例如：完成了一件挂心的事": "For example: finished something on my mind", "我想对自己说…": "I'd like to tell myself…",
        "例如：米饭、鸡胸肉和西兰花": "For example: rice, chicken and broccoli", "例如：米饭半碗，鸡胸肉约 100 g": "For example: half a bowl of rice, 100 g chicken", "慢慢吃，好好照顾自己。": "A little note about your meal…",
        "例如：读完论文的方法部分": "For example: read the methods section", "把目标写得小一点、具体一点。": "A small, specific goal for this session…",
        "例如：还有点困，但比昨天精神": "For example: sleepy, but better than yesterday", "例如：中途醒过一次": "For example: woke up once during the night",
        "例如：有点困，但精神还好": "For example: a little sleepy, but feeling okay", "自己填写，或拍照后整理": "Your observation, or a draft from your photo", "例如：局部泛红、光照偏暗": "For example: some redness, dim lighting", "还有什么想记下来？": "Anything else you'd like to remember?",
        "先在右上角启用一个 AI 服务。": "Enable an AI service at the top right.", "先启用百炼，让我听懂话里的语气。": "Enable Bailian to include the tone of your voice.", "请先允许麦克风。": "Please allow microphone access.", "请在地址栏的网站权限里允许麦克风。": "Allow the microphone in your browser's site permissions.", "麦克风没有被允许。": "Microphone permission was not granted.", "没有听清，长按再说一次吧。": "I couldn't hear that. Hold to try again.",
        "浏览器暂不能录音，可以直接填写。": "Recording is unavailable; you can type instead.", "语音转写不可用，可启用百炼直接听录音。": "Transcription is unavailable. Enable Bailian for audio input.", "记录日期无效。": "The entry date is not valid.",
        "已有一段专注正在进行，先回到它吧。": "A focus session is already running.", "本机暂时无法保存，记录仍在当前页面。": "Couldn't save locally. Your entry is still here.", "暂时无法保存专注记录，当前会话仍在。": "Couldn't save this session yet.",
        "先填一下入睡时间。": "Choose a bedtime first.", "先填一下醒来时间。": "Choose a wake-up time first.", "请填写有效的 24 小时制时分。": "Choose a valid 24-hour time.", "请确认起止时间；本次睡眠应大于 0 且不超过 24 小时。": "Check the times: sleep must be longer than zero and no more than 24 hours.",
        "返回首页": "Home", "查看回顾": "View recap", "修改这条记录": "Edit entry", "再专注一次": "Focus again", "删除这条记录": "Delete entry", "全部": "All", "我的手记": "My journal", "每一个认真生活的片刻，都在这里。": "Your little moments, kept together.",
        "请先完成或取消当前语音输入。": "Finish or cancel the current recording first."
    });
    const TITLES = Object.freeze({ sport: ["Tell me about your workout.", "Let's save this workout."], food: ["Let's remember this meal.", "Let's save this meal."], mood: ["How are you feeling today?", "How did you feel that day?"], sleep: ["How did you sleep?", "How did you sleep that night?"], face: ["A gentle check-in with you.", "A little look back at you."], focus: ["A little time, just for you.", "Remember a focused moment."] });
    const PAST_ZH = { sport: "那天的运动，讲给我听。", food: "那天的美味，记下来吧。", mood: "那天的心情，讲给我听。", sleep: "那晚，睡得还好吗？", face: "那天的状态，轻轻看看。", focus: "那段专注，帮你记下来。" };
    const BUBBLES = Object.freeze({
        home: "Little moments,\nI'm here for you.", listening: "Take your time,\nI'm all ears.", thinking: "Let me think,\nI'll write it down.", ready: "It's ready now,\ntake a little look.", canceled: "We can pause,\nyour words stay.", permission: "Allow the mic,\nthen talk to me.", voiceReady: "All ready now,\nhold to tell me.", voiceInvite: "Hold the button,\nI'm here to listen.", estimating: "Let's make room\nfor your focus.", estimated: "Time is all set,\nlet's begin.", photo: "A closer look,\na little memory.", error: "A little hiccup,\ncheck the notice.", saved: "All tucked away,\nyou did well.", focusAway: "Time's still going,\ncome back soon.",
        "每一步的努力\n我都帮你记下": "Every little step,\nI'll keep it safe.", "拍下这份美味\n一起好好记下": "A photo or words,\nlet's keep it here.", "心情慢慢讲呀\n我会好好听的": "Whatever you feel,\nI'm here to listen.", "现在就开始吧\n我在旁边陪你": "One little task,\nI'll stay with you.", "昨晚睡得怎样\n慢慢讲给我听": "How was your rest?\nTell me about it.", "把今天的模样\n轻轻留在这里": "A little check-in,\njust as you are."
    });
    /** 输入：无。输出：zh或en。功能：读取本页共享的界面语言，不依据记录内容推断语言。 */
    function language() { return current; }
    /** 输入：语言代码。输出：规范化语言。功能：同步记录/回顾的语言偏好，不向API发送任何数据。 */
    function setLanguage(value) {
        current = value === "en" ? "en" : "zh";
        window.NavaJournal.call('locale',{locale:current}).catch(()=>{});
        if (typeof document !== "undefined") document.documentElement.lang = current === "en" ? "en" : "zh-CN";
        return current;
    }
    /** 输入：中文受控文本、可选英文。输出：当前语言文本。功能：只查界面词典；未列入的用户原话原样保留。 */
    function t(zh, en) { return current === "en" ? en ?? TEXT[zh] ?? zh : zh; }
    /** 输入：类别、是否补记。输出：标题。功能：日期改变时不再错误地把历史条目叫作今天。 */
    function title(id, past = false) { return current === "en" ? TITLES[id][past ? 1 : 0] : past ? PAST_ZH[id] : __fluffyModules["catalog.js"].category(id).title; }
    /** 输入：类别。输出：当前语言名称。功能：导航和空回顾共用准确的六类名称。 */
    function categoryName(id) { return current === "en" ? { sport:"Workout",food:"Meals",mood:"Mood",sleep:"Sleep",face:"Check-in",focus:"Focus" }[id] : __fluffyModules["catalog.js"].category(id).name; }
    /** 输入：语义键、已处理的中文短句。输出：一到两行英文或原中文。功能：英文不套用七汉字限制，避免错误回退成第三行。 */
    function bubble(key, prepared) { return current === "en" ? BUBBLES[key] || BUBBLES[prepared] || BUBBLES.ready : prepared; }
    /** 输入：验证错误与类别字段。输出：本地化的可操作提示。功能：字段名翻译而非改变校验要求。 */
    function message(text) {
        if (current !== "en" || TEXT[text]) return t(text);
        const required = /^先填一下(.+)。$/.exec(text), numeric = /^(.+)请填写有效数字。$/.exec(text), long = /^(.+)请写得简短一点。$/.exec(text);
        if (required) return `Please fill in ${t(required[1]).toLowerCase()}.`;
        if (numeric) return `Enter a valid number for ${t(numeric[1]).toLowerCase()}.`;
        if (long) return `Keep ${t(long[1]).toLowerCase()} a little shorter.`;
        return text;
    }
    /** 输入：本地日期键、可选格式。输出：日期显示。功能：以本地正午构建日期，避免UTC造成前一天偏移。 */
    function dateLabel(key, options = { year:"numeric", month:"short", day:"numeric" }) {
        const [y,m,d] = key.split("-").map(Number);
        return new Intl.DateTimeFormat(current === "en" ? "en-US" : "zh-CN", options).format(new Date(y,m-1,d,12));
    }
    return { KEY, TEXT, language, setLanguage, t, title, categoryName, bubble, message, dateLabel };
})();
