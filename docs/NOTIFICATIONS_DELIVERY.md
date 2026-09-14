# NAVA 通知与提醒交付合同

本文区分应用内通知、设备本地通知和远程推送，避免把“网页上看见一条提醒”误写成
“已经完成 iPhone / Android 锁屏推送”。

视觉和行为参考以 Apple 官方 Human Interface Guidelines 的 Notifications 页面、
Apple User Notifications 框架文档及 iPhone 用户指南为准：应用在前台时避免重复展示
应用内横幅与系统通知；系统本地/远程通知必须获得用户授权；临时横幅支持点按打开和
上滑收起。网页中的 NAVA 横幅只模拟信息层级与交互，不冒充 APNs 系统送达。

## 当前已实现源码

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
- 原有每日睡眠和每周报告调度保留；通知中心可以一次开启睡眠、饮食、专注、情绪、
  今日状态和周报六类设备本地计划。
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
