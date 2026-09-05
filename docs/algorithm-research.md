# NAVA 算法调研与自研路线

本调研面向 Apple Watch / Apple 健康用户。结论是：不采用简单加权平均，也不直接上不可解释黑盒模型。当前后端源码模型版本是 `nava-chronostate-v4.27-2026-07`：42 天鲁棒个人基线、小时活动节律、恢复指标、异常检测、四因子动态状态空间模型、Student-t 鲁棒滤波、信号连续性质量建模、自适应残差区间、风险敏感下尾效用、急性多域一致证据、慢性负债记忆、功能补偿门控、稀疏断崖响应、慢性停滞锚点、绝对生理压力门控、假恢复 drawdown 压力、相位扰动保护、昼夜漂移压力、生理先导预警、硬撑型消耗压力、自适应端点校准、尾部过反应缓释、冲突型假恢复债务、Bayesian online change-point detection、5000 用户固定合成集审计和分数不确定性区间。当前基准见 [`chrono-v4.27-fixed-dataset-benchmark.md`](./chrono-v4.27-fixed-dataset-benchmark.md)。

## 已调研的算法/方法

| # | 算法/方法 | 能解决的问题 | 是否建议用于 NAVA |
| --- | --- | --- | --- |
| 1 | HealthKit 睡眠阶段聚合 | 直接使用 Apple Watch 的 Awake / REM / Core / Deep 等阶段 | 立即使用，作为睡眠主数据源 |
| 2 | Cole-Kripke actigraphy sleep/wake | 用腕部活动判断睡/醒 | 作为无 Apple 睡眠阶段时的 fallback |
| 3 | Sadeh sleep scoring | 儿童/青少年 actigraphy 睡眠识别 | 只作为参考，不作为成人主算法 |
| 4 | Cosinor analysis | 提取 24h 节律的 MESOR、振幅、相位 | v2 使用，解释用户节律相位 |
| 5 | Non-parametric circadian analysis | IS、IV、RA、M10、L5 | v2 使用，衡量规律性和碎片化 |
| 6 | 14/28 天滑动窗口 | 平滑日波动，建立个人基线 | v1 就使用 |
| 7 | EWMA 指数加权移动平均 | 最近数据权重更高 | v1 就使用 |
| 8 | HRV RMSSD / SDNN | 恢复、压力、自主神经状态 | v2 使用，等 HealthKit HRV 权限接入 |
| 9 | 静息心率偏离个人基线 | 疲劳、压力、恢复异常提示 | v2 使用 |
| 10 | MET 能量消耗模型 | 把运动类型转换成能量强度 | v1/v2 使用 |
| 11 | Mifflin-St Jeor REE | 估算基础能量需求 | v2 饮食/能量模块使用 |
| 12 | Kalman Filter / sensor fusion | 融合心率、步数、运动、睡眠噪声 | V4 已升级为 Student-t 鲁棒状态滤波 |
| 13 | Bayesian Network | 处理缺失数据和解释风险/状态关系 | v2 使用在置信度和缺失补全 |
| 14 | Isolation Forest | 发现异常睡眠、异常心率、异常活动 | v2 使用，做异常提醒 |
| 15 | Dynamic Time Warping | 比较今日作息曲线与个人典型日是否相似 | v2 使用，做规律性分数 |
| 16 | K-means / GMM 用户分型 | 识别夜猫型、运动型、高压型等群体 | V5 数据量足够后上 |
| 17 | Random Forest / GBDT | 表格特征的稳健预测 | V5 可作为辅助模型 |
| 18 | Temporal CNN / LSTM | 多日时间序列预测明日状态 | V5 数据量足够后上 |
| 19 | Contextual Bandit | 个性化推荐“什么时候提醒、提醒什么” | V5 必须有反馈闭环后再上 |
| 20 | CNN / EfficientNet 食物分类 | 从照片识别食物类别 | 饮食算法核心之一 |
| 21 | Mask R-CNN / YOLO 实例分割 | 多食物分离、识别盘中多个物体 | 饮食算法核心之一 |
| 22 | U-Net 食物区域分割 | 分出食物区域，辅助份量估计 | 饮食算法核心之一 |
| 23 | CLIP / VLM 开放词表识别 | 识别长尾菜品，适合中餐复杂场景 | 建议接入，但必须用户确认 |
| 24 | MediaPipe Face Landmarker | 移动端实时人脸关键点 | 面部状态算法基础 |
| 25 | Facial Action Coding / 表情特征 | 疲劳、压力、情绪表情线索 | 只能做状态提示，不能做医疗判断 |
| 26 | 多模态融合评分 | 睡眠、活动、饮食、情绪、面部状态融合 | NAVA 自研算法主线 |
| 27 | Dempster-Shafer evidence fusion | 多来源证据可信度不同且可能互相冲突 | v3 已用于 belief / disbelief / uncertainty 证据质量合成 |
| 28 | Geometric mean / bottleneck fusion | 防止一个高分信号掩盖关键短板 | v3 已用作短板约束 |
| 29 | EWMA / CUSUM change detection | 识别相对个人基线的连续偏移 | 已吸收为 V4 趋势压力和变点检测 |
| 30 | Robust z-score / MAD | 对异常值更稳健的个人基线检测 | V4 已用于个人基线 |
| 31 | Entropy / sample entropy | 衡量日内活动和心率序列复杂度 | 后续可用于碎片化与恢复质量增强 |
| 32 | SHAP / feature attribution | 解释机器学习模型为什么给出某个建议 | 后续若接入 GBDT/深度模型后必须配套 |
| 33 | Student-t robust Kalman filter | 多传感器观测有异常值时保持状态估计稳定 | V4 已用于核心状态滤波 |
| 34 | Bayesian online change-point detection | 判断用户状态是否发生结构性变化 | V4 已用于 `change_point_probability` |
| 35 | Risk-sensitive / entropic utility | 多域状态中存在关键短板时避免被平均数掩盖 | V4 已用于总分融合 |
| 36 | Sleep Regularity Index | 衡量相邻多日同一时间点睡/醒一致性 | V4 已吸收为睡眠规律性特征 |
| 37 | Adaptive / conformal-style residual calibration | 让预测区间根据近期残差校准，而不是固定放宽 | V4.4 已吸收为自适应区间 |
| 38 | Population archetype simulation | 用手工画像构造真实用户差异和非均匀数据密度 | V4.4 已用于合成数据生成器 |
| 39 | Missingness-aware reliability | 将“数据是否连续稳定”纳入信号可信度 | V4.4 已用于 `signalHealth` |
| 40 | CUSUM / Page-Hinkley style online drift memory | 用累计偏移识别慢性下滑，避免只看当天信号 | V4.4 已吸收为 `drawdownPressure` |
| 41 | EWMA drawdown control | 用指数衰减记住最近低谷，同时避免被单日噪声带偏 | V4.4 已用于慢性低谷区间校准 |
| 42 | Regime-transition uncertainty inflation | 突发转折时先扩大不确定性，而不是过度追低点预测 | V4.4 已用于 `transitionPressure` |
| 43 | Personalized wearable state modeling | 同样的 HRV/活动水平对不同用户含义不同，需要长期个人状态记忆 | V4.4 已用于 `chronicDebtPressure` |
| 44 | Robust multimodal conflict fusion | 多模态信号冲突时不能简单追随最低分或最高分 | V4.4 已用于 `functionalCompensation` 和活动型补偿门 |
| 45 | Sparse evidence shock gating | 稀疏穿戴数据下，少量一致低信号也可能代表真实断崖下滑 | V4.5 已用于 `sparseTransitionShock` |
| 46 | Drawdown memory anchoring | 长期低谷后的当天中等信号不足以证明恢复，需要近期状态锚点 | V4.5 已用于 `drawdownStallPressure` |
| 47 | Absolute physiology strain guard | 长期个人基线被恶化数据拖低后，HRV/RHR/睡眠的绝对风险仍应参与约束 | V4.6 已用于 `physiologyStrainPressure` |
| 48 | Unresolved drawdown recovery test | 近期低谷后，只有活动或短期表面反弹不足以证明恢复，需要 HRV/RHR/睡眠确认 | V4.6 已用于 `unresolvedDrawdownPressure` |
| 49 | Phase turbulence protection | jet lag、倒班和周末相位扰动会让睡眠相位/活动峰值短期漂移，但不等于慢性生理恶化 | V4.7 已用于 `phaseTurbulencePressure` |
| 50 | Adaptive endpoint calibration | 慢性下滑尾端如果被中位数或短期反弹抬高，需要按 drawdown / transition 证据自适应压低端点 | V4.7 已用于 `endpointCalibrationPressure` |
| 51 | Tail overreaction relief | 单日极端低值可能是噪声、漏记或短期扰动，不能总是把分数打穿 | V4.7 已用于 `tailOverreactionRelief` |
| 52 | Conflict-masked recovery debt | 行为/主观信号变好但恢复因子仍弱时，需要识别“表面恢复、底层未恢复”的混合冲突 | V4.7 已并入 `unresolvedDrawdownPressure` |
| 53 | Circadian drift pressure | 连续相位偏移、睡眠规律性下降和日内活动碎片化应区别于短期 jet lag | V4.8 已用于 `circadianDriftPressure` |
| 54 | Physiology lead pressure | HRV/RHR/睡眠/血氧可能早于用户主观感受或行为下滑，适合作为 Apple Watch 先导预警 | V4.8 已用于 `physiologyLeadPressure` |
| 55 | Presenteeism strain pressure | 用户仍在高活动/高专注但恢复、情绪或节律已经下降时，需要识别“硬撑型消耗” | V4.8 已用于 `presenteeismStrainPressure` |
| 56 | Distribution-gated synthetic audit | 合成数据必须检查用户量、人群比例、字段采集率和现实分布，而不只是随机生成样本 | V4.8 已用于 5000 用户 `data:audit` |

