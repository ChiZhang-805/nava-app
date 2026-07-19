# NAVA App

NAVA App 是 `Tj-jiaoao/style-muse-next` 的移动端工程，目标是服务 Apple Watch / Apple 健康用户，并和 Web 端共享同一套 Supabase 账号、数据库、Storage 与 Edge Functions。

## 当前阶段

- iPhone 竖屏 App 骨架。
- Supabase 登录 / 注册 / 退出。
- 今日页读取 Web 同源数据。
- 情绪、睡眠、运动、饮食、专注记录写入。
- AI 聊天调用同源 Edge Functions，已覆盖自然语言抽取和回复。
- 已生成的 Capacitor iOS Xcode 工程，锁定 iPhone 竖屏。
- HealthKit JS 桥接、HealthKit entitlement 与已注册的 iOS Swift 插件。
- Apple Watch 快照发布与已注册的 WatchConnectivity iPhone 侧插件。
- Web 上游同步脚本。
- App 专属 Edge Functions、Supabase migrations 和部署脚本。
- NAVA ChronoState V4.8 服务端节律算法。
- 合成数据压力测试与算法回归测试。

## 本地运行

```bash
npm install
copy .env.example .env
npm run dev
```

需要跳过登录查看完整 App 界面时，打开 `http://127.0.0.1:5173/?demo=1`。Demo 入口只在 Vite 本地开发环境生效，生产构建和正式 iOS App 不允许通过该参数绕过登录。

`.env` 必须使用和 Web 端同一个 Supabase 项目：

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## iOS

```bash
npm run cap:sync
npm run ios:verify
npm run cap:open:ios
```

`ios/` 工程已提交，不要再次执行 `npx cap add ios`。在 Mac 上首次打开前安装 CocoaPods；随后在 Xcode 选择 Apple Developer Team，并确认 HealthKit capability 与 `App/App.entitlements` 一致。Apple Watch target 仍需在 Xcode 中创建 watchOS App，并按 `docs/watch-architecture.md` 接入 WatchConnectivity。

App 图标和启动图由当前 NAVA 字标与 WebGL 背景生成，不依赖外部图片。需要重做资源时，先运行 `npm run dev`，再在另一个终端执行 `npm run ios:assets`；脚本会生成 `1024x1024` 图标和 `2732x2732` 启动图，并检查字形中心与裁边安全区。

## 验证

```bash
npm run verify
npm run backend:verify
npm run algorithm:test
npm run data:audit
npm run data:export
npm run algorithm:benchmark
```

`verify` 会执行构建、lint、npm audit、动效/算法测试、后端契约、全部 Edge Function Deno 类型检查、OTP 安全测试与 iOS 工程契约；`data:audit` 默认生成并审计 5000 个合成用户；`data:export` 默认导出同一批 5000 用户 JSONL 和 manifest 到 `artifacts/synthetic-population`，该目录只作为本地大文件产物，不提交 Git；`algorithm:test` / `algorithm:benchmark` 用于验证 V4.8 算法核心，正式 benchmark 默认 5000 用户。

当前 App 后端函数：`ai-extract-data`、`ai-chat-reply`、`diet-extract`、`face-analyze`、`health-sync-ingest`、`watch-sync`、`rhythm-score`、`export-user-data`、`aliyun-sms-send`、`aliyun-sms-verify`。

## 已知边界

- Windows 本机不能完成 iOS/Watch 真机编译与签名；iPhone 工程已生成并静态验证，最终构建仍需 Mac + Xcode，watchOS target 也需在 Xcode 创建。
- App 端只保存 Supabase anon key，不允许保存 service role key 或模型服务密钥。
- 饮食照片和面部照片上线前必须改为私有 Storage 策略。
