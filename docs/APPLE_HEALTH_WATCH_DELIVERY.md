# NAVA Apple Health / Apple Watch 当前交付方案

首次制定：2026-09-02；当前状态同步：2026-11-03
状态：实施基线；所有勾选项必须有代码、自动化或真机证据，不能以界面占位代替。

## 0A. 2026-11-03 云端 TestFlight 交接状态（最高优先级）

Apple Developer Program 已开通，Team ID 为 `P9N6YYZ7Y9`。App Store Connect 已建立
“NAVA健康节律助手”，Apple App ID 为 `6829876477`；已注册显式 App ID：
`health.nava.mobile` 与 `health.nava.mobile.watchkitapp`。iPhone App ID 已启用 HealthKit
和 Push Notifications，Watch App ID 不额外启用服务。App Store Connect 中仍无构建版本。

源码已整理到分支 `release/testflight-cloud-20261103`，包含 GitHub Actions 工作流
`.github/workflows/ios-testflight.yml`。仓库变量 `NAVA_APPLE_TEAM_ID` 与
`NAVA_IOS_BUNDLE_ID` 已设置，GitHub `testflight` environment 已建立。macOS 15 云端机器
使用 Xcode 26.3 完成 CocoaPods、原生资源逐字节检查，以及 iPhone + 单 target Watch 的
Release 模拟器编译；最新通过记录：GitHub Actions run `41514092275`。这证明工程能在真实
Xcode 工具链编译，但不等于已签名归档、真机通过或已上传 TestFlight。

Windows 已生成 Apple Distribution CSR：
`Q:\NAVA-Workspace\Build\AppleSigning\NAVA_Apple_Distribution.certSigningRequest`。
匹配私钥仅保存在同目录，不得上传 Apple、Git 或聊天。生成和后续 P12 转换脚本分别是：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/apple-signing/New-TestFlightSigningRequest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/apple-signing/Complete-TestFlightCertificate.ps1 `
  -AppleCertificatePath '下载的 distribution.cer'
```

### 账户持有人下一次只需完成的步骤

1. Apple Developer → Certificates 新建 **Apple Distribution** 证书，上传上述 CSR，下载
   `.cer`；不要新建第二把私钥。运行 `Complete-TestFlightCertificate.ps1` 生成 P12。
2. 为 `health.nava.mobile` 与 `health.nava.mobile.watchkitapp` 各建一个 **App Store**
   provisioning profile，均选择这张 Distribution 证书并下载 `.mobileprovision`。
3. App Store Connect → 用户和访问 → 集成 → App Store Connect API，创建具有上传权限的
   API Key，记录 Issuer ID、Key ID，并只下载一次 `.p8`。
