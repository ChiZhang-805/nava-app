# NAVA ChronoState V4.27 固定数据集报告

日期：2026-07-18

## 结论

V4.27 是当前 APP 后端主线算法版本。它不是简单加权，而是“个体鲁棒基线 + 四因子 Student-t 状态空间 + Bayesian online change-point detection + 风险效用融合 + 相位错位补偿 + 隐藏压力闸门”的组合。

当前应保留 V4.27 作为稳定主线：它在同一份 5000 用户固定数据集上，整体 MAE / RMSE / 低状态 AUROC 都优于 V4.9 和 V4.13，并明显改善 `circadian_drift`。但 `burnout_presenteeism`、`masked_gradual_decline`、`overtraining` 仍是后续 V4.28 的重点，不应靠简单加罚继续硬调。

## 固定数据集

固定数据集不提交 Git，保存在 Z 盘，用于同一数据集上的算法迭代对比。

| 项目 | 值 |
| --- | --- |
| JSONL | `Z:\NAVA\data\synthetic-population\nava-synthetic-users-5000-seed-240724.jsonl` |
| manifest | `Z:\NAVA\data\synthetic-population\nava-synthetic-users-5000-seed-240724.manifest.json` |
| benchmark 目录 | `Z:\NAVA\data\synthetic-population\benchmarks` |
| 用户数 | 5000 |
| 日级记录 | 271169 |
| 文件大小 | 845936872 bytes |
| SHA-256 | `0ebd32babbdc939b84ffc34d9d384e08551461fe36c6a0cc3d254a9cf5c92837` |
| 场景覆盖 | 25 / 25 |
| cohort 覆盖 | 19 / 19 |

这份 SHA 是后续所有算法比较的锚点。只要 SHA 不同，就不能直接把指标当作同一轮算法升级收益。

## 数据分布审计

命令：

```bash
npm run data:audit
```

结果摘要：

| 项目 | 结果 |
| --- | ---: |
| Apple Watch 自动同步字段 | 11 |
| 用户一次性资料字段 | 5 |
| 用户每日自报字段 | 4 |
| 算法派生字段 | 10 |
| hardIssues | 0 |
| warnings | 0 |

人群分布摘要：

| 类别 | 分布 |
| --- | --- |
| 数据密度 | mixed 4528, dense 294, sparse 178 |
| 临床/状态类 | healthy 1430, sleep_disrupted 960, metabolic_risk 742, travel_disrupted 367, low_adherence 297, high_stress 292, athletic 287, older_low_hrv 244, shift_work 221, cardio_rehab 160 |
| 性别 | female 2535, male 2407, other 58 |
| chronotype | intermediate 2235, early 1649, irregular 635, late 481 |

关键字段分布符合当前测试目标：睡眠、活动、HRV、静息心率、血氧、主观心情、饮食、专注和派生算法压力项均有覆盖；缺失率不是均匀随机，而是按用户 adherence、sensor quality、manual logging 和场景压力变化。

## 复现命令

重新导出固定数据集：

```bash
npm run data:export:fixed
```

在固定数据集上跑当前算法：

```bash
npm run algorithm:benchmark:fixed
```

比较两个固定 benchmark：

```bash
node --experimental-strip-types scripts\compare-fixed-benchmarks.ts --left=Z:\NAVA\data\synthetic-population\benchmarks\nava-chronostate-v4.9-2026-07.json --right=Z:\NAVA\data\synthetic-population\benchmarks\nava-chronostate-v4.27-2026-07.json
```

```bash
node --experimental-strip-types scripts\compare-fixed-benchmarks.ts --left=Z:\NAVA\data\synthetic-population\benchmarks\nava-chronostate-v4.13-2026-07.json --right=Z:\NAVA\data\synthetic-population\benchmarks\nava-chronostate-v4.27-2026-07.json
```

## V4.27 整体指标

| 模型 | MAE | RMSE | Bias | Spearman | Low-state AUROC | 80% 区间覆盖 | 相比 legacy MAE 提升 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| V4.9 | 5.685 | 7.363 | -0.710 | 0.8512 | 0.9715 | 0.9710 | 39.32% |
| V4.13 | 5.683 | 7.367 | -0.655 | 0.8511 | 0.9715 | 0.9708 | 39.34% |
| V4.27 | 5.672 | 7.319 | -0.421 | 0.8483 | 0.9736 | 0.9718 | 39.46% |

V4.27 相比 V4.9：

| 指标 | 变化 |
| --- | ---: |
| MAE | -0.013 |
| RMSE | -0.044 |
| 绝对 Bias | -0.289 |
| Low-state AUROC | +0.0021 |
| Spearman | -0.0029 |

V4.27 相比 V4.13：

| 指标 | 变化 |
| --- | ---: |
| MAE | -0.011 |
| RMSE | -0.048 |
| 绝对 Bias | -0.234 |
| Low-state AUROC | +0.0021 |
| Spearman | -0.0028 |