## NAVA 自研算法设计

### v1：可解释节律分（已淘汰为历史 baseline）

目标：先稳定上线，输出用户能理解的分数、原因、建议。

输入：

- 睡眠：总时长、入睡时间、深睡/REM、醒来时间。
- 活动：步数、运动分钟、主动能量、心率、血氧。
- 情绪：主观心情分、影响因素、日记。
- 饮食：识别食物、热量、餐次。
- 专注：完成时长、次数。

算法：

1. 对每类信号计算 0-100 子分。
2. 根据是否有数据动态归一化权重。
3. 输出 `score`、`confidence`、`signals`、`reasons`、`actions`。
4. 写入 `daily_rhythm_scores`。

`rhythm-score` Edge Function 曾实现 v1 baseline，现在使用 NAVA ChronoState V4.27。

### v2：个人基线 + 经典节律特征（已升级）

目标：让算法从“通用建议”变成“理解这个用户平常什么样”。当前后端实现文件：

```text
supabase/functions/_shared/rhythm.ts
supabase/functions/rhythm-score/index.ts
```

已实现：

- 14/28 天个人基线。
- 动态权重多模态融合：睡眠、活动、情绪、饮食、专注、恢复。
- 睡眠相位偏移：用睡眠 midpoint 对比个人基线。
- 规律性分数：吸收 non-parametric circadian analysis 的 IS 思路，使用睡眠相位稳定性和活动变异代理指标。
- 碎片化风险：吸收 IV/fragmentation 思路，结合深睡/REM 比例、活动缺口和相位偏移。
- 恢复分：结合睡眠、HRV SDNN、静息心率/最新心率。
- 异常检测：用个人基线 z-score/阈值代理实现轻量 Isolation Forest 思路，输出 anomaly flags。
- 缺失数据置信度：用信号覆盖率、历史天数、信号深度计算 confidence。
- 个性化建议：从异常旗标、相位偏移、恢复分和缺失信号生成 actions。

