# NAVA ChronoState V4.8 实现报告（2026-07-18）

## 本轮目标

V4.8 的重点不是继续做简单加权，而是把算法验证数据从 1000 用户升级到 5000 用户，并让数据分布本身可审计。当前正式合成集默认生成 5000 个用户、约 27 万条日级记录，覆盖 25 类压力场景和 19 类用户 cohort。

## 四类数据

| 类别 | 字段数 | 示例 |
| --- | ---: | --- |
| Apple Watch 自动同步 | 11 | 睡眠时长、深睡/REM 比例、步数、运动分钟、活动能量、最新心率、静息心率、HRV、血氧、24 小时活动覆盖 |
| 用户一次性资料 | 5 | 年龄、BMI、基线步数、基线 HRV、基线静息心率 |
| 用户每日自报 | 4 | 情绪、饮食热量、专注分钟、睡眠自评 |
| 算法派生数据 | 6 | 节律分、置信度、数据质量、昼夜漂移压力、生理先导压力、硬撑型消耗压力 |

## 新增能力

- `circadianDriftPressure`：识别长期相位偏移、睡眠规律性下降和活动碎片化。
- `physiologyLeadPressure`：识别 HRV、静息心率、睡眠和血氧先于行为/主观下滑出现的预警。
- `presenteeismStrainPressure`：识别用户仍在高活动或高专注，但恢复、情绪或昼夜节律已经变弱的硬撑型消耗。
- `data:audit`：默认最低 5000 用户，检查字段采集率、合理范围、中位数、P1/P99、场景覆盖、cohort 覆盖、临床类别比例、性别比例、chronotype 比例和数据密度比例。
- `data:export`：默认导出同一批 5000 用户 JSONL 与 manifest 到 `artifacts/synthetic-population`，用于算法同学、App 后端和回归测试共享同一套固定样本；该目录是本地大文件产物，不提交 Git。
- `algorithm:benchmark`：正式 benchmark 默认 5000 用户。

## 5000 用户数据审计

命令：

```bash
npm run data:audit
npm run data:export
```

结果摘要：

| 指标 | 结果 |
| --- | ---: |
| 用户数 | 5000 |
| 日级记录 | 271169 |
| 场景覆盖 | 25 / 25 |
| cohort 覆盖 | 19 / 19 |
| hardIssues | 0 |
| warnings | 0 |
| 审计内 MAE | 5.688 |
| 审计内 RMSE | 7.363 |
| 审计内 bias | -0.209 |
| 相比 legacy MAE 提升 | 39.29% |

关键分布：

- 临床类别：healthy 1430、sleep_disrupted 960、metabolic_risk 742、travel_disrupted 367、low_adherence 297、high_stress 292、athletic 287、older_low_hrv 244、shift_work 221、cardio_rehab 160。
- 性别：female 2535、male 2407、other 58。
- chronotype：intermediate 2235、early 1649、irregular 635、late 481。
- 数据密度：mixed 4528、dense 294、sparse 178。

## 5000 用户正式 Benchmark

命令：

```bash
npm run algorithm:benchmark
```

整体结果：

| 指标 | V4.8 | legacy |
| --- | ---: | ---: |
| MAE | 5.760 | 9.257 |
| RMSE | 7.466 | 11.883 |
| Bias | -0.449 | 3.579 |
| Spearman | 0.8594 | 0.7903 |
| Low-state AUROC | 0.9604 | 0.9156 |
| MAE 提升 | 37.78% | - |
| RMSE 提升 | 37.17% | - |

重点场景：

| 场景 | V4.8 MAE | legacy MAE | 结论 |
| --- | ---: | ---: | --- |
| random_missing | 4.608 | 10.600 | 强 |
| high_adherence | 3.855 | 8.245 | 强 |
| physiology_warning | 5.489 | 6.062 | 已修复到领先 |
| burnout_presenteeism | 9.347 | 20.524 | 明显领先但仍高估 |
| masked_gradual_decline | 11.504 | 16.027 | 明显领先但仍是短板 |
| sparse_abrupt_drop | 3.184 | 5.909 | 强 |
| abrupt_shift | 3.815 | 3.555 | MAE 略输，RMSE 领先 |
| overtraining | 6.683 | 6.954 | MAE 略赢，RMSE 略输 |

## 当前判断

V4.8 已经具备 App 后端核心算法 baseline 的工程可用性：数据量提升到 5000 用户后，整体指标稳定，且分布审计没有发现明显不合理项。下一轮最值得继续攻克的是 `masked_gradual_decline`、`burnout_presenteeism`、`abrupt_shift` 和 `overtraining`，这些场景需要更多真实 Apple Watch 连续数据与用户反馈来校准。