4. 在 GitHub `testflight` environment 添加以下 secrets；证书、profile 使用 Base64，
   `.p8` 保存完整文本。不要把内容写进仓库或截图：

   - `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`
   - `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`
   - `APPLE_PROVISIONING_PROFILE_APP_BASE64`
   - `APPLE_PROVISIONING_PROFILE_WATCH_BASE64`
   - `APP_STORE_CONNECT_KEY_ID`
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_PRIVATE_KEY`

   也可在仓库根目录运行 `scripts/apple-signing/Set-TestFlightGitHubSecrets.ps1`，它会从
   标准输入安全交给已登录的 GitHub CLI，不会把 secret 写入仓库或命令行参数。

5. 审看并合并该发布分支到默认分支后，在 Actions → “iOS TestFlight” → Run workflow，
   `operation=upload`、`marketing_version=1.0.0`。构建号留空时工作流使用 GitHub run number；
   每次重传必须递增。上传成功后再到 TestFlight 填测试信息并建立内部测试组。

`NAVA` 作为 App Store 名称已被占用，因此商店记录使用“ NAVA健康节律助手”；这不改变
Bundle ID，也不要求改源码内产品身份。商店显示名之后可以在 App Store Connect 的本地化
信息中调整，只要新名称可用；Bundle ID 创建后不可更换。

## 0. TestFlight 当前准备状态（2026-10-30）

用户确认目前没有 Mac 和已开通的 Apple Developer 账户，本轮先完成代码和交接准备。
本节优先于下方历史执行说明；**没有生成或上传 IPA，没有完成 Xcode/真机验收**。

2026-10-30 后续深入检查：旧素材删除的逐文件退休证据已核实，完整 verify 已通过；
下方“repository:scan 阻塞”为此前结果，现由当前交接开头的检查记录替代。追加原生
Filesystem/Share（Capacitor 7）缓存文件分享、FileTimestamp/C617.1、Pod/插件注册检查；
导出长路径和分页、加密草稿事务、Watch 心情反馈以及大文字重排修复均在本地。
Mac 安装 Pods 后必须检查新增插件实际链接，真机验证保存到 Files/报告分享、取消与
较大归档，Watch 验证小屏滚动与离线排队。后端导出函数尚未部署，生产全链路未验收。

### 已补齐的工程准备

- iPhone 与 Watch 分别添加 `PrivacyInfo.xcprivacy`，均真正加入各自的 Resources phase。
  原生后台标记与 Watch `@AppStorage` 使用 app-local UserDefaults，声明理由 `CA92.1`；
  声明非跟踪、空跟踪域名和实际账号关联的数据类别，不能填写“完全不收集数据”。
- iPhone Debug 保留开发 APNs entitlement；Release 使用 `App.Release.entitlements` 的
  production 环境，同时保留 HealthKit 和 Background Delivery。最终分发包的签名权限
  仍须在 Organizer/真机核实，配置文件不是生产推送成功证明。
- 添加可共享的 `App.xcscheme`（包含 iPhone/Watch）及 workspace 引用，避免依赖某台
  Mac 的 xcuserdata。用户已确认首版 iOS 最低版本改为 16.4，Watch 为 9.0；
  **编译 SDK 必须是 26+，不等于最低系统版本要改成 26**。
- 设备架构改为 arm64；两端 1024px 图标已验证为无 alpha 的 RGB PNG。
- 中英文语音用途文案明确音频可能由 Apple 服务器处理，不再承诺只在设备端识别。
- `.env.native` 仅包含 canonical Supabase 公开配置。原生构建强制生产环境、关闭 demo，
  防止 `capacitor://localhost` 被开发机残留的 demo 环境变量误开启；浏览器会话合同不变。
- `npm run cap:sync:ios` 只同步 iOS，不顺带改 Android。`ios:release:check` 解析 PBX/plist，
  验证两个 target 的身份、版本、资源、权限与图标；`ios:release:test` 覆盖反例。
- Mac 脚本要求 Xcode 26+、iOS/watchOS 设备与模拟器 SDK 26+、Node 22.18+、CocoaPods。
  默认只做无签名编译；显式选择归档时要求干净源码、真实 Team、已批准 Bundle ID、
  三段版本号、新的 1–9999 构建号，并对两个 target 一致赋值。
  同步产生的 Podfile.lock/PBX 修改必须先审看提交；已有归档目录不会覆盖。
  归档后检查实际包内身份、版本、SDK、隐私清单和代码签名。
  可选导出 App Store Connect IPA，脚本不自动上传、不邀请测试者、不提交审核。

### 当前验证与限制

- 原生 `build:native`、lint、portable/PowerShell iOS 合同、发布检查通过。
- 发布专用 10 项测试、健康/Watch/照片/语音/推送/同意/账号数据合同，以及动画/通知
  专项测试通过。`auth:verify:production` 通过公开 Auth 设置和 OPTIONS 可达性检查；
  没有测试真实 OTP 收发、登录、健康写入或删除真实账号。
- `cap copy ios` 完成，267 个网页资源与 dist 逐字节相同，27 个 JS/CSS 通过原生模拟层排除。
  这不是 CocoaPods 安装或 Swift 编译。Bash 语法检查通过；Mac 分支未执行。