输出变化：

- `score` 仍保留。
- 增加 `phaseShiftMinutes`、`regularityScore`、`fragmentationScore`、`recoveryScore`、`anomalyFlags`、`profileLabels`、`features`、`baseline`。
- 建议从“补记录/轻步行”升级为“你比自己平常晚睡 74 分钟，建议今晚提前 30 分钟进入睡眠准备”。

数据库保存位置：

```text
daily_rhythm_scores
health_metric_snapshots
```

v2 已经被 v3 替代。v3 接入了小时活动 bins，开始计算真实的 M10、L5、RA、IV 和跨日 IS。

### v3：NAVA Fusion（已接入后端）

目标：不再做简单加权平均，而是把每类信号当作“证据源”，根据可靠度、冲突程度和异常风险做非线性融合。

当前实现文件：

```text
supabase/functions/_shared/rhythm.ts
supabase/functions/rhythm-score/index.ts
supabase/functions/health-sync-ingest/index.ts
native/ios/NavaHealthPlugin.swift
```

已实现：

- 小时活动曲线：iOS HealthKit 返回 24 个 `activityBins`。
- 睡眠阶段：返回 `sleepStageMinutes`。
- 非参数节律特征：
  - `M10`：最活跃 10 小时均值。
  - `L5`：最安静 5 小时均值。
  - `RA`：相对振幅 `(M10-L5)/(M10+L5)`。
  - `IV`：日内碎片化。
  - `IS`：跨日稳定性。
