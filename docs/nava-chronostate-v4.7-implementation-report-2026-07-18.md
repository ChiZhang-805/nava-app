# NAVA ChronoState V4.7 实现报告（2026-07-18）

## 结论

App 后端节律算法已从 V4.6 升级到 NAVA ChronoState V4.7。V4.7 不是简单调权重，而是在 V4.6 的四因子 Student-t 状态空间模型上加入三类自适应门控：

- `phaseTurbulencePressure`：识别 jet lag、倒班、周末相位漂移这类短期相位扰动，避免误判为慢性生理恶化。
- `endpointCalibrationPressure`：当中低端点、drawdown / transition 和多域低证据一致时，自适应压低尾端分数，减少慢性下滑被中位数抬高。
- `tailOverreactionRelief`：当单日极端低值与中位数、趋势和冲突证据不一致时，降低孤立噪声把分数打穿的风险。
- `unresolvedDrawdownPressure` 扩展：加入 conflict-masked recovery debt，识别“行为/主观信号好转，但恢复因子仍弱”的假恢复。

## 版本

- `rhythmModelVersion`：`nava-chronostate-v4.7-2026-07`
- `rhythmSchemaVersion`：`4.7.0`
- 核心文件：`supabase/functions/_shared/rhythm-core.ts`
- 前端展示：Today / Trends / Demo 已识别 V4.7。

## 最新基准

固定种子、1000 合成用户、22 类压力场景：

| 指标 | V4.7 | 旧单日 proxy |
| --- | ---: | ---: |
| MAE | 5.670 | 9.334 |
| RMSE | 7.561 | 11.921 |
| Bias | 0.652 | 3.857 |
| Spearman | 0.8203 | 0.7705 |
| Low-state AUROC | 0.9699 | 0.9335 |
| MAE 改善 | 39.25% | - |
| RMSE 改善 | 36.57% | - |
| 80% 区间覆盖 | 0.943 | - |
| 平均区间宽度 | 30.713 | - |
| 单用户耗时 | 27.8 ms | - |

旧 20 场景对照：

- V4.7 MAE：`5.382`
- 旧 proxy MAE：`8.665`
- MAE 改善：`37.89%`
- RMSE：`6.867`
- RMSE 改善：`38.33%`
- Low-state AUROC：`0.9891`

## 场景变化

- `gradual_decline`：V4.7 MAE `5.461`，比 V4.6 的 `6.136` 改善，但仍高于旧 proxy `4.184`。
- `masked_gradual_decline`：V4.7 MAE `16.329`，优于 V4.6 `16.829` 和旧 proxy `20.455`。
- `jet_lag`：V4.7 MAE `7.474`，优于旧 proxy `8.959`；仍需要真实旅行/倒班数据校准。
- `sparse_abrupt_drop`：V4.7 MAE `2.836`，明显优于旧 proxy `6.403`。
- `conflicting_signals`：V4.7 MAE `5.270`，优于旧 proxy `6.097`。

## 技术壁垒

当前壁垒不是某个单独公式，而是这套闭环：

1. Apple Health / Apple Watch 多日数据清洗和 42 天个人基线。
2. 睡眠、活动、昼夜节律、恢复、情绪、饮食、专注七类信号的可靠度建模。
3. 四因子动态状态空间：`circadian`、`recovery`、`behavior`、`affect`。
4. Student-t 鲁棒滤波，抗异常值和传感器偏置。
5. 风险敏感下尾效用和急性多域一致证据。
6. drawdown / transition / chronic debt / unresolved recovery 多层时间记忆。
7. V4.7 新增的相位扰动保护、端点校准、尾部缓释和冲突型假恢复债务。
8. 可解释输出、80% 不确定性区间、合成压力测试和未来真实反馈闭环。

## 仍需真实数据校准

V4.7 目前是工程合成压力测试，不是医学验证。下一步需要 10-20 名真实 Apple Watch 用户连续 14 天以上数据，重点校准 HRV、静息心率、短睡、RA/IV/IS、jet lag / 倒班和用户主观反馈。
