# NAVA Fusion v3 实现报告（2026-07-18）

## 结论

本轮已经把后端节律算法从 v2 的“个人基线 + 动态多信号融合”升级为 NAVA Fusion v3。当前总分不再是简单加权平均，而是由以下机制共同生成：

- 个人 28 天基线。
- Apple Watch / Apple 健康小时活动曲线。
- M10、L5、RA、IV、IS 非参数昼夜节律特征。
- 睡眠阶段、HRV SDNN、静息心率、血氧等恢复信号。
- 可靠度修正的 Bayesian log-odds evidence。
- Dempster-Shafer belief / disbelief / uncertainty 证据质量合成。
- 几何短板约束。
- 异常风险门控。
- 信号冲突惩罚。

## 已实现代码

- `supabase/functions/_shared/rhythm.ts`
  - `rhythmModelVersion` 升级为 `nava-fusion-v3-2026-07`。
  - 新增 `circadian` 信号。
  - 新增 `reliability` 信号可靠度。
  - 新增 `activityRhythm` 特征：M10、L5、RA、IV、IS。
  - 新增非线性融合函数 `fuseRhythmState`。
  - 新增 Dempster-Shafer 证据质量合成。
  - 新增日夜活动幅度弱、日内碎片化高等异常旗标。

- `supabase/functions/health-sync-ingest/index.ts`
  - 接收 `activityBins` 和 `sleepStageMinutes`。
  - 写入 `health_metric_snapshots`。
  - 只要有小时活动或睡眠阶段，也会触发健康快照写入。

- `native/ios/NavaHealthPlugin.swift`
  - 新增 HealthKit 读取：静息心率、HRV SDNN、睡眠阶段。
  - 新增 24 小时活动 bins：步数、主动能量、运动分钟。
  - 最新心率、静息心率、HRV、血氧限定为当天样本。

- `src/services/health.ts`
  - 前端/原生桥接类型新增 `activityBins`、`sleepStageMinutes`。
  - Demo 模式补齐可测试数据。

- `supabase/migrations/202607180002_nava_fusion_v3.sql`
  - `health_metric_snapshots` 新增 `activity_bins`、`sleep_stage_minutes`。
  - `daily_rhythm_scores` 新增 `fusion`、`circadian_score`、`data_quality_score`。

## 已更新文档

- `docs/algorithm-research.md`
  - 调研清单扩展到 32 类算法/方法。
  - 明确 v3 的非简单加权融合机制。
  - 补充多传感器融合、Dempster-Shafer、NPCRA、RA/IV/IS 等资料来源。

- `docs/app-backend.md`
  - 后端说明从 v2 更新到 NAVA Fusion v3。
  - 补齐输出字段和部署说明。

- `docs/backend-required-changes.md`
  - 补齐 v3 migration。
  - 告诉 Web 端需要兼容哪些新字段。

## 本轮验证

- `npm run lint`：通过。
- Edge Functions TypeScript 转译扫描：通过。
- `npm run build`：通过。
- `npm audit --audit-level=moderate`：0 个漏洞。
- `npm run backend:verify`：通过；本机未安装 Deno，所以脚本按设计跳过 Deno 类型检查。
- `npm run verify`：通过。
- `npm run screenshots`：通过，已生成 14 张 iOS 竖屏截图。
- 人工截图检查：登录、今日、记录、AI、趋势、我的页未发现明显重叠或溢出。

## 仍需外部提供

- Supabase 项目 ref 和部署权限。
- 生产/测试环境划分。
- Supabase CLI 登录环境。
- Deno 或 Supabase CLI 的 Edge Function 本地类型检查环境。
- Mac、Xcode、Apple Developer Team，用于真机编译 HealthKit/WatchKit。
- 算法端正式饮食识别、人脸状态识别服务 URL、鉴权 key、返回 schema。

## 后续建议

1. 在 Mac 上编译 iOS target，确认 HealthKit entitlement 和 Swift 代码。
2. 部署 v3 migration 和 Edge Functions 到 Supabase staging。
3. 用真实 Apple Watch 数据跑 7-14 天，校准 RA/IV/IS、HRV、静息心率阈值。
4. Web 端读取 `daily_rhythm_scores.fusion` 和 `features.circadian.activityRhythm`，做算法后台或调试页。
5. v4 再进入个性化推荐：Contextual Bandit、MAD 稳健异常检测、EWMA/CUSUM 趋势漂移、SHAP 可解释模型。