- 恢复指标：
  - 睡眠时长/阶段。
  - HRV SDNN。
  - 静息心率/最新心率。
- 异常检测：
  - 短睡。
  - 睡眠相位偏移。
  - 低活动。
  - 高心率。
  - 低 HRV。
  - 低血氧。
  - 日夜活动幅度弱。
  - 日内碎片化高。
- 非线性融合：
  - 每个信号转为健康状态概率。
  - 用可靠度修正 log-odds evidence。
  - 用 Dempster-Shafer mass 合成 belief / disbelief / uncertainty。
  - 用几何瓶颈防止单一强项掩盖短板。
  - 用 anomaly risk gate 做风险门控。
  - 用 conflict penalty 处理信号冲突。

v3 的关键点：

1. 子分仍然保持可解释，但总分不再等于 `sleep*权重 + activity*权重 + ...`。
2. 每个信号先转成 `0.03-0.97` 的状态概率，避免极端值直接把分数打满或打穿。
3. `reliability` 由数据深度决定，例如睡眠是否有时长/相位/深睡/REM，活动是否有步数/运动分钟/能量，恢复是否有 HRV/静息心率。
4. `posterior` 使用可靠度修正的 log-odds evidence，吸收 Bayesian fusion 思路。
5. `belief / disbelief / uncertainty` 使用二元 Dempster-Shafer 质量合成，保留“证据支持稳定”“证据支持压力/失衡”“证据不足”三种状态。
6. `geometric` 和 `bottleneck` 会惩罚短板，例如睡眠极差时，运动高分不能把总分拉得过高。
7. `riskGate` 由异常旗标、规律性分、碎片化风险共同控制，低血氧、高心率、严重短睡这类风险会直接压低总分上限。
8. `conflict` 同时吸收信号离散度和 Dempster-Shafer 冲突，避免“有些信号极好、有些信号极差”时给出过度确定的结论。
9. 输出 `fusion` 给算法端审计，App 前端默认只展示用户能理解的总分、原因和建议。

输出字段：

- `score`
- `confidence`
- `fusion`
- `signals`
- `features`
- `baseline`
- `anomalyFlags`
- `profileLabels`
- `regularityScore`
- `fragmentationScore`
- `recoveryScore`
- `phaseShiftMinutes`

### v4.7：NAVA ChronoState（历史版本）

目标：把 v3 的“证据融合分数”升级成真正的个体动态状态估计，能处理缺失、噪声、传感器偏置、连续下滑、突发转折、冲突信号、相位扰动和长期低谷后的假恢复。本轮 V4.7 在 V4.6 基础上加入 phase turbulence protection、adaptive endpoint calibration、tail overreaction relief 和 conflict-masked recovery debt：既能更快压住慢性下滑尾端，也能避免把 jet lag / 倒班 / 周末相位扰动误判成慢性恶化。

