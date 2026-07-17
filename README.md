# NAVA App

NAVA App 是 `Tj-jiaoao/style-muse-next` 的移动端工程，目标是服务 Apple Watch / Apple 健康用户，并和 Web 端共享同一套 Supabase 账号、数据库、Storage 与 Edge Functions。

## 当前阶段

- iPhone 竖屏 App 骨架。
- Supabase 登录 / 注册 / 退出。
- 今日页读取 Web 同源数据。
- 情绪、睡眠、运动、饮食、专注记录写入。
- AI 聊天调用同源 Edge Functions。
- HealthKit 与 Apple Watch 架构接口占位。
- Web 上游同步脚本。

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

