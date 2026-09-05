# NAVA Apple Health / Apple Watch 当前交付方案

首次制定：2026-09-02；当前状态同步：2026-09-05  
状态：实施基线；所有勾选项必须有代码、自动化或真机证据，不能以界面占位代替。

## 1. 最终目标

NAVA 最终交付为一个 Capacitor iOS 应用和两个行为一致的网页入口。Apple
Watch 产生的健康数据先进入 iPhone 的 Apple 健康/HealthKit；用户在 NAVA
iPhone App 中授权后，由原生 HealthKit 桥读取、规范化并通过用户自己的
Supabase 会话上传。GitHub Pages、ChatGPT Sites 和 iPhone App 都读取同一个
Supabase 项目 `wxteapvwagvhhtrjrbim`、同一个用户身份和同一组规范化数据。

正式链路：

```text
Apple Watch
  -> iPhone Apple 健康 / HealthKit
  -> NAVA Capacitor iOS 原生桥
  -> 带 Supabase 用户 JWT 的 health-sync-ingest
  -> exercise_records / sleep_records / health_metric_snapshots / health_sync_jobs
  -> ChronoState / FDNB / AI 健康报告
  -> iPhone UI + GitHub Pages + ChatGPT Sites
```

不承诺也不实现“普通网页仅凭同一 Wi-Fi 或蓝牙直接读取 Apple Watch
HealthKit 历史”。网页只展示已经由受信任原生客户端或以后获得授权的厂商
云连接上传的数据。

## 2. 已验证基线

### 当前 APP 仓库

- iOS Capacitor 工程、iPhone target、HealthKit entitlement 和权限文案已存在。
- `NavaHealthPlugin.swift` 已加入 iPhone target，可读取步数、活动能量、运动
  分钟、心率、静息心率、HRV SDNN、血氧、睡眠阶段和小时活动曲线。
- `health-sync-ingest` 使用已登录用户 JWT，服务端从会话确定用户，写入规范化
  表并刷新节律结果。
- `health-sync-ingest`、`watch-sync`、`rhythm-score` 当前已在线。
- WatchConnectivity 的 iPhone 端、watchOS 源码和 `NAVA Watch` target 已接入
  Xcode 工程；iPhone target 会嵌入 Watch 产品，服务端动作收据提供幂等保护。
- Watch 动作在 iPhone WebView 尚未启动时先写入受文件保护的原生队列；只有
  转存到账号隔离的 Web 队列后才从原生队列确认删除。
- 当前尚无 Mac/Xcode 编译、HealthKit 权限、Apple Watch 真机、TestFlight
  或 App Store 验收证据。

### 网页端同学仓库 `Tj-jiaoao/style-muse-next`

- 已实现真实的 Capacitor iOS HealthKit 采集器、前台恢复同步、睡眠聚合、
  Supabase 原始导入以及网页端读取。
- 它证明了“原生 iPhone 采集 -> Supabase -> 网页展示”的产品方向，不证明
  浏览器能直接连接 Apple Watch。
- 旧 `health-auto-export` 使用打入客户端的共享密钥、关闭 JWT 验证并信任
  客户端 `user_id`。该设计不得复制到正式 NAVA App。
- 未找到真机日志、TestFlight、数据库闭环或 watchOS target 证据。

## 3. 不可破坏的安全和数据规则

1. iPhone、Watch 和网页必须使用同一个 NAVA 用户身份。
2. 客户端只能保存 Supabase publishable key；service role、模型密钥和共享写入
   密钥不得进入 Web、IPA、日志或 Git。
3. 健康写入必须由服务端验证用户 JWT，并从 JWT 推导 `user_id`。
4. 浏览器继续使用当前标签页 `sessionStorage`；原生 iOS 会话使用 Keychain，
   两者不得互相降低安全等级。
5. HealthKit 无数据、权限受限和真实的零值必须区分。不得把“读取不到”保存成
   零，也不得以模拟数值填充公开页面。
6. 每日聚合按设备本地日期和时区保存；跨午夜、夏令时和旅行场景必须有来源
   元数据。
7. 同一天、同一来源的重复同步必须幂等。同步任务必须记录开始、成功、失败、
   样本数和真实完成时间。