相关实现文件：

```text
supabase/functions/_shared/rhythm-core.ts
supabase/functions/_shared/rhythm.ts
supabase/functions/rhythm-score/index.ts
supabase/functions/health-sync-ingest/index.ts
algorithm/synthetic.ts
scripts/benchmark-rhythm-v4.ts
tests/rhythm-core.test.ts
```

核心机制：

1. 四个潜在状态：`circadian`、`recovery`、`behavior`、`affect`。
2. 七类观测信号：睡眠、活动、昼夜节律、情绪、饮食、专注、恢复。
3. 42 天指数衰减个人基线，用 weighted median / MAD 替代简单均值。
4. 睡眠特征吸收睡眠时长、睡眠阶段、相位、SRI 和自评。
5. 活动节律特征吸收 RA、IV、IS、M10、L5、24h+12h harmonic cosinor。
6. 恢复特征吸收 HRV SDNN、静息心率、睡眠恢复债。
7. 状态估计使用 Student-t 鲁棒 sequential filter，异常观测会被自动降权。
8. 总分融合使用慢状态、风险敏感下尾效用、急性多域一致证据和趋势压力，不是简单加权。
9. 变点检测使用 Bayesian online change-point detection，输出结构性变化概率。
10. 输出 80% 分数区间、数据质量、异常旗标、profile labels 和可解释建议。
11. 对每类信号计算最近 28 天 `signalHealth`：availability、recency、longest gap、current observed、quality。
12. 将 `signalHealth` 写回 signal evidence，并参与 `reliability` 和 `dataQuality`。
13. 用近期残差做自适应区间校准，使 80% 区间覆盖从过度保守向目标覆盖靠近。
14. 增加 `mixedConflict`、`softDeclinePressure` 和 `loadRecoveryConflict`，用于审计冲突信号、慢性下滑以及高活动/低恢复的负荷矛盾处理。
15. 对极短睡眠、极低 HRV、过高静息心率加入绝对生理下限保护，避免个体基线被长期恶化数据拖低后把异常状态正常化。
16. 对最近 10-24 天分数计算 EWMA drawdown / median drop，输出 `drawdownPressure`。
17. 对突然断崖式下滑启用 `transitionPressure`，主要扩大区间并降低单日点预测过度追低的风险。
18. 增加 `chronicDebtPressure`，把“长期低谷后短期反弹”从“真的恢复”中拆出来，避免慢性欠恢复被当天高活动掩盖。
19. 增加 `functionalCompensation`，识别高活动/高专注但恢复偏低的功能补偿状态，避免把所有负荷-恢复矛盾都直接判为崩塌。
20. 增加 `sparseTransitionShock`，在少量低分穿戴信号同时伴随转折压力时提高急性响应，避免稀疏数据下断崖下滑反应过慢。
21. 增加 `drawdownStallPressure`，在长期 drawdown 且没有强活动反弹时，把最终 latent 锚回近期历史中位状态。
22. 增加 `physiologyStrainPressure`，把绝对短睡、低 HRV 和高静息心率作为独立压力源，避免个人基线被长期恶化数据拖低后把风险正常化。
23. 增加 `unresolvedDrawdownPressure`，只在“近期低谷 + 当天表面不低 + HRV/RHR/睡眠没有确认恢复”的形态下触发，避免把普通突发下滑重复扣分。
24. 增加 `phaseTurbulencePressure`，用睡眠相位偏移、活动 acrophase 偏移、IV 碎片化和睡眠规律性识别短期相位扰动；真正释放分数时会被长期 drawdown 自动削弱，避免误伤慢性恶化。
25. 增加 `endpointCalibrationPressure`，当低一致性、drawdown / transition 与中低端点同时出现时，自动压低融合端点，避免慢性下滑被中位数抬高。
26. 增加 `tailOverreactionRelief`，当极端尾部低值与中位数、趋势和冲突证据不一致时，降低单日噪声把分数打穿的风险。
27. 扩展 `unresolvedDrawdownPressure`，加入 conflict-masked recovery debt；在行为/主观信号回升但恢复因子仍弱、且近期存在低谷记忆时，识别“表面恢复、底层未恢复”。

