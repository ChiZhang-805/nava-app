# NAVA 算法调研与自研路线

本调研面向 Apple Watch / Apple 健康用户。结论是：不采用简单加权平均，也不直接上不可解释黑盒模型。当前后端已实现 NAVA Fusion v3：个人基线、小时活动节律、恢复指标、异常检测、证据可靠度、非线性融合和风险门控。

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
| 12 | Kalman Filter / sensor fusion | 融合心率、步数、运动、睡眠噪声 | v3 使用，适合多传感器稳定化 |
| 13 | Bayesian Network | 处理缺失数据和解释风险/状态关系 | v2 使用在置信度和缺失补全 |
| 14 | Isolation Forest | 发现异常睡眠、异常心率、异常活动 | v2 使用，做异常提醒 |
| 15 | Dynamic Time Warping | 比较今日作息曲线与个人典型日是否相似 | v2 使用，做规律性分数 |
| 16 | K-means / GMM 用户分型 | 识别夜猫型、运动型、高压型等群体 | v3 使用，数据量足够后上 |
| 17 | Random Forest / GBDT | 表格特征的稳健预测 | v3 使用，训练个性化评分辅助模型 |
| 18 | Temporal CNN / LSTM | 多日时间序列预测明日状态 | v3 使用，数据量足够后上 |
| 19 | Contextual Bandit | 个性化推荐“什么时候提醒、提醒什么” | v3 使用，必须有反馈闭环 |
| 20 | CNN / EfficientNet 食物分类 | 从照片识别食物类别 | 饮食算法核心之一 |
| 21 | Mask R-CNN / YOLO 实例分割 | 多食物分离、识别盘中多个物体 | 饮食算法核心之一 |
| 22 | U-Net 食物区域分割 | 分出食物区域，辅助份量估计 | 饮食算法核心之一 |
| 23 | CLIP / VLM 开放词表识别 | 识别长尾菜品，适合中餐复杂场景 | 建议接入，但必须用户确认 |
| 24 | MediaPipe Face Landmarker | 移动端实时人脸关键点 | 面部状态算法基础 |
| 25 | Facial Action Coding / 表情特征 | 疲劳、压力、情绪表情线索 | 只能做状态提示，不能做医疗判断 |
| 26 | 多模态融合评分 | 睡眠、活动、饮食、情绪、面部状态融合 | NAVA 自研算法主线 |
| 27 | Dempster-Shafer evidence fusion | 多来源证据可信度不同且可能互相冲突 | v3 已用于 belief / disbelief / uncertainty 证据质量合成 |
| 28 | Geometric mean / bottleneck fusion | 防止一个高分信号掩盖关键短板 | v3 已用作短板约束 |
| 29 | EWMA / CUSUM change detection | 识别相对个人基线的连续偏移 | v4 可用于更早发现恢复债和节律漂移 |
| 30 | Robust z-score / MAD | 对异常值更稳健的个人基线检测 | v4 建议替代部分均值/标准差阈值 |
| 31 | Entropy / sample entropy | 衡量日内活动和心率序列复杂度 | v4 可用于碎片化与恢复质量增强 |
| 32 | SHAP / feature attribution | 解释机器学习模型为什么给出某个建议 | v4 若接入 GBDT/深度模型后必须配套 |

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

`rhythm-score` Edge Function 曾实现 v1 baseline，现在已升级为 v3。

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

### v4：个性化推荐模型

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
- Wearable circadian rhythm analysis: https://www.jmir.org/2021/10/e18403/
- HRV wearable review: https://pmc.ncbi.nlm.nih.gov/articles/PMC10742885/
- Multisensor fusion review: https://arxiv.org/html/2412.05895v1
- Wearable health multi-sensor fusion review: https://www.sciencedirect.com/science/article/pii/S1566253526001983
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
