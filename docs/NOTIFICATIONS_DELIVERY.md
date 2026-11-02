# NAVA 通知与提醒交付合同

本文区分应用内通知、设备本地通知和远程推送，避免把“网页上看见一条提醒”误写成
“已经完成 iPhone / Android 锁屏推送”。

视觉和行为参考以 Apple 官方 Human Interface Guidelines 的 Notifications 页面、
Apple User Notifications 框架文档及 iPhone 用户指南为准：应用在前台时避免重复展示
应用内横幅与系统通知；系统本地/远程通知必须获得用户授权；临时横幅支持点按打开和
上滑收起。网页中的 NAVA 横幅只模拟信息层级与交互，不冒充 APNs 系统送达。

## 当前已实现源码

### 管理员发布（2026-09-27）

- 首页右侧快捷入口只在服务端 `nava_is_admin()` 返回 true 时显示“管理员端”；直达 URL 仍由
  页面和数据库/Edge Function 双重校验，不把隐藏入口当成授权。
- 管理员可编辑标题、正文、分类及点击目标，一次发布为所有当前账号写入真实
  `user_notifications`。批次记录收件人数、站内/系统模式和远程送达摘要，管理操作另写
  审计表。通知中心原有 RLS、已读、删除、Realtime 与跨设备合同不变。
- “APP内通知”当前可真实使用；“同时系统推送”只有 Edge 检测到内部派发 secret 与至少
  一套 APNs/FCM/HMS 凭据时才可选择。当前 canonical 项目没有这些推送 secret，所以线上
  按钮禁用，不冒充锁屏横幅已经送达。
- 已有 `push-dispatch` 继续从服务端事实源取通知、按账号设备 token 发送并写幂等回执。
  APNs provider JWT 在同一 Edge isolate 内复用50分钟，避免每条消息重复签发；`.p8`、
  Team ID、Key ID 和 bundle id 只能配置为 Supabase server secrets。