复杂度：

- 时间：`O(D*S*F^2 + D*R + D*S*WlogW)`。
- 空间：`O(D*F^2 + R + S*W)`。
- 其中 `D=42` 天、`S=7` 信号、`F=4` 状态因子、`R=42` 最大 run length、`W=42` 基线窗口。

合成验证覆盖 22 类压力场景：

- clean
- random_missing
- burst_missing
- outliers
- sensor_bias
- gradual_decline
- abrupt_shift
- shift_worker
- cold_start
- conflicting_signals
- jet_lag
- illness_recovery
- overtraining
- weekend_rebound
- travel_gap
- low_adherence
- high_adherence
- seasonal_shift
- chronic_debt_rebound
- compensated_strain
- sparse_abrupt_drop
- masked_gradual_decline

合成用户现在不是场景均匀轮转，而是手工构造 16 类用户画像后条件采样：

- consistent_sleeper、sedentary_office、active_athlete、shift_clinician、student_night_owl、new_parent、frequent_traveler、high_stress_founder、older_low_hrv、recovery_focused、manual_logger、low_adherence_user、weekend_social、metabolic_watch、outdoor_worker、remote_worker。

当前固定种子 1000 用户旧 20 场景对照基准：

- V4.7 MAE：`5.382`
- 旧单日 proxy MAE：`8.665`
- MAE 改善：`37.89%`
- RMSE：`6.867`
- RMSE 改善：`38.33%`
- Bias：`0.419`
- Spearman：`0.7988`
- Low-state AUROC：`0.9891`
- 平均置信度：`0.723`
- 80% 区间覆盖：`0.965`
- 平均区间宽度：`30.219`
- 单用户耗时：约 `31.5 ms`

扩展到 22 类压力场景后的当前基准：

- V4.7 MAE：`5.670`
- 旧单日 proxy MAE：`9.334`
- MAE 改善：`39.25%`
- RMSE：`7.561`
- RMSE 改善：`36.57%`
- Bias：`0.652`
- Spearman：`0.8203`
- Low-state AUROC：`0.9699`
- 平均置信度：`0.721`
- 80% 区间覆盖：`0.943`
- 平均区间宽度：`30.713`
- 单用户耗时：约 `27.8 ms`
- 数据密度：mixed `924`、dense `52`、sparse `24`

注意：这是工程压力测试，不是临床验证。真实上线后必须用真实 Apple Watch 数据继续校准。

当前薄弱点：

- `gradual_decline`：扩展 22 场景下 V4.7 MAE `5.461`，相对 V4.6 的 `6.136` 已改善，但仍高于旧 proxy `4.184`；下一轮需要真实慢性恶化标签和更细的趋势/点值校准。
- `abrupt_shift`：扩展 22 场景下 V4.7 MAE `4.287`，RMSE `5.665` 仍优于旧 proxy RMSE `5.995`，但 MAE 略高于旧 proxy。
- `jet_lag`：V4.7 MAE `7.474`，比第一版 V4.7 回归有所修复，优于旧 proxy `8.959`；仍需要真实旅行/倒班数据校准 phase relief。
- `sparse_abrupt_drop`：新增压力场景，V4.7 MAE `2.836`，明显优于旧 proxy `6.403`，说明稀疏断崖门控有效。
- `masked_gradual_decline`：新增压力场景，V4.7 MAE `16.329`，优于 V4.6 `16.829` 和旧 proxy `20.455`；但它仍是下一轮最明确的算法短板。
- `conflicting_signals`：扩展 22 场景下 V4.7 MAE `5.270`，仍优于旧 proxy `6.097`。

### v4.8：NAVA ChronoState（历史演进节点）