8. AI 和节律算法只能使用当前用户授权并已持久化的数据；缺失数据必须降低
   置信度或明确显示不足。
9. Apple Health 和 Apple Watch 输出是健康描述和生活方式建议，不是医学诊断。

## 4. 分阶段实施

### 阶段 A：工程和身份收敛

- [x] 确定当前 APP 仓库为正式实现源。
- [x] 确定规范化 Supabase 链路为正式数据源。
- [ ] 人工确认唯一正式 bundle ID：网页端曾使用 `health.nava.app`，当前 APP
  工程使用 `health.nava.mobile`。若前者已有 App ID/TestFlight，优先沿用已
  注册身份；否则由产品所有者确认后者。
- [ ] 人工确认 Apple Developer Team、证书、Provisioning Profile 和 App Store
  Connect 权限。
- [ ] 在 Mac 上安装与当前 Capacitor 主版本兼容的 Node、Xcode 和 CocoaPods。

### 阶段 B：安全登录会话

- [x] 增加 iOS Keychain Capacitor 插件，原生端持久化 Supabase 会话。
- [x] 浏览器仍使用标签页 `sessionStorage`。
- [x] 退出登录同时删除当前原生 Keychain 会话。
- [x] 自动化验证公开 Web 构建没有改成长期本地登录。
- [ ] 真机验证 App 被系统终止并重开后能安全恢复登录。

### 阶段 C：HealthKit 读取正确性

- [x] HealthKit 无样本时省略指标，不把缺少权限或缺少记录转换为零。
- [x] 保存本地日期、时区、睡眠来源 bundle、睡眠样本数和可用指标集合。
- [x] 首次同步最多回填 14 天；服务端最多接受 31 天，防止无界 payload。
- [x] 重复同步按 `user_id + record_date + source` 覆盖每日快照，不制造重复记录。
- [ ] 真机分别验证完全授权、部分授权、拒绝、撤销授权和不支持血氧的设备。

### 阶段 D：同步生命周期

- [x] 用户完成 HealthKit 授权后立即同步。
- [x] 原生 App 启动和返回前台时，在冷却窗口外自动同步。
- [x] HealthKit Observer Query 记录后台变化并通知运行中的 WebView。
- [x] App 被暂停或终止时，后台变化标记需持久化，下一次启动必须消费并同步。
- [x] 启用 HealthKit Background Delivery entitlement。
- [ ] 在真机证明后台回调行为；模拟器结果不能作为验收证据。
- [ ] 若产品要求“用户长期不打开 App 也持续上传”，在真机基线稳定后单独增加
  原生后台上传器、令牌刷新和系统预算评审；当前阶段不伪造该保证。

### 阶段 E：Supabase 与跨端刷新

- [x] 正式入口使用 `health-sync-ingest`，并验证用户 JWT。
- [x] 本地 `health-sync-ingest` 源码按真实可用字段规范化写入运动、睡眠、健康
  快照和同步任务；部分权限不会用 0 或 null 覆盖同日已有真实值。
- [x] 已部署并验证本轮更新后的 `health-sync-ingest`；线上为 v11 且强制 JWT。
- [x] append-only 迁移 `202609020002_health_sync_realtime.sql` 已在生产项目
  应用，把 `health_sync_jobs` 加入 Supabase Realtime publication。
- [x] 当前登录用户收到成功同步事件后，首页、记录页和个人页重新读取真实数据。
- [x] “最近同步”读取 `health_sync_jobs.finished_at`，不使用固定的“3 分钟
  前”等文案。
- [ ] 页面区分：浏览器等待 iPhone、未授权、已请求权限但无数据、部分指标、
  同步中、同步失败、数据陈旧、同步成功。目前已实现浏览器/iPhone 边界、
  未授权、已请求、无数据、同步中、失败、陈旧和成功；仍需真机确认“部分指标”
  的最终文案。
- [ ] 所有数据仍受 RLS 限制，跨用户订阅和读取必须失败。

### 阶段 F：旧链路退役

- [ ] 确认是否存在需要保留的 `health_imports` 历史记录。
- [ ] 如有需要，由服务端一次性、按用户归属迁移到规范化表并保留来源标记。
- [ ] 确认所有 iOS 测试包已改用用户 JWT 后，删除线上
  `health-auto-export` Function。
