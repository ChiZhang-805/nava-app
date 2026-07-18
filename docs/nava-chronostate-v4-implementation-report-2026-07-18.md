# NAVA ChronoState V4.6 实现报告（2026-07-18）

## 结论

App 后端节律算法已从 NAVA Fusion v3 升级为 NAVA ChronoState V4.6。它不再是单日简单加权，而是面向 Apple Watch / Apple 健康数据的动态状态估计引擎：用 42 天个人基线、四因子状态空间、Student-t 鲁棒滤波、信号连续性、绝对生理压力、慢性低谷记忆、功能补偿门控和变点检测共同生成分数。

V4.6 本轮重点解决 V4.5 的一个明显短板：长期低谷后最后几天表面略有反弹，但 HRV、静息心率和睡眠没有确认恢复的 `masked_gradual_decline` 场景。该场景 MAE 从 V4.5 的 `21.791` 降到 V4.6 的 `16.829`，并从弱于 legacy 变为优于 legacy。

## 已实现代码

- `supabase/functions/_shared/rhythm-core.ts`
  - 纯 TypeScript 算法核心，不依赖 Supabase/Deno，便于单测和基准测试。
  - `rhythmModelVersion`：`nava-chronostate-v4.6-2026-07`。
  - `rhythmSchemaVersion`：`4.6.0`。

- `supabase/functions/_shared/rhythm.ts`
  - Supabase 数据适配层。
  - 读取 42 天历史窗口。
  - 保存 V4.6 输出到 `daily_rhythm_scores`。

- `supabase/functions/rhythm-score/index.ts`
  - 用户主动刷新某日节律分。

- `supabase/functions/health-sync-ingest/index.ts`
  - 接收 iPhone / Apple Watch 多日 HealthKit summary。
  - 写入健康快照、睡眠、运动，并刷新节律分。

- `native/ios/NavaHealthPlugin.swift`
  - 支持最近多日摘要。
  - 睡眠窗口跨午夜。
  - 小时活动 bins 避免发送未来 0 值。

- `algorithm/synthetic.ts`
  - 构建 16 类手工用户画像、22 类压力场景和非均匀缺失分布。
  - V4.6 新增并压测 `sparse_abrupt_drop`、`masked_gradual_decline`。

- `scripts/benchmark-rhythm-v4.ts`
  - 可重复基准测试和调参入口。

- `tests/rhythm-core.test.ts`
  - 空数据、异常穿戴值、合成数据总体性能和场景覆盖测试。

## 核心机制

1. 四个潜在状态：`circadian`、`recovery`、`behavior`、`affect`。
2. 七类观测信号：睡眠、活动、昼夜节律、情绪、饮食、专注、恢复。
3. 42 天指数衰减鲁棒个人基线。
4. Student-t 鲁棒 sequential state-space filter。
5. 风险敏感下尾效用，防止关键短板被平均数掩盖。
6. `signalHealth`：按信号计算 availability、recency、longest gap 和 quality。
7. `drawdownPressure`：近期慢性低谷记忆。
8. `transitionPressure`：突发转折压力。
9. `chronicDebtPressure`：慢性低谷后短期反弹仍未完全恢复的压力。
10. `functionalCompensation`：高活动/高专注但恢复偏低时的功能补偿门控。
11. `sparseTransitionShock`：稀疏穿戴数据下的断崖式下滑响应。
12. `drawdownStallPressure`：长期 drawdown 后当天中等信号不足以证明恢复时的锚定压力。
13. `physiologyStrainPressure`：短睡、低 HRV、高静息心率共同出现时的绝对生理压力。
14. `unresolvedDrawdownPressure`：近期低谷后表面反弹但缺少生理恢复确认时的假恢复压力。
15. Bayesian online change-point detection。
16. 80% 分数区间、数据质量、异常旗标和可解释建议。

## 数据库变化

迁移文件：

```text
supabase/migrations/202607180003_nava_chronostate_v4.sql
```

主要字段：

- `daily_rhythm_scores.fusion`
- `daily_rhythm_scores.score_lower`
- `daily_rhythm_scores.score_upper`
- `daily_rhythm_scores.latent_state`
- `daily_rhythm_scores.change_point_probability`
- `daily_rhythm_scores.trend_slope`
- `daily_rhythm_scores.schema_version`
- `health_metric_snapshots.activity_bins`
- `health_metric_snapshots.sleep_stage_minutes`
- `rhythm_outcome_feedback`

V4.6 新字段都在 `fusion.utilityFusion` JSON 中，不需要新增数据库列。

## 基准结果

固定种子 1000 用户、16 类用户画像、22 类压力场景、非均匀加权人群：

| 指标 | V4.6 | 旧单日 proxy |
| --- | ---: | ---: |
| MAE | 5.787 | 9.334 |
| RMSE | 7.744 | 11.921 |
| Bias | 0.653 | 3.857 |
| Spearman | 0.8153 | 0.7705 |
| Low-state AUROC | 0.9653 | 0.9335 |
| MAE 改善 | 38.00% | - |
| RMSE 改善 | 35.04% | - |
| 80% 区间覆盖 | 0.932 | - |
| 平均置信度 | 0.721 | - |
| 平均区间宽度 | 30.045 | - |
| 单用户耗时 | 27.9 ms | - |

旧 20 场景对照中，V4.6 MAE 为 `5.541`，旧 proxy MAE 为 `8.665`，MAE 改善 `36.06%`。

## 场景结论

- 明显增强：`sparse_abrupt_drop`，V4.6 MAE `2.836`，旧 proxy `6.403`。
- 明显修复：`masked_gradual_decline`，V4.6 MAE `16.829`，V4.5 为 `21.791`，旧 proxy `20.455`。
- 保持优势：clean、random missing、burst missing、outliers、sensor bias、shift worker、cold start、conflicting signals、jet lag、illness recovery、overtraining、weekend rebound、travel gap、low adherence、high adherence、seasonal shift、chronic debt rebound、compensated strain。
- 仍需继续压测：`gradual_decline` 和 `abrupt_shift` 在当前合成点值上仍高于旧 proxy，需要真实用户标签继续校准。

## 技术壁垒

技术壁垒不是某一个单独公式，而是完整闭环：

1. Apple Health 多日数据接入和清洗。
2. 睡眠、活动、恢复、主观状态的个人化鲁棒基线。
3. RA、IV、IS、M10、L5、cosinor、SRI 等经典节律特征。
4. 多信号 Student-t 鲁棒状态空间融合。
5. 风险敏感下尾效用和急性一致证据。
6. 慢性低谷记忆、慢性负债压力、功能补偿门控、稀疏断崖响应。
7. 绝对生理压力和假恢复 drawdown 压力。
8. 变点检测、趋势压力、不确定性区间和可解释输出。
9. 大规模合成压力测试和未来真实反馈闭环。

## 仍需真实数据校准

- HealthKit / WatchKit 需要 Mac + Xcode + 真机验证。
- V4.6 当前基准是工程合成压力测试，不是医学验证。
- HRV、静息心率、短睡、RA/IV/IS 阈值需要真实用户 14 天以上数据校准。
- `rhythm_outcome_feedback` 需要产品入口，让用户反馈“今天建议是否有效”。
- 饮食照片和面部状态仍需算法端正式服务 URL、key 和返回 schema。
