# NAVA 文档索引

本目录只保留当前仍承担独立合同、实施说明或验收作用的文档。项目总入口是
[`CODEX_HANDOFF_CURRENT.md`](./CODEX_HANDOFF_CURRENT.md)；版本演进由 Git 历史和
发布 commit 保存，不再为每轮迭代新增 dated handoff、临时审计报告或新任务提示词。

## 当前权威文档

| 文档 | 用途 |
| --- | --- |
| [`CODEX_HANDOFF_CURRENT.md`](./CODEX_HANDOFF_CURRENT.md) | 产品、架构、线上版本、视觉规则、未完成项和接手流程的唯一总交接 |
| [`app-backend.md`](./app-backend.md) | Supabase、Edge Functions、真实数据和 ChronoState 服务合同 |
| [`auth-email-flow.md`](./auth-email-flow.md) | 邮箱、手机号、OTP、会话和找回密码合同 |
| [`SHARED_SUPABASE_READINESS.md`](./SHARED_SUPABASE_READINESS.md) | canonical Supabase 共享状态与核验入口 |
| [`AI_KNOWLEDGE_HARNESS.md`](./AI_KNOWLEDGE_HARNESS.md) | AI 路由、工具、证据、隐私和报告合同 |
| [`APPLE_HEALTH_WATCH_DELIVERY.md`](./APPLE_HEALTH_WATCH_DELIVERY.md) | Apple Health / Watch 已实现链路与剩余人工门槛 |
| [`APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md`](./APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md) | iPhone / Watch 真机验收记录模板 |
| [`watch-architecture.md`](./watch-architecture.md) | Watch companion、动作和通信协议 |
| [`algorithm-research.md`](./algorithm-research.md) | ChronoState 方法选择、演进和后续研究方向 |
| [`chrono-v4.27-fixed-dataset-benchmark.md`](./chrono-v4.27-fixed-dataset-benchmark.md) | 当前 ChronoState V4.27 固定数据集基准证据 |
| [`fdnb-health-integration.md`](./fdnb-health-integration.md) | FDNB 研究层数据合同和门槛 |
| [`ios-motion-background.md`](./ios-motion-background.md) | iOS 动态背景与权限合同 |
| [`local-workspace.md`](./local-workspace.md) | 本地工作区路径和环境说明 |
| [`web-upstream-contract.md`](./web-upstream-contract.md) | 与 Web 上游仓库的协作边界 |

## 维护规则

1. 总体状态只更新 `CODEX_HANDOFF_CURRENT.md`，不要再创建按日期命名的交接副本。
2. 专项合同直接在对应当前文档上更新；新实现取代旧设计时，同一轮删除旧文档和旧
   引用。
3. 一次性测试截图、报告和运行日志放在 `Q:\NAVA-Workspace\Build\TestRuns`，不把
   它们堆进 `docs`。
4. 算法版本只保留当前基准报告；旧版本差异通过 Git 历史查询。
5. 删除文档前确认其有效要求已经进入当前交接或仍保留的专项文档，并用 `rg` 修复
   全仓库引用。
6. 文档减少不等于删除审计历史；Git commit、发布镜像 `source.json` 和 TestRuns
   继续承担可恢复、可追踪证据。