- [ ] 轮换/删除 `HEALTH_EXPORT_API_KEY`；它不是 Apple 官方凭据。
- [ ] 网页端停止解析 `health_imports` 原始 JSON。

### 阶段 G：watchOS companion

HealthKit 历史同步不依赖 watchOS App，因此本阶段排在 iPhone 闭环之后。

- [x] 在 Xcode 工程创建与正式 iPhone App 配套的 `NAVA Watch` watchOS App
  target，并由 iPhone target 依赖、嵌入。
- [x] 加入 `NavaWatchApp.swift`、`WatchHomeView.swift`、
  `WatchSessionManager.swift` 和本地化资源。
- [x] Watch target 使用 `$(NAVA_APP_BUNDLE_ID).watchkitapp`，并设置
  `WKCompanionAppBundleIdentifier`；iPhone 与 Watch 可通过一个工程级根值一起
  切换正式 bundle ID。
- [ ] 人工在 Xcode 为两个 target 选择 Developer Team 并让自动签名生成对应
  Provisioning Profile。WatchConnectivity 本身不需要额外客户端密钥。
- [x] iPhone 登录后向 Watch 发送最小今日快照；Watch 不保存 service role 或模型
  密钥。
- [x] Watch 情绪/专注动作通过 iPhone 原生持久队列、账号隔离 Web 队列和
  `watch-sync` 上传，使用 `actionId`
  保证至多一次落库。
- [ ] 真机验证即时消息、Watch 不可达、离线 `transferUserInfo` 重放和重复动作。

积分商城和“专注期间硬件指标分析”按照本轮产品决定继续延期，不得因为已有
每日 HealthKit 数据而标记完成。

## 5. iOS 打包与发布流程

Windows 可完成 TypeScript、Web 构建、Supabase、Swift 静态合同和网页测试，
但苹果签名、HealthKit 真机和 IPA/TestFlight 最终构建必须在 macOS 上使用
Xcode。

在 Mac 上：

```bash
git clone <NAVA private repository>
cd nava-app
npm ci
npm run verify
npm run cap:sync
npx cap open ios
```

然后在 Xcode 中：

1. 打开 `ios/App/App.xcworkspace`，不要只打开 `.xcodeproj`。
2. 选择唯一正式 Apple Developer Team 和 bundle ID。
3. 检查 iPhone target 的 HealthKit 与 Background Delivery capability。
4. 连接 iPhone，选择真机作为 Run Destination，Build & Run。
5. 完成权限和数据闭环测试后，选择 Generic iOS Device / Any iOS Device，执行
   Product -> Archive。
6. 在 Organizer 中先 Validate App，再使用 TestFlight Internal Only 分发。
7. 内部真机验收通过后才提交 App Store Review。

每次 Web 代码更新进入原生包前都必须重新运行 `npm run cap:sync`，把最新
`dist` 和原生依赖同步进 iOS 工程。

## 6. 真机验收矩阵

### 身份与隔离

- [ ] 网页已注册账号可登录 iPhone App。
- [ ] iPhone 上传记录的 `user_id` 来自 JWT，而不是请求 body。
- [ ] 用户 A 看不到、订阅不到、覆盖不了用户 B 的数据。
- [ ] 退出登录后 Keychain 会话被删除；再次进入要求重新登录。

### HealthKit

- [ ] Apple Watch 已在 iPhone 健康 App 中形成真实步数、心率和睡眠记录。
- [ ] NAVA 权限页只请求实际使用的类型。
- [ ] 完全授权后各指标数值与健康 App 在允许的聚合误差内一致。
- [ ] 部分授权或无样本显示缺失，不显示伪造的零。
- [ ] 血氧不可用时其他指标仍可同步。
- [ ] 跨午夜睡眠归属、时区偏移和 14 日回填正确。

### 云端与页面

- [ ] 每次同步生成一条真实 `health_sync_jobs` 状态记录。
- [ ] `health_metric_snapshots`、`exercise_records`、`sleep_records` 只写实际可用
  指标。
- [ ] 相同数据重复同步不增加重复日记录。
- [ ] iPhone App、GitHub Pages、ChatGPT Sites 显示一致。
- [ ] 网页保持打开时，成功同步能触发受控刷新。
- [ ] 页面同步时间来自服务端完成时间。
- [ ] ChronoState/FDNB/AI 报告只引用这些持久化数据并如实表达缺失和置信度。

