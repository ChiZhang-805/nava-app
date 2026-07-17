# NAVA App 下一步开发队列

## 当前已完成

- 独立 App 仓库骨架。
- iPhone 竖屏移动端 UI。
- Supabase 登录、注册、退出。
- 今日页读取同源 Web 数据。
- 情绪、睡眠、运动、饮食、专注写入。
- AI 聊天调用同源 Edge Functions。
- HealthKit JS 桥接和 Swift 插件文件。
- WatchConnectivity 管理器文件。
- Web 上游同步脚本。
- 构建和 lint 通过。

## P0：闭环验证

目标：证明 Web 和 App 共享同一个账号、同一套数据。

任务：

1. 使用 Web 端已经注册的账号登录 App。
2. 在 App 的“记录”页保存一条情绪记录。
3. 打开 Web 情绪页，确认同一天记录可见。
4. 在 App 保存睡眠、运动、饮食、专注记录。
5. 打开 Web 对应页面确认数据可读。

验收：

- Web 注册账号能登录 App。
- App 写入 `mood_records` 后 Web 可读。
- App 写入 `sleep_records`、`exercise_records`、`nutrition_records`、`focus_records` 后 Web 可读。

## P1：iPhone 真机 HealthKit

目标：让 Apple Health 数据进入 Supabase。

任务：

1. 在 Mac 上执行 `npx cap add ios`。
2. 把 `native/ios/NavaHealthPlugin.swift` 加入 iOS target。
3. 开启 HealthKit capability。
4. 配置 Info.plist 权限文案。
5. 真机授权 HealthKit。
6. 在“我的”页点击健康同步。
7. 确认同步后的运动数据写入 `exercise_records`。

验收：

- 真机可弹出 HealthKit 权限。
- 步数、活动能量、运动分钟能读出。
- App 写入的数据 Web 可见。

## P2：Apple Watch MVP

目标：Watch 做快捷查看和快捷记录。

任务：

1. 在 Xcode 增加 watchOS App target。
2. 把 `native/watch/WatchSessionManager.swift` 加入 Watch target。
3. iPhone 侧增加 WCSession 发送 Watch 快照。
4. Watch 端做 TodayView。
5. Watch 端做 MoodQuickLogView。
6. Watch 操作通过 iPhone 写入 Supabase。

验收：

- iPhone 登录后 Watch 能看到今日快照。
- Watch 快捷记录情绪后，App 和 Web 都能看到。

## P3：移动端功能补齐

目标：手机端覆盖 Web 端核心能力。

任务：

1. 饮食拍照上传和 `diet-extract` 接口。
2. 睡眠 Apple Watch 阶段数据。
3. AI 抽取后自动落表。
4. 情绪 AI 分析。
5. 专注计时器和本地通知。
6. 趋势页接正式图表。
7. 面部分析保存历史。

验收：

- Web 端核心模块在手机端都有对应体验。
- 手机端不是桌面页缩小版，而是竖屏任务流。

## P4：算法和节律引擎

目标：把静态分数替换为服务端节律算法。

任务：

1. 和算法同学确定 `rhythm-daily` 输入输出。
2. App 今日页调用节律接口。
3. 趋势页展示 7/30/90 天节律变化。
4. AI 解释必须带 reasons、confidence、modelVersion。

验收：

- App 不内置复杂算法。
- Web、App、Watch 调用同一套节律结果。

## P5：发布准备

任务：

1. TestFlight。
2. Crash/analytics。
3. 隐私政策。
4. 删除账号。
5. 数据导出。
6. Storage 私有化。
7. App Store 权限说明。