- 新增解析工具仅为开发依赖 `plist 3.1.1`、`xcode 4.0.0`；npm audit 为 0 漏洞。
- 完整 `npm run verify` 在 repository:scan 被**本轮之前的 tracked 文件删除**阻止。
  没有恢复或提交这些旧素材，也没有跳过门禁冒充通过。日志在
  `artifacts/test-runs/ios-release/full-verify.log`；发布前必须整理成一个保留既有修改、
  经过审看的源码提交并重跑完整门禁。开始时主检出落后 origin/main 32 提交，不能直接 pull
  覆盖工作区，也不能把其他人的未提交修改整体提交。本轮未 push 或更改两个公开站点。

### Mac 接手操作

1. 取得包含本轮修改的、已审看提交的源码。先安装 Xcode 26+ 并完成首次启动、许可和
   iOS/watchOS 平台下载；`xcode-select -p` 应指向完整 Xcode，不能只装 Command Line Tools。
   安装 Node 22 LTS（22.18+）及 CocoaPods。不要从 Windows 复制 node_modules/Pods。
2. 在仓库根目录运行 `npm run ios:prepare:release`。脚本会 npm ci、检查、构建、同步、
   CocoaPods 安装及无签名 Release 编译。第一次生成的 Podfile.lock 和 Xcode 依赖变化
   审看后提交；保留锁文件，之后用相同锁定输入构建。
3. 开通 Apple Developer Program，在 App Store Connect 建立 NAVA 应用记录；由所有者
   确认 Team ID 和唯一 Bundle ID。当前为 `health.nava.mobile`，Watch 为其 `.watchkitapp`
   子 ID；若已有 `health.nava.app` 身份，先核实归属，不能重新占一个身份代替。
   改根 ID 时同时改 capacitor.config.ts、PBX 中 Debug/Release 的 NAVA_APP_BUNDLE_ID，
   以及服务端 APNS_BUNDLE_ID；服务端配置由授权人员另行操作。
4. 用 `npm run cap:open:ios` 打开 workspace。两个 target 选择同一 Team；注册对应
   App ID 和签名配置，启用 iPhone HealthKit/Background Delivery/Push Notifications。
   在真实 iPhone/Watch 完成下方验收矩阵，检查登录恢复、拒绝授权、相机、录音中断、
   通知与账号切换，记录设备型号/系统版本/源码提交，不能以浏览器模拟替代。
5. 使用真实值替换以下示例后归档。每次上传递增 build number；App 和 Watch 自动保持一致：

   ```bash
   export NAVA_ARCHIVE=1
   export NAVA_APPLE_TEAM_ID=YOURTEAMID
   export NAVA_IOS_BUNDLE_ID=health.nava.mobile
   export NAVA_IOS_VERSION=1.0.0
   export NAVA_IOS_BUILD_NUMBER=1
   # 仅在允许 Xcode 联网创建/更新开发团队 provisioning profiles 时开启：
   export NAVA_ALLOW_PROVISIONING_UPDATES=1
   # 可选：归档成功后导出 IPA，不会自动上传。
   export NAVA_EXPORT=1
   npm run ios:prepare:release
   ```

   产物在 `artifacts/ios/<version>-<build>/`，包含源码提交回执、解析后的构建设置、
   `.xcarchive`，以及开启导出时的 `export/`。不要把证书、p12、私钥或会话令牌提交到 Git。
6. 在 Xcode Organizer 打开归档，Validate App 后 Distribute App → App Store Connect。
   普通 App Store Connect 分发可用于后续外测和正式发布；若选 TestFlight Internal Only，
   该构建不能转外测/正式上架，届时须重新上传适当的构建。
7. 等待处理，按实际加密用途回答出口合规问卷，再在 TestFlight 建内部测试组。
   内测最多 100 位具有适当 App Store Connect 权限的成员；无需后台权限的其他同事走
   外测（首个构建需 Beta Review）。团队安装 TestFlight 后接受邀请；构建有效期 90 天。

