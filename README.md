# NAVA App

NAVA App 是 `Tj-jiaoao/style-muse-next` 的移动端工程，目标是服务 Apple Watch / Apple 健康用户，并和 Web 端共享同一套 Supabase 账号、数据库、Storage 与 Edge Functions。

## 当前阶段

- iPhone 竖屏 App 骨架。
- Supabase 登录 / 注册 / 退出。
- 今日页读取 Web 同源数据。
- 情绪、睡眠、运动、饮食、专注记录写入。
- AI 聊天调用同源 Edge Functions，已覆盖自然语言抽取和回复。
- HealthKit JS 桥接与 iOS Swift 插件模板。
- Apple Watch 快照发布与 WatchConnectivity 插件模板。
- Web 上游同步脚本。
- App 专属 Edge Functions、Supabase migrations 和部署脚本。
- NAVA ChronoState V4.3 服务端节律算法。
- 合成数据压力测试与算法回归测试。

## 本地运行

```bash
npm install
copy .env.example .env
npm run dev
```

`.env` 必须使用和 Web 端同一个 Supabase 项目：

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## iOS

```bash
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

Apple Watch target 需要在 Xcode 中创建 watchOS App，并按 `docs/watch-architecture.md` 接入 WatchConnectivity。

## 验证

```bash
npm run verify
npm run backend:verify
npm run algorithm:test
npm run algorithm:benchmark -- --users=200
```

`verify` 会执行构建、lint 和 npm audit；`backend:verify` 检查 Edge Functions、shared 后端文件、migrations 和前端 secret；`algorithm:test` / `algorithm:benchmark` 用于验证 V4.3 算法核心。

当前 App 后端函数：`ai-extract-data`、`ai-chat-reply`、`diet-extract`、`face-analyze`、`health-sync-ingest`、`watch-sync`、`rhythm-score`、`export-user-data`。

## 已知边界

- Windows 本机不能完成 iOS/Watch 真机编译，HealthKit 和 WatchConnectivity 需要在 Mac + Xcode 中接入 target 后验证。
- App 端只保存 Supabase anon key，不允许保存 service role key 或模型服务密钥。
- 饮食照片和面部照片上线前必须改为私有 Storage 策略。