Apple 边界仍以[注册 APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)、
[远程通知服务器](https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server)、
[token 认证](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
和[通知授权](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
为准：需要 Xcode Push Notifications capability、每台设备 token、provider server 与用户授权。
Windows 与网页验收不能替代签名安装包和真实 iPhone 前台/后台/锁屏送达测试。

### 统一权限入口（2026-09-20）

- 提醒设置不再显示“系统通知／已开启／未开启”常驻卡片。新账号八项默认关闭，
  既有偏好不重置；系统授权和APP内每项开关是两层独立状态。
- 每个启用动作（包括情绪、饮食快捷设置和睡眠提醒）先检查系统权限再保存。
  iOS安装版注册`NavaNotificationPermission`桥：`UNUserNotificationCenter`
  `getNotificationSettings`；authorized直接通过，notDetermined才请求alert/sound/badge。
  不在登录或页面加载时自动索权，不用网页弹框冒充苹果系统框。
- 已拒绝/仅安静授权时，原生`UIAlertController`提供“暂不／前往设置”；
  iOS16+使用`UIApplication.openNotificationSettingsURLString`，旧版回退APP设置。
  返回前台重查，允许后只保存刚才申请的那一项；取消、拒绝、页面离开或账号改变
  不会偷偷开启。已有授权无额外弹窗。Apple专注模式、通知摘要、声音/横幅/锁屏
  子设置仍由用户和系统控制，APP不能保证每条立即弹横幅。
- 网页使用浏览器真实Notification权限，不声称能跳进iPhone原生APP设置；浏览器
  不支持或拒绝时保留关闭并给短状态。APNs注册不再次索权，也不自动开启别的项目。
- 22项通知/权限合同测试包括默认关闭、取消、拒绝不重弹、已授权不弹及SwiftAPI
  静态合同。设置返回状态另用明确桥接测试夹具检验，不代表真机弹窗或推送送达。
  Mac上需执行既有原生准备/编译流程，并在iPhone验收首次授权、拒绝跳设置、返回
  后单项启用及真实锁屏通知；Windows不能完成这些真机边界。

官方依据：[Apple申请通知授权](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)、
[APP通知设置链接](https://developer.apple.com/documentation/uikit/uiapplication/opennotificationsettingsurlstring)、
[Capacitor 7 Local Notifications](https://capacitorjs.com/docs/v7/apis/local-notifications)。

随Sites v165与Pages同源发布（总交接§92）：菜单/头像156项几何、四尺寸中英文、
五尺寸提醒设置/四尺寸收件箱交互及权限分支通过。双站真实账号只读登录确认8项
入口和系统卡移除，加载资源匹配，健康写入0；未更改旧账号开关，不把浏览器夹具
当作原生授权/送达证据。

### 独立提醒设置页与专注生命周期（2026-09-20）

- 通知中心不再内嵌设置/权限说明。右上三点菜单的“提醒设置”进入独立路由
  `today/reminder-settings`；返回通知中心，八项卡片随内容伸展、正文滚动，底部控件
  可滚动到导航栏上方。情绪/饮食概览的快捷设置仍复用同一控件。界面只保留项目、
  开关、智能/固定时间、时间和短状态，不展示交付边界长段落。
- 八项为情绪、早餐、午餐、晚餐、睡前放松、运动记录、专注、面部记录。
  新项默认关闭，现有开关和固定时间保留；系统通知授权不再自动开启其他项。
- 用户明确批准后应用 `202609200001_reminder_timing_modes.sql`：新增
  `timing_mode`（fixed/smart，旧行默认fixed），CHECK扩展exercise/face；不改RLS、
  健康记录或原有提醒开关时间。当前31条migration。
- 智能时间来自当前账号最近14个完整本地日，每日最多一个观测、至少3天取中位数，
  5分钟取整和各类合理时间窗口约束。三餐用实际餐次时间；睡前用入睡时间减30分钟，
  跨午夜时间先展开；专注用started_at；其余用与record_date同日的真实创建时间，
  排除跨日回填。记录提醒延后15分钟；不足3天用默认时段。此为可审计规则算法，
  不是LLM。固定时间单独保留，切回时不被智能推算覆盖。预计时间按当前设备时区。
- 单个APP分钟调度器同时用于网页、原生计划及外侧模拟；读取失败暂缓，不伪造成功。
  当天已记录对应情绪/餐次/运动/专注/面部则跳过；睡前是放松提醒，不被昨晚睡眠
  记录取消。旧固定缺失记录提示不再绕过开关；有真实证据的趋势/恢复建议仍保留。
- 原生未来最多14日按时间排序后取56条，并扣除其他已占用系统槽位，八项全开约7日；
  后续打开APP续排。新ID与旧四项ID空间分开，清理旧计划及sleep/focus旧重复计划。
  不保证长期不开APP或跨设备立即取消，真实系统送达仍须真机。
- 删除外侧“主动分心”按钮，保留来电、消息、切到后台。上滑回桌面/切出后专注
  暂停，返回需主动继续。真实visibility/appState事件冻结计时边界，避免React清理
  延迟把后台时间累计进去；模拟仍不写真实中断统计。
- 网页使用Screen Wake Lock；iPhone安装版新增NavaWakeLock原生租约桥，主线程设置
  UIApplication.isIdleTimerDisabled。中断/后台/结束释放，失活清空租约，不能阻止
  用户手动锁屏；前端只有确认授予才显示已常亮。Windows验证不等于Xcode编译或
  iPhone真机常亮验收。

参考：[Apple idle timer](https://developer.apple.com/documentation/uikit/uiapplication/isidletimerdisabled)、
[WebKit Screen Wake Lock](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)。

本轮已随Sites v163及Pages同源码发布，四档手机设置/收件箱交互、完整verify、
生产认证合同与原生排除模拟层均通过。双站真实账号八项保存、模式切换、午餐独立
关闭与刷新通过，各23个实际加载JS/CSS与产物匹配。账号原设置已恢复，健康写入0，
原活动会话保留；完整版本/回执位置见总交接§90。原生常亮/锁屏送达仍待真机。

以下2026-09-15四项提醒段落为旧交付记录；新路由、八项与方式选择以上述合同为准。

### 桌面手机系统预览层（2026-09-16）

- 与 NAVA 正式页面分离的 `PhoneSystemPreview`：一个主屏幕、锁屏、熄屏、应用返回；
  底部上滑回主屏幕、点击 NAVA 图标返回，保留挂载中的页面、登录与输入草稿。其他
  系统应用仅按压反馈，不能进入；不展示虚构天气数据，也不再输出占位点击说明。
  图标使用去除展示外边距的Apple官方经典素材，透明衬底、统一可见边界；邮件为
  参考iOS18主屏幕的扁平矢量图标。日历使用本地日期和短星期名，比例随图标缩放。
  右侧不展示“系统事件随时可用…”及“仅网页测试…”两段说明，技术边界保留在本文。
- 以 Apple iOS 18 指南的普通联系人/默认横幅设置为明确参照，不宣称所有 iOS 版本
  像素相同。解锁的 NAVA 前台或主屏幕来电用顶部横幅；锁定/熄屏来电唤醒为全屏及
  真正可拖动的“滑动来接听”。横幅可展开，接听后显示计时/静音/扬声器/键盘，挂断
  回到原表面；锁屏接听不会变相解锁。来电可随时触发，不再依赖账号或活动正在运行。
- 右侧锁屏/唤醒/解锁/返回应用/结束来电始终可操作；活动中断仍走已有 preview 注册
  合同，停止录音/播放/相机，暂停专注和运动，睡眠不推断夜醒。不自动恢复麦克风。
  侧边按钮单击静音、快速双击拒接；45秒未接结束。没有真实电话、短信、Face ID 或
  运营商通信。信息/提醒我选择只回报外侧，不发送短信或创建实际系统提醒。
- NAVA通知走普通正文的系统外观横幅/锁屏卡，点击锁屏卡后须显式上滑或右侧解锁，
  才打开对应APP页面。已有独立到点提醒继续检查真实偏好及记录，合格才显示；不会
  写模拟提醒进真实收件箱。真实通知仍沿原账号收件箱合同处理。
- 系统界面覆盖时，底下 NAVA 及 body portal 标为 inert 并隐藏，不能误点或穿透。
  无健康数据写入、无后端部署。系统参考应用图标来源保存在 `src/assets/preview-system/SOURCES.md`。
- `build:native` 使用构建期 alias 去除桌面组件、手机状态机/事件桥与预览中断服务，
  并去除桌面预览样式；`cap:sync` 已改用此构建，不是仅 CSS 隐藏。原生构建产物检查
  `native-preview:test` 验证不含系统模拟选择器/事件/控件/专用图标。Mac/Xcode签名、
  真机锁屏/电话/推送送达依然是另外的验收，不因模拟通过就勾完成。

参考：[Apple 来电交互](https://support.apple.com/zh-cn/guide/iphone/iph3c9947bf/18.0/ios/18.0)、
[通知交互](https://support.apple.com/zh-cn/guide/iphone/iph6534c01bc/ios)。

### 情绪及三餐独立提醒（2026-09-15，数据库、真实账号和双站交付通过）

- 情绪/饮食概览及通知中心复用 `ReminderSettings`，分别设置情绪、早餐、午餐、晚餐
  的开关和 `HH:mm`。新账号四项默认关闭；已有统一 `nutrition` 只作为午餐的兼容
  回退，明确保存的 `nutrition_lunch` 优先，绝不自动开启早餐/晚餐。
- 三餐使用 `nutrition_breakfast`、`nutrition_lunch`、`nutrition_dinner`；情绪继续使用
  `mood`。每次只 upsert 当前账号当前类型并检查数据库返回，关闭真实保存 `false`。
  新独立设置不进入旧版只支持开启的偏好 outbox；网络结果不明时显示“尚未确认保存”，
  重新读取核对，不展示虚假的保存成功。原通知收件箱 outbox 保留。
- append-only `202609150002_independent_reminders.sql` 仅扩展现有 CHECK，不删除记录、
  不修改 RLS、不批量改写偏好。用户明确回复“允许”后已应用；本地与线上30条迁移一致。
- `useIndependentReminders` 在登录后全 APP 运行一个分钟级计时器；前台恢复、联网、
  日期切换、设置修改、记录成功后重新读取账号偏好及当天情绪/三餐真实数据。
  未确认读取成功时暂缓。按设备本地钟触发，补发窗口为一小时；不在晚上补早餐提醒。
- 一条有效的已保存情绪分数（含快捷记录）取消当天情绪提醒；三餐分别按该日期该餐
  的 items/time 判断。饮水、加餐、另一餐或历史日期不会误取消今日对应提醒。
  成功写入事件立即取消对应原生计划，生成序号防止旧查询重新发布已关闭/已保存的提醒。
- 缺失情绪、饮食、缺一餐的旧固定时间提示由独立调度替代；真实趋势、恢复及饮水
  建议保留。通知 ID 按本地日期+类型幂等，删除 tombstone 也参与重复判断。
- 餐次通知使用 `editor-breakfast/lunch/dinner`，强制打开今天的指定餐次。饮食草稿
  保留其他餐次：选择、合并、保存后只清理当前餐次，离线先写本地 pending，再顺序
  同步；晚到的读取不能回滚较新的编辑/清理。
- 右侧“到点提醒”仅桌面出现，读取同一偏好与记录，模拟当天设定时刻。关闭或
  已记录则在外侧说明原因；符合条件才展示普通产品提醒并准确跳转。手机横幅不带
  “模拟”标签，模拟身份和结果只显示在右侧控制台。不会写收件箱、
  触发系统通知、占用今日真实提醒或生成健康记录。
- 2026-09-16按用户要求分离预览/产品消息：预览失败只resolve到外侧，不广播
  `nava:reminder-status`污染手机设置；真实设置/调度失败仍保留用户错误反馈。
  `reminders-final.log`五尺寸及注入预览读取失败通过，双站发布状态见总交接§88。
- 右侧控件现独立放在机型卡片下方的“外部环境模拟”面板，机型翻面不会隐藏提醒。
  登录页也显示情绪/三餐四个按钮但禁用；handler同时拒绝无账号调用，避免空等15秒。
  登录后保持上述按真实设置/记录判断的模拟合同，不新增真实系统推送或健康记录。
  v154已双站发布：独立提醒桌面点击复验、20个预览界面状态及双站真实账号登录/右侧
  来电中断相机复验通过。线上使用模拟相机且没有提交照片或写健康记录；具体收据见
  `CODEX_HANDOFF_CURRENT.md` §83，不等同于真机系统通知送达验收。
- 横幅手势仅在实际向上拖动时捕获指针；修复旧版 pointerdown 捕获把普通点击
  从按钮转移到容器、导致通知显示却不跳转的问题。鼠标点击和四档手机触摸均验收。
- 原生使用未来 14 个本地日的单次计划（最多 56 条），刷新时保留未变化的请求，
  修改/关闭/注销只移除拥有标记的请求，不取消其他通知。已保存当日不影响次日。
  Android 到点后仍 pending 的请求不会被分钟刷新误取消；跨日旧请求清理。
  原生权限未授予时保留应用内提醒。连续 14 天不打开、锁屏、Doze/重启及跨设备
  即时取消仍须原生/推送验收，不能宣称网页可替代系统调度。

验收：`npm run notification:test` 包含独立开关/兼容/时间/日期/餐次/草稿合同；
`npm run reminders:visual` 使用一个外部 Chromium 串行四种手机尺寸及桌面。
`scripts/run-public-ai-login-secure.ps1 -Check Reminders` 在迁移应用后通过真实 APP
表单登录、UI 保存、Supabase 回读、刷新核对，并精确恢复原四项设置。授权账号本地源码
验收通过；单独关闭午餐未修改另外三项。测试页面隔离活动草稿，并阻止健康记录写入，
原有活动会话前后一致；恢复采用完整写入响应及时间戳比较，避免覆盖其他设备并发修改。
Sites v151 与 GitHub Pages 已从同一源码 `2642762f29589a91d780555a1496d62b5ccadcc6`
发布；两站分别通过真实表单登录（带 `?demo=1` 仍要求认证）、四项保存/回读/刷新、
单独关闭午餐与精确恢复原设置。回执包含本轮开始时间与失败默认状态；证据在
`Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/independent-reminders/account-*.json`。
四档手机与1440桌面提醒布局、开关、餐次跳转和模拟均通过；外部浏览器串行运行。
本地演示测试不是生产持久化或原生送达证据。

### 应用内通知

- 首页右上角铃铛显示真实未读数量，点击进入通知中心。
- 顶部横幅使用 NAVA 冰蓝玻璃视觉，并按 iPhone 临时横幅的信息层级展示 NAVA 图标、
  应用名/“现在”、短标题和一至两行正文；点击打开目标，上滑或等待 8.5 秒收起。
  一次只显示一条横幅，不展示队列堆叠，也不添加挤占正文空间的关闭按钮。横幅保持
  90pt 触控高度，图标和三层文字作为同一内容组垂直居中，不把多余空间全部堆在下方。
- 通知中心标题区保持单一“通知中心”，右上角三点菜单提供全部已读、全部删除和多选；
  系统通知权限卡只在尚未授权或不支持时显示，授权成功后立即移除并由列表向上补位。
- 每条通知按睡眠、饮食、情绪、专注、运动、面部、周报或系统类别使用不同颜色和语义
  图标。分类色块和图标在卡片左侧放大并垂直居中；时间固定在右侧，未读圆点位于时间
  下方留白的垂直中心。卡片高度随一至两行正文自适应，列表只显示两行并以省略号收束。
- 进入通知中心本身不会改变已读状态；只有用户打开某一条详情、主动滑动标记、选择批量
  已读或点击全部已读时才会改变。详情按“分类图标 + 大分类名 + 小时间 / 通知标题 /
  完整正文 / 打开相关页面”的层级呈现。
- 通知中心支持全部/未读筛选、全部标为已读、单条已读/未读、打开目标页面和空状态。
  三点菜单使用打开的信封表示全部已读、使用带加号的列表表示多选；菜单或长按通知可进入
  多选，支持全选、批量已读和批量删除。
- 单条通知右滑后露出红色删除动作，左滑后露出绿色已读/未读动作；滑动本身不直接
  删除。删除后保留 5.5 秒撤销入口，底层 tombstone 保留 30 天以免同一条提醒立即
  被重新生成。
- 收件箱最多保留 80 条可见/近期 tombstone，按登录用户隔离。`user_notifications` 是
  跨设备事实源，当前设备 `localStorage` 只作离线缓存；启动/回到前台会合并云端，
  Realtime 会刷新打开中的客户端，已读、未读、删除和撤销均只上传发生变化的行。
  单条变更与通知偏好先进入账号隔离的 pending outbox，只有 Supabase 确认后才清除；
  下次加载或账户导出前会重试，避免短暂断网留下仅本机可见的状态。
- 六模块保存成功后生成真实完成通知；提醒规划器读取当前登录用户当天的真实
  `TodaySnapshot`、近期 `TrendBundle` 和 ChronoState 已持久化行动，依据缺失记录、
  短睡眠下的专注/运动调整、连续低情绪、连续晚睡、个人近期活动/饮食基线、已有餐次
  但饮水很少、恢复复测和非诊断面部趋势生成按优先级排序的最多六条当日提醒。生产页面
  不注入示例通知。
- 运动、情绪、饮食和面部提醒详情提供与场景匹配的确认/稍后/状态反馈；选择结果写回
  `user_notifications.target`，随当前账号跨设备同步，后续规划器可依据仍未恢复等真实反馈
  调整提醒，而不是只在当前设备改变一段 UI。

### iPhone / Android 设备本地通知

- `@capacitor/local-notifications` 已接入；iOS Podfile 已包含
  `CapacitorLocalNotifications`。
- iOS Podfile 同时包含 `CapacitorPushNotifications`，AppDelegate 已把 APNs 注册成功/失败
  回调桥接给 Capacitor；Android Capacitor 工程、Android 13+ 通知权限声明、竖屏约束和
  `nava_general` 高优先级 channel 已纳入源码。Android launcher 使用与 iOS 同源的 NAVA
  品牌图，FCM 默认小图标使用独立单色 N 标识，避免系统把彩色应用图压成白色方块。
- 原有每日睡眠和每周报告调度保留；通知中心开启系统权限后保留睡眠、专注、
  今日状态和周报计划；情绪与三餐由独立设置管理，不重置自定义时间/开关。
- 调整睡眠/周报时仅替换本次传入的通知 ID，不清空另外四类或无关计划。注销时仍
  清理该账号的全部 NAVA 计划。适配器测试覆盖六类已存在计划、子集替换、空列表、
  重复 ID 和调度失败；失败会返回错误，不伪报成功。这不是系统锁屏送达的真机证据。
- 用户点击设备通知时，WebView 会写入当前用户的应用内收件箱、标为已读并跳转到对应
  模块；前台收到设备通知时也会进入收件箱并显示顶部横幅。
- 允许的睡眠、饮食、情绪、专注、`fdnb_signal` 与周报偏好继续通过现有
  `notification_preferences` 表及 RLS 保存到 canonical Supabase。

设备本地通知不需要远程推送服务器；安装版获得系统通知权限后，可以由操作系统在
锁屏和通知中心展示计划通知。不过 Windows 自动化只能证明 TypeScript、Capacitor
插件、Pod 接入和事件合同存在，不能证明某台 iPhone 的锁屏送达。

### 远程推送源码

- 原生启动或用户开启通知套件时会请求 APNs/FCM 注册，并把 token、稳定 installation id、
  token SHA-256、时区和 locale 写入当前账号的 `push_device_tokens`；退出登录和删除账号
  会先停用当前安装 token。原始 token 不写日志或前端构建常量。
- append-only migration `202609070005_remote_push_devices.sql` 定义账号级 token、RLS、
  级联删除和幂等 `push_delivery_receipts`。账号导出源码已纳入这两张表。
- `push-dispatch` Edge Function 源码使用独立内部 secret 鉴权，从云端通知事实源读取正文，
  可分别调用 APNs token auth、FCM HTTP v1 和 HMS Push；provider 明确返回 token 失效时会
  停用该 token，每个通知/设备组合通过 receipt 防止重复派发。
- 上述 migration 与 `push-dispatch` 已应用 canonical production；内部调度 secret、provider
  secret 与真机验收尚未完成，因此当前公开网页与已安装旧包仍不能据此宣称已经拥有远程锁屏送达。

### 网页通知

- 支持 Notification API 的安全浏览器可授权系统通知。页面在前台时只展示应用内横幅，
  避免同一提醒同时出现网页横幅和浏览器系统通知；页面不在前台时才尝试浏览器系统通知。
- 网页关闭、浏览器挂起或 iOS 浏览器限制下不承诺送达。可靠的离线网页推送仍需要
  Service Worker、Web Push subscription 和服务端发送链路。

## 尚未实现或必须人工完成

- 在 Mac / Xcode 中签名并安装 iPhone 包，逐项验证首次拒绝、允许、再次关闭权限、
  前台、后台、锁屏、重启、跨时区、低电量和点击深链。
- Android 工程已生成，但当前 Windows 环境没有 JDK，无法完成 Gradle 编译；项目也尚未
  提供 Firebase `google-services.json`。需要配置后编译并在 Android 13+ 真机验证权限、
  前后台、锁屏、点击深链、token 轮换与注销。
- HMS 服务端派发源码存在，但华为客户端 token 注册仍需要 `agconnect-services.json`、
  HMS Push SDK/插件和真实华为设备；还需按设备验证省电策略与厂商后台限制。
- APNs 需要 Apple Developer Team、Push capability、`.p8` key 及正确 bundle id/environment；
  FCM/HMS 需要各自项目凭据。任何凭据只能作为 Supabase server secret 配置，不能进入仓库。
- migration `202609070004`/`202609070005`、更新后的 `export-user-data` 与新
  `push-dispatch` 已经部署；仍需配置内部调度 secret 与平台 provider secret，并完成速率、
  审计和真实设备送达验收。

## 当前自动验证

- `npm run notification:test`：按本地时间与真实模块完成状态验证提醒规划合同。
- `npm run notification:visual`：在 360x740、375x812、390x844、430x932 使用本地
  Playwright 无头浏览器验证横幅、首页铃铛、紧凑自适应卡片、分类图标、完整详情、
  进入页面不自动已读、打开详情后已读、右侧未读圆点几何位置、权限卡启用后移除、
  三点菜单图标、长按/全选/批量已读、批量删除与撤销、左右滑、空状态和横向溢出。
- `npm run ios:verify`：静态验证 iOS Pod 和本地通知调度/接收/点击事件接线。
- `npm run push:contract:test`：静态验证账号 token 注册/停用、APNs/FCM/HMS provider、
  幂等 receipt、内部鉴权和“不记录 token/secret”的源码合同。

视觉测试的通知数据只通过 `import.meta.env.DEV` 下的 `qa=notifications` 注入，不会进入
生产构建，也不会写入 Supabase。