### 仍需所有者或真实环境完成，不能用代码伪造

| 项目 | 当前状态与操作 |
| --- | --- |
| 开发者组织与签名 | 未开通；所有者完成注册、协议、付费、Team/App ID 和分发权限。 |
| Mac 编译与真机 | 未执行；包括 Xcode 26 SDK 兼容性、Watch 嵌入、运行时权限和真实同步。 |
| APNs 后端 | 客户端 Release 已准备；需授权人员配置 APNS_KEY_ID/TEAM_ID/PRIVATE_KEY/BUNDLE_ID，TestFlight 使用 APNS_ENVIRONMENT=production，再真机收推送。仅设置 entitlement 不足以交付推送。 |
| 审核联系资料 | 需真实联系邮箱、电话、运营主体、可公开访问的支持/隐私网址。当前 privacy.html 的“仓库维护者渠道”不是已确认的客服联系资料。 |
| 隐私政策与 App Privacy | 清单是源码基线；负责人须核实实际服务商、保留/删除规则和区域，补齐公开政策与商店问卷。现有政策尚未逐一说明 DeepSeek、阿里云视觉服务和 Apple 语音的数据处理。不得勾选“不收集数据”。 |
| AI 告知与同意 | 已有可选授权和后端限制，但仍须逐入口核实第三方接收数据的告知与明确同意是否充分；健康授权不能自动等于向第三方 AI 共享许可。 |
| 加密出口合规 | HTTPS/Keychain/WebCrypto 等实际用途需按苹果问卷确认；未擅自填写 ITSAppUsesNonExemptEncryption=false。 |
| 外测/商店材料 | 填年龄分级、Beta 描述、What to Test、反馈邮箱、审核联系和可用测试登录方式；正式上架另补真实截图和商店说明，不使用生产用户账号作为审核账号。 |
| 账号与数据验收 | 代码有导出/删除链路；仍需一次性测试账户验证注册、退出/恢复、同意撤回、RLS 隔离、删除云端与本机数据。 |

隐私清单映射：姓名/邮箱/手机号/用户 ID 对应账号；健康和健身对应自填与 HealthKit；
照片对应用户选定上传；其他用户内容对应日记/对话/任务/附件；设备 ID 对应安装 ID 与
推送 token；产品交互对应 `analytics_events`（账号关联）；购买历史对应积分兑换记录，
不是银行卡信息；其他数据对应生日/画像/偏好。Watch 清单仅列其情绪/节律与专注内容。
当前未声明广告跟踪、定位、通讯录或 NAVA 存储原始录音；Apple Speech 可能联网处理音频，
该服务的数据处理需在最终隐私说明和问卷中核实。不要仅因采用公开 SDK 就宣称无需披露。

Beta 描述草稿：NAVA 帮助记录情绪、睡眠、运动、饮食与专注，并提供非诊断性的节律观察
和可选 AI 辅助。What to Test 草稿：注册登录与会话恢复、记录保存和跨端一致性、健康权限
允许/拒绝/撤销、照片与语音、通知、前后台切换、Watch 情绪和专注同步；请注明设备和系统
版本，反馈中避免上传真实健康原文或账号凭据。联系人和测试账号待所有者填写。