目标：把 V4.7 从 1000 用户压力测试升级到 5000 用户分布审计，并针对 Apple Watch 自动数据补强三类派生压力：昼夜漂移、生理先导预警、硬撑型消耗。

新增：

1. `circadianDriftPressure`：识别连续相位偏移、睡眠规律性下降和日内活动碎片化。
2. `physiologyLeadPressure`：识别 HRV、静息心率、睡眠和血氧先于行为/主观下滑出现的预警。
3. `presenteeismStrainPressure`：识别用户仍在高活动或高专注，但恢复、情绪或昼夜节律已经变弱。
4. `algorithm/data-catalog.ts`：把字段分为 Apple Watch 自动同步、用户一次性资料、用户每日自报、算法派生数据四类。
5. `npm run data:audit`：默认最低 5000 用户，检查字段采集率、合理范围、P1/P99、场景覆盖、cohort 覆盖、临床类别比例、性别比例、chronotype 比例和数据密度比例。

5000 用户正式 benchmark：

- V4.8 MAE：`5.760`
- 旧单日 proxy MAE：`9.257`
- MAE 改善：`37.78%`
- RMSE：`7.466`
- RMSE 改善：`37.17%`
- Bias：`-0.449`
- Spearman：`0.8594`
- Low-state AUROC：`0.9604`
- 平均置信度：`0.714`
- 80% 区间覆盖：`0.9686`
- 平均区间宽度：`32.188`

5000 用户数据审计：

- 用户数：`5000`
- 日级记录：`271169`
- 场景覆盖：`25 / 25`
- cohort 覆盖：`19 / 19`
- hardIssues：`0`
- warnings：`0`

当前薄弱点：

- `masked_gradual_decline`：V4.8 MAE `11.504`，明显优于旧 proxy `16.027`，但仍有高估。
- `burnout_presenteeism`：V4.8 MAE `9.347`，明显优于旧 proxy `20.524`，但仍需要真实反馈校准“硬撑”标签。
- `abrupt_shift`：V4.8 MAE `3.815`，略高于旧 proxy `3.555`，但 RMSE `4.598` 优于旧 proxy `5.058`。
- `overtraining`：V4.8 MAE `6.683`，略优于旧 proxy `6.954`，但 RMSE 略差。

### v4.27：当前稳定主线

V4.27 在同一份 5000 用户固定数据集上继续收敛了 V4.8 之后的门控和校准。当前
源码常量、服务输出和前端演示模型标识统一为 `nava-chronostate-v4.27-2026-07`。
它在该固定集上的整体 MAE、RMSE 和低状态 AUROC 均优于对照的 V4.9 与 V4.13，
并改善 `circadian_drift`；`burnout_presenteeism`、`masked_gradual_decline` 和
`overtraining` 仍需真实 Apple Watch 连续数据与用户反馈校准。精确指标、复现命令
和未采用候选见当前固定数据集报告。

### v5：个性化推荐模型

目标：不只是评分，而是学会“哪类建议对这个用户有效”。

新增：

- Contextual Bandit 做提醒策略。
- 用户分型：夜猫型、高压型、运动不足型、恢复不足型。
- GBDT / Temporal CNN / LSTM 辅助预测次日状态。
- 饮食图像使用 VLM + 分割 + 用户确认结果回流。
- 面部状态只做低风险状态提示，不做诊断。

## 我们不建议直接照搬别人算法

原因：

- Apple Watch 已经提供很多处理后的 HealthKit 数据，重复造睡眠分期意义不大。
- 饮食和面部识别高度依赖中文食物、本地饮食习惯、拍照角度、用户确认，直接照搬公开模型误差会很大。
- 健康建议需要解释性和安全边界，不能直接用黑盒模型给强结论。

更合适的做法：

1. 使用 Apple HealthKit 作为可信数据底座。
2. 使用经典节律算法做可解释特征。
3. 用个人基线替代固定阈值。
4. 对饮食/面部使用模型识别，但强制用户确认。
5. 等数据积累后再训练 NAVA 自己的个性化推荐模型。

