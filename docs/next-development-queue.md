# NAVA App 下一步开发队列

## 当前已完成

- 独立 App 仓库骨架。
- iPhone 竖屏移动端 UI。
- Supabase 登录、注册、退出。
- 今日页读取同源 Web 数据。
- 情绪、睡眠、运动、饮食、专注写入。
- AI 聊天调用同源 Edge Functions。
- AI 抽取 sleep / exercise / profile 后自动落表。
- 手机号 / 邮箱验证码登录注册。
- 资料编辑并写入 `profiles`。
- HealthKit JS 桥接和 Swift 插件文件。
- iPhone 侧 WatchConnectivity 插件和 Watch 侧管理器文件。
- Web 上游同步脚本。
- App 专属 Edge Functions 和后端部署脚本。
- NAVA ChronoState V4.8 服务端节律算法。
- 42 天鲁棒个人基线、四因子状态空间模型、Student-t 鲁棒融合、急性多域一致证据和变点检测。
- 合成数据压力测试与算法回归测试。
- 构建和 lint 通过。
- 2026-07-17 二次审查已修复 35 项缺口，详见 `docs/code-review-fixes-2026-07-17.md`。

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

## P4：算法校准和推荐学习

目标：用真实 Apple Watch 数据校准 V4，并在有反馈数据后进入个性化推荐。

任务：

1. 在 staging 部署 `202607180003_nava_chronostate_v4.sql` 和全部 Edge Functions。
2. 用 10-20 名真实 Apple Watch 用户跑 14 天数据。
3. 校准睡眠相位、RA/IV/IS、HRV、静息心率和急性证据阈值。
4. 让 Web/算法端读取 `daily_rhythm_scores.fusion` 做审计页。
5. 设计 `rhythm_outcome_feedback` 的用户反馈入口。
6. 反馈数据足够后再做 Contextual Bandit 或 GBDT 辅助推荐。

验收：

- Web、App、Watch 调用同一套 V4.8 节律结果。
- V4.8 在真实数据上的校准曲线、缺失率、异常率和用户反馈闭环可追踪。

## P5：发布准备

任务：

1. TestFlight。
2. Crash/analytics。
3. 隐私政策。
4. 删除账号。
5. 数据导出。
6. Storage 私有化。
7. App Store 权限说明。