## 重点场景

| 场景 | V4.9 MAE | V4.13 MAE | V4.27 MAE | V4.27 判断 |
| --- | ---: | ---: | ---: | --- |
| `circadian_drift` | 7.103 | 7.259 | 6.796 | 明显提升，是 V4.27 最大收益 |
| `weekend_rebound` | 6.190 | 6.046 | 6.027 | 小幅提升 |
| `shift_worker` | 6.305 | 6.318 | 6.372 | MAE 小幅回退，但 AUROC 和 Spearman 提升 |
| `burnout_presenteeism` | 8.205 | 8.434 | 8.492 | 仍是短板，V4.27 不如 V4.9 |
| `masked_gradual_decline` | 9.791 | 9.682 | 9.751 | 高估仍明显，但优于 legacy |
| `overtraining` | 7.075 | 7.068 | 7.102 | 基本持平，仍需训练负荷专门模型 |
| `jet_lag` | 7.309 | 7.262 | 7.318 | 基本持平，存在偏低 |
| `illness_recovery` | 7.674 | 7.710 | 7.710 | 基本持平，存在偏低 |
| `seasonal_shift` | 6.350 | 6.335 | 6.428 | MAE 回退，但排序能力更好 |

## V4.27 新增/强化逻辑

| 模块 | 作用 |
| --- | --- |
| `phaseMisalignmentCompensation` | 把真实昼夜相位错位和慢性透支区分开，避免倒班、旅行、周末相位变化被过度判为恢复崩塌 |
| `phaseAdaptationRelief` | 当相位错位证据强、恢复和情绪未全面崩塌时，降低相位类压力的杀伤 |
| `recoveryReboundRelief` | 识别短期恢复反弹，避免单日低谷后继续过度压低 |
| `functionalOverreachRelief` | 对高活动、高专注但恢复有短期压力的情况做保护，但不再作为直接加分项 |
| `presenteeismStrainPressure` | 识别“还在硬撑”的用户：活动/专注仍高，但恢复、情绪或生理已经下滑 |
| `maskedStrainPressure` | 识别“表面分数还行，但历史 drawdown 和生理恢复没有跟上”的隐藏下滑 |
| `recurrentShiftPatternPenalty` | 减少倒班/相位错位场景中 relief 过强导致的高估 |
| `physiologicalPresenteeismCap` | 当生理压力和硬撑压力同时存在时，对最终分数设置上限 |

## 被测试但未采用的候选

本轮继续测试了 burnout 专门 cap，但未写入主算法。

| 候选 | 结果 |
| --- | --- |
| 直接加强 presenteeism/masked 惩罚 | 能降低 bias，但 MAE 变差，因为会继续压低本来已经低估的样本 |
| drawdown 低 masked 压力补罚 | 能改善 `masked_gradual_decline`，但明显伤害 `illness_recovery` 和 `jet_lag` |
| hidden strain 上限闸门 | `burnout_presenteeism` MAE 可降到约 7.1，但误伤 `overtraining` 和 `compensated_strain` |
| 加情绪崩塌约束的上限闸门 | 误伤变小，但几乎不能改善 burnout |

当前判断：不要为了单一场景把整体模型变脆。V4.28 应该在更多真实标注或更强 synthetic truth 约束下，做单独的 burnout/overtraining 校准层。

## 后续 V4.28 方向

1. 增加“训练负荷/恢复容量”子模型：用 7/14/28 天 activity load、HRV/RHR 恢复、睡眠债来区分 overtraining、compensated strain 和健康高活动。
2. 增加 burnout 专门的历史形态特征：持续高活动/高专注、低情绪、低 HRV、高 RHR、睡眠阶段下降必须同时跨多天成立，避免只看当天。
3. 给 synthetic truth 增加更细的 burnout 子标签：区分“真实隐藏透支”“算法应低分”“低恢复但仍可承受的短期压力”。
4. 引入按场景和 cohort 的回归门槛：新版本必须整体 MAE 不退，且关键短板场景不能用别的场景损失换取虚假提升。
5. 后续真实用户数据进入后，用匿名化反馈做校准：用户自评恢复、疲劳、训练负荷、病程恢复和 Apple Watch 连续趋势都应进入 V4.28 验证集。

## 当前工程状态

主算法文件：

```text
supabase/functions/_shared/rhythm-core.ts
```

固定数据集 benchmark 脚本：

```text
scripts/benchmark-fixed-dataset.ts
scripts/compare-fixed-benchmarks.ts
```

APP 展示层已同步到 V4.27：

```text
src/features/TodayScreen.tsx
src/features/TrendsScreen.tsx
src/services/demo.ts
```

V4.27 可以作为 APP 后端当前算法壁垒继续集成。下一步不是推翻重写，而是在固定数据集和真实用户反馈上继续收敛 V4.28。