### 生命周期与异常

- [ ] 手动同步、启动同步和回到前台同步均通过。
- [ ] 无网时不伪造成功；恢复网络后可重试。
- [ ] HealthKit 后台变化可在运行中触发同步，或在下一次启动消费持久化标记。
- [ ] 撤销 HealthKit 权限后不会用零覆盖既有真实记录。
- [ ] Edge Function 失败会留下失败任务或可审计错误，不吞掉失败。
- [ ] 重装、换机、Token 过期和系统时间变化有明确结果。

### Watch companion

- [ ] Watch 与 iPhone 配对后能看到今日快照。
- [ ] Watch 不可达时动作进入本地队列。
- [ ] 恢复连接后只落库一次。
- [ ] Watch 端没有 Supabase service role 或模型 API key。

## 7. 发布门槛

只有以下条件全部成立，产品才可以声明“Apple Watch 已接入”：

1. Mac/Xcode Release 构建和 Archive 通过。
2. 至少一台真实 iPhone + Apple Watch 完成授权、上传、跨端显示闭环。
3. 完全授权、部分授权、撤销授权、无网和重复同步测试通过。
4. Supabase RLS 跨用户隔离通过。
5. 两个公开网站和 TestFlight 使用同一来源提交，并显示同一用户数据。
6. 所有固定同步时间、模拟硬件成功状态和不安全共享密钥均已移除。
7. 隐私说明、数据导出、账号删除和非医疗声明通过发布检查。

## 8. 本轮自动实施边界

本轮可在 Windows 和当前仓库完成：Keychain 插件源码、HealthKit 后台观察
准备、前台自动同步、缺失数据保护、Realtime 数据刷新、迁移文件、iOS 工程
合同、Mac 操作脚本、真机验收脚本与文档、TypeScript/后端/视觉自动化。

必须由人工或外部账号完成：唯一 bundle ID 决策、Apple Developer Team
授权、Mac/Xcode 编译与签名、iPhone/Watch 权限点击、真机数值比对、带两个
测试账号的 RLS 验收、TestFlight/App Store 上传，以及确认旧客户端和历史数据
后的旧 Function 退役与密钥轮换。

## 9. 已生成的执行与验收工具

- `scripts/prepare-ios-release.sh`：在 Mac 上安装、全量验证、Capacitor 同步并做
  无签名 Release 编译；设置显式环境变量后才允许 Archive。
- `scripts/verify-health-sync-boundary.mjs`：使用一次性测试用户 access token，
  指定本地记录日期和已有记录的第二测试用户，只读验证同步任务、规范化记录和
  跨用户 RLS，不打印身份或健康值。
- `scripts/audit-health-functions.mjs`：只读核对线上正式/旧健康 Function 的状态
  和 JWT 配置。
- `docs/APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md`：真机证据模板。
- `tests/health-native-contract.test.ts`：Keychain、JWT、缺失值、后台标记和
  Realtime 用户过滤的跨层合同。

截至 2026-09-02，本轮 Windows 自动化已通过 `npm run verify`、
`npm run interaction:test`、`npm run auth:verify:production`、
`npm run supabase:verify-shared`、`npm run health:audit:production`、
`npm run cap:sync`、PBX 独立解析和 watchOS target 静态合同；生产 Realtime
迁移与 10 个更新 Function 已上线。最终视觉回归生成 4 个规定视口共 96 个
页面状态截图，零控制台错误和零横向溢出。该证据不能替代 Mac Swift 编译或
Apple 真机验收。

## 10. 官方依据

- Apple HealthKit: https://developer.apple.com/documentation/healthkit
- HealthKit authorization: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- HealthKit observer queries: https://developer.apple.com/documentation/healthkit/executing-observer-queries
- HealthKit background entitlement: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.background-delivery
- Apple distribution/TestFlight: https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases
- Capacitor iOS: https://capacitorjs.com/docs/ios
- Capacitor workflow: https://capacitorjs.com/docs/basics/workflow
- Supabase Edge Function authentication: https://supabase.com/docs/guides/functions/auth
