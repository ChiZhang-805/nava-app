# NAVA ChronoState V4 实现报告（2026-07-18）

## 结论

本轮已经把 App 后端节律算法从 NAVA Fusion v3 升级为 NAVA ChronoState V4。V4 不再是单日证据融合，而是面向 Apple Watch / Apple 健康数据的动态状态估计引擎。

核心能力：

- 42 天指数衰减鲁棒个人基线。
- 四个潜在状态：`circadian`、`recovery`、`behavior`、`affect`。
- 七类观测信号：睡眠、活动、昼夜节律、情绪、饮食、专注、恢复。
- Student-t 鲁棒 sequential state-space filter。
- 风险敏感下尾效用，防止关键短板被平均数掩盖。
- 急性多域一致证据，能更快响应连续下滑和突发转折。
- Bayesian online change-point detection。
- 80% 分数区间、数据质量、异常旗标和可解释建议。

## 已实现代码

- `supabase/functions/_shared/rhythm-core.ts`
  - 纯 TypeScript 算法核心，不依赖 Supabase/Deno，便于单测和基准测试。
  - `rhythmModelVersion`：`nava-chronostate-v4-2026-07`。
  - `rhythmSchemaVersion`：`4.0.0`。

- `supabase/functions/_shared/rhythm.ts`
  - Supabase 数据适配层。
  - 读取 42 天历史窗口。
  - 保存 V4 输出到 `daily_rhythm_scores`。

- `supabase/functions/rhythm-score/index.ts`
  - 用户主动刷新某日节律分。

- `supabase/functions/health-sync-ingest/index.ts`
  - 接收 iPhone / Apple Watch 多日 HealthKit summary。
  - 写入健康快照、睡眠、运动，并刷新节律分。

- `native/ios/NavaHealthPlugin.swift`
  - 支持最近多日摘要。
  - 睡眠窗口改为跨午夜。
  - 小时活动 bins 避免发送未来 0 值。

- `algorithm/synthetic.ts`
  - 构建异质合成用户和 10 类压力场景。

- `scripts/benchmark-rhythm-v4.ts`
  - 可重复基准测试和调参入口。

- `tests/rhythm-core.test.ts`
  - 空数据、异常穿戴值、合成数据总体性能和场景覆盖测试。

## 数据库变化

迁移文件：

```text
supabase/migrations/202607180003_nava_chronostate_v4.sql
```

新增/扩展：

- `health_metric_snapshots.sleep_start_at`
- `health_metric_snapshots.sleep_end_at`
- `health_metric_snapshots.sleep_efficiency`
- `health_metric_snapshots.timezone_offset_minutes`
- `health_metric_snapshots.activity_coverage_hours`
- `daily_rhythm_scores.score_lower`
- `daily_rhythm_scores.score_upper`
- `daily_rhythm_scores.latent_state`
- `daily_rhythm_scores.change_point_probability`
- `daily_rhythm_scores.trend_slope`
- `daily_rhythm_scores.schema_version`
- `rhythm_outcome_feedback`
- 多表历史查询索引

## 基准结果

固定种子 1000 用户、10 类场景，每类 100 人：

| 指标 | V4 | 旧单日 proxy |
| --- | ---: | ---: |
| MAE | 5.091 | 7.694 |
| RMSE | 6.566 | 9.617 |
| Bias | -0.800 | 5.693 |
| Spearman | 0.7586 | 0.7351 |
| 80% 区间覆盖 | 0.961 | - |
| 平均置信度 | 0.766 | - |
| 单用户耗时 | 24.1 ms | - |

按场景看，V4 在 clean、random missing、burst missing、outliers、sensor bias、gradual decline、abrupt shift、shift worker、cold start 上优于旧 proxy；conflicting signals 仍偏保守，是后续真实数据校准重点。

## 技术壁垒

技术壁垒不是某一个单独公式，而是这条完整链路：

1. Apple Health 多日数据接入和清洗。
2. 睡眠、活动、恢复、主观状态的个人化鲁棒基线。
3. 经典昼夜节律特征 RA、IV、IS、M10、L5、cosinor、SRI。
4. 多信号 Student-t 鲁棒状态空间融合。
5. 风险敏感下尾效用和急性一致证据。
6. 变点检测与趋势压力。
7. 可解释输出、异常旗标、数据质量和不确定性区间。
8. 合成压力测试和未来真实反馈闭环。

## 仍需真实数据校准

- HealthKit/WatchKit 需要 Mac + Xcode + 真机验证。
- V4 当前基准是工程合成压力测试，不是医学验证。
- 急性证据、HRV、静息心率、RA/IV/IS 阈值需要真实用户 14 天以上数据校准。
- `rhythm_outcome_feedback` 需要产品入口，让用户反馈“今天建议是否有效”。
- 饮食照片和面部状态仍需算法端正式服务 URL、key 和返回 schema。