## 资料来源

- Apple HealthKit: https://developer.apple.com/documentation/healthkit/about-the-healthkit-framework
- Apple sleep analysis: https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis
- Apple Watch sleep stages validation: https://www.apple.com/health/pdf/Estimating_Sleep_Stages_from_Apple_Watch_Oct_2025.pdf
- Actigraphy sleep medicine review: https://pmc.ncbi.nlm.nih.gov/articles/PMC10039037/
- Cole-Kripke sleep/wake algorithm: https://pubmed.ncbi.nlm.nih.gov/1455130/
- Circadian rest-activity analysis: https://pmc.ncbi.nlm.nih.gov/articles/PMC12829919/
- Non-parametric circadian analysis: https://link.springer.com/article/10.1007/s40675-023-00267-4
- Rest-activity rhythm IV/IS measurement review: https://pmc.ncbi.nlm.nih.gov/articles/PMC6884363/
- Wearable circadian rhythm analysis: https://www.jmir.org/2021/10/e18403/
- HRV wearable review: https://pmc.ncbi.nlm.nih.gov/articles/PMC10742885/
- Wearable sleep / HR / HRV validation: https://pubmed.ncbi.nlm.nih.gov/36016077/
- Multisensor fusion review: https://arxiv.org/html/2412.05895v1
- Wearable health multi-sensor fusion review: https://www.sciencedirect.com/science/article/pii/S1566253526001983
- Personalized wearable data review: https://pmc.ncbi.nlm.nih.gov/articles/PMC10890129/
- Wearable sensors for personalized health review: https://pmc.ncbi.nlm.nih.gov/articles/PMC12831105/
- Subject-specific HMM for wearable data: https://pmc.ncbi.nlm.nih.gov/articles/PMC12883082/
- Wearable insight time series modeling: https://arxiv.org/html/2406.06464v4
- Robust multimodal fusion under uncertainty: https://arxiv.org/abs/2303.04636
- Bayesian and Dempster-Shafer data fusion: https://robotics.caltech.edu/~jerma/research_papers/BayesChapmanKolmogorov.pdf
- Dempster-Shafer sensor fusion: https://www.cs.cmu.edu/~whd/publications/7179.pdf
- Isolation Forest paper: https://www.lamda.nju.edu.cn/publication/icdm08b.pdf
- Dynamic Time Warping explanation: https://rtavenar.github.io/blog/dtw.html
- nparACT non-parametric actigraphy package: https://pmc.ncbi.nlm.nih.gov/articles/PMC4890079/
- Actigraphy statistics RA/IS/IV formulas: https://rstudio-pubs-static.s3.amazonaws.com/528591_e471eb587b4b46a290e9720f0a6ca33c.html
- Interdaily stability variable details: https://www.radc.rush.edu/docs/var/detail.htm?category=Sleep+and+Circadian+Rhythms&subcategory=Sensor+device+measures&variable=is
- Relative amplitude rest-activity rhythm paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC8403141/
- Image-based food recognition survey: https://pmc.ncbi.nlm.nih.gov/articles/PMC8700885/
- Mask R-CNN food segmentation/calorie estimation: https://www.mdpi.com/2076-3417/12/21/10938
- U-Net visual nutrition analysis: https://pmc.ncbi.nlm.nih.gov/articles/PMC11685081/
- MediaPipe Face Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- Mifflin-St Jeor equation: https://pubmed.ncbi.nlm.nih.gov/2305711/
- Compendium of Physical Activities: https://pacompendium.com/
- Bayesian Networks for risk prediction: https://pubmed.ncbi.nlm.nih.gov/30975395/
- Contextual bandits for mental health recommendation: https://arxiv.org/html/2401.15188v1
- Bayesian online changepoint detection: https://arxiv.org/abs/0710.3742
- Adaptive windowing for changing data streams: https://www.cs.upc.edu/~gavalda/papers/ds06slides.pdf
- Bayesian autoregressive online change-point detection with time-varying moments: https://arxiv.org/html/2407.16376v1