官方依据（2026-10-30 核对）：
[SDK 要求](https://developer.apple.com/news/upcoming-requirements/)、
[TestFlight](https://developer.apple.com/testflight/)、
[Capacitor 7 隐私清单](https://capacitorjs.com/docs/v7/ios/privacy-manifest)、
[苹果数据类型](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)、
[Apple Speech 授权](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)。

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
- Watch 动作在 iPhone WebView 尚未启动时先写入受文件保护的原生队列；转存到账号
  隔离的 Web 队列后仍不立即删除，只有 canonical Supabase 已接受稳定 action id 才确认
  原生副本；断网时两层队列都可安全重放。
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
- [x] 手工睡眠维持只填起止时间与总时长，不按比例伪造深睡、浅睡或 REM；阶段值只来自
  HealthKit 实测或用户明确填写。
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
- [x] 已部署并验证本轮更新后的 `health-sync-ingest`；线上为 v12 且强制 JWT。空摘要不再
  生成空节律分，活动分箱、ISO 时间、心率/HRV/血氧、睡眠效率和覆盖时长均先做边界校验。
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
- [x] `focus.start` 被服务端明确接收但不提前写完成记录；`focus.stop` 通过生产
  `record_focus_session` RPC 在同一事务写 `focus_session_events`、日聚合与时段分布。
  失败 receipt 和超过五分钟的处理中 receipt 可安全重领，重复 action id 不重复累计。
- [x] Watch 动作携带设备本地日期与时区偏移；服务端按动作发生时间写入本地日期、
  专注起止时间和 `focus_time_distribution` 时段，不再使用服务器接收时间分桶。
- [x] Watch 快捷情绪不会覆盖同一天已有的用户原因与日记；新建的快捷记录只保留
  Watch 来源因子，不伪造用户日记内容。
- [ ] 真机验证即时消息、Watch 不可达、离线 `transferUserInfo` 重放和重复动作。

“专注期间硬件指标分析”继续延期，不得因为已有每日 HealthKit 数据而标记完成。
积分商城已在独立的 Supabase 商品/购物车/订单合同中实现，不依赖 HealthKit 或 Watch 数据。

## 5. iOS 打包与发布流程

Windows 可完成 TypeScript、Web 构建、Supabase、Swift 静态合同和网页测试，
但苹果签名、HealthKit 真机和 IPA/TestFlight 最终构建必须在 macOS 上使用
Xcode。

在 Mac 上：

```bash
git clone <NAVA private repository>
cd nava-app
npm run ios:prepare:release
npm run cap:open:ios
```

然后在 Xcode 中：

1. 打开 `ios/App/App.xcworkspace`，不要只打开 `.xcodeproj`。
2. 选择唯一正式 Apple Developer Team 和 bundle ID。
3. 检查 iPhone target 的 HealthKit 与 Background Delivery capability。
4. 连接 iPhone，选择真机作为 Run Destination，Build & Run。
5. 完成权限和数据闭环测试后，选择 Generic iOS Device / Any iOS Device，执行
   Product -> Archive。
6. 在 Organizer 中先 Validate App，再按本文件 §0 选择 App Store Connect 或仅内部测试分发。
7. 内部真机验收通过后才提交 App Store Review。

每次 Web 代码更新进入原生包前都必须重新运行 `npm run cap:sync:ios`，把最新
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

- `scripts/prepare-ios-release.sh`：在 Mac 上安装、原生专项验证、Capacitor 同步并做
  无签名 Release 编译；设置显式环境变量后才允许 Archive。
- `scripts/verify-health-sync-boundary.mjs`：使用一次性测试用户 access token，
  指定本地记录日期和已有记录的第二测试用户，只读验证同步任务、规范化记录和
  跨用户 RLS，不打印身份或健康值。
- `scripts/audit-health-functions.mjs`：只读核对线上正式/旧健康 Function 的状态
  和 JWT 配置。
- `docs/APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md`：真机证据模板。
- `tests/health-native-contract.test.ts`：Keychain、JWT、缺失值、后台标记和
  Realtime 用户过滤的跨层合同。

截至 2026-09-07，本轮 Windows 自动化已再次通过 `npm run verify`（27/27）、
`npm run interaction:test`、`npm run auth:verify:production`、
`npm run supabase:verify-shared`、`npm run health:audit:production`、
PBX 独立解析和 watchOS target 静态合同；生产 24 项 migration 已对齐，
`health-sync-ingest` ACTIVE v12 / `watch-sync` ACTIVE v13，且均强制 JWT。
首页、通知和编辑器视觉回归在四个规定视口通过，交互回归通过 11 组主流程。
该证据不能替代 Mac Swift 编译或
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
