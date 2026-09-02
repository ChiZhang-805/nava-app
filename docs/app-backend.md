# NAVA App 后端说明

App 的唯一正式后端是 Supabase 项目 `wxteapvwagvhhtrjrbim`。我们负责 App 专属的表、RLS、Storage、Edge Functions 和部署脚本；Web 端完成迁移后也应连接该项目，三端才会共享同一账号与数据源。

## 已实现 Edge Functions

| Function | 作用 | 主要写入 |
| --- | --- | --- |
| `ai-extract-data` | 自然语言记录抽取入口；未配置外部模型时使用本地规则，可识别睡眠、运动、情绪、专注、饮食和资料更新 | App 确认后写对应业务表 |
| `ai-chat-reply` | AI 页回复入口；未配置外部模型时根据抽取结果生成轻量建议 | App 写 `ai_conversations` |
| `health-sync-ingest` | 接收 iPhone / Apple Watch HealthKit 摘要，写运动、睡眠、小时活动、睡眠阶段、同步任务，并刷新节律分数 | `exercise_records`、`sleep_records`、`health_metric_snapshots`、`health_sync_jobs`、`daily_rhythm_scores` |
| `watch-sync` | 保存 Watch 快照，处理手表快速情绪和专注动作 | `watch_snapshots`、`device_connections`、`mood_records`、`focus_records` |
| `diet-extract` | 私有饮食照片的真实视觉模型识别入口 | 不直接写表，App 确认后写 `nutrition_records` |
| `face-analyze` | 私有面部照片的非诊断真实视觉模型入口 | App 确认后写 `face_records` |
| `rhythm-score` | 读取 42 天窗口，生成 NAVA ChronoState V4.8 节律分、个人基线、节律特征、动态状态、慢性负债压力、功能补偿门控、稀疏断崖冲击、慢性停滞压力、绝对生理压力、假恢复 drawdown 压力、相位扰动保护、昼夜漂移压力、生理先导预警、硬撑型消耗压力、自适应端点校准、尾部过反应缓释、不确定性区间、异常旗标和建议 | `daily_rhythm_scores` |
| `export-user-data` | 导出当前用户 App/Web 共享数据 | 只读 |

## 已实现数据库/Storage

迁移文件：

```text
supabase/migrations/202607170001_app_mobile_contracts.sql
supabase/migrations/202607170002_app_edge_backend.sql
supabase/migrations/202607180001_nava_rhythm_v2.sql
supabase/migrations/202607180002_nava_fusion_v3.sql
supabase/migrations/202607180003_nava_chronostate_v4.sql
supabase/migrations/202609020002_health_sync_realtime.sql
```

新增或加固的对象：

- `face_records`
- `device_connections`
- `health_sync_jobs`
- `daily_rhythm_scores`
- `health_metric_snapshots`
- `watch_snapshots`
- `rhythm_outcome_feedback`
- 私有 bucket：`diet-photos`
- 私有 bucket：`face-photos`
- Storage RLS：用户只能访问自己 `user_id/` 路径下的照片
- `health_sync_jobs` Realtime publication：登录用户只通过现有 RLS 接收自己的
  同步完成事件，网页收到成功事件后重新读取规范化记录。

## Apple Health 正式同步合同

- iPhone 客户端只调用启用 JWT 验证的 `health-sync-ingest`；服务端通过
  `requireUser(req)` 得到用户身份，忽略客户端伪造用户归属的可能性。
- 客户端不得包含 `HEALTH_EXPORT_API_KEY`、`x-api-key` 共享写入协议或 service
  role。旧 `health-auto-export` 属于待退役的网页原型链路。
- HealthKit 无样本、用户未授权和真实零值不能混用。原生桥只有在 HealthKit
  返回实际统计量时才发送对应字段，服务端不会用缺失的零覆盖既有记录。
- HealthKit Observer Query 在 App 启动时注册；后台变化先持久化为不包含健康
  数值的待同步标记，运行中的桥或下次前台启动再调用正式 JWT 链路。
- 当前自动同步冷却为 15 分钟；手动同步和真实 HealthKit 变化可越过冷却。
- 无样本日期不会生成伪造零值；部分权限同步会保留同日已有真实字段。旧的每日
  运动表只在有完整活动三元组时新建记录，部分指标仍保存在健康快照，不用 0
  填满缺失字段。
- 页面“最近同步”和 Realtime 刷新只认 `sample_count > 0` 的成功任务；零数据
  尝试仍留在任务表供审计，但不冒充成功连接。
- 完整交付和真机验收见
  `docs/APPLE_HEALTH_WATCH_DELIVERY_PLAN_2026-09-02.md`。

## NAVA ChronoState V4.8 输出

`rhythm-score` 和 `health-sync-ingest` 会写入：

- `score`：总节律分。
- `confidence`：当前数据覆盖和历史基线支撑度。
- `signals`：睡眠、活动、昼夜节律、情绪、饮食、专注、恢复子分，每个信号都带 `reliability`。
- `fusion`：非简单加权的融合诊断，包含四因子后验状态、Student-t 鲁棒观测权重、急性证据 blend、低分/高分一致性、慢性负债压力、功能补偿门控、稀疏断崖冲击、慢性停滞压力、绝对生理压力、假恢复 drawdown 压力、趋势压力、变点概率和不确定性区间。
- `fusion.utilityFusion.softDeclinePressure`：慢性下滑压力，用于审计算法是否应更快响应。
- `fusion.utilityFusion.mixedConflict`：高低信号混合冲突程度，例如高活动但低恢复。
- `fusion.utilityFusion.loadRecoveryConflict`：活动/专注负荷较高但恢复、睡眠或节律偏低时的冲突门控，用于避免把所有矛盾信号简单判成崩塌。
- `fusion.utilityFusion.drawdownPressure`：最近 10-24 天慢性低谷 / 累计下滑记忆，用于审计长期恶化是否被识别。
- `fusion.utilityFusion.transitionPressure`：突发转折压力，用于解释为什么某天区间会变宽。
- `fusion.utilityFusion.chronicDebtPressure`：长期低谷后短期反弹仍未完全恢复时的压力，用于避免当天高活动掩盖慢性欠恢复。
- `fusion.utilityFusion.functionalCompensation`：高活动/高专注但恢复偏低时的功能补偿识别，用于避免把所有负荷-恢复矛盾都直接判成崩塌。
- `fusion.utilityFusion.sparseTransitionShock`：少量但一致的低穿戴信号叠加转折压力时的断崖响应，用于避免稀疏数据下反应过慢。
- `fusion.utilityFusion.drawdownStallPressure`：长期 drawdown 下当天中等信号不足以证明恢复时的停滞压力，用于把分数锚回近期历史状态。
- `fusion.utilityFusion.physiologyStrainPressure`：短睡、低 HRV、高静息心率共同出现时的绝对生理压力，防止长期恶化被个人基线正常化。
- `fusion.utilityFusion.unresolvedDrawdownPressure`：近期低谷后，当天表面信号不低但 HRV/RHR/睡眠没有确认恢复时的假恢复压力。
- `fusion.utilityFusion.phaseTurbulencePressure`：睡眠相位、活动峰值和日内碎片化共同异常时的相位扰动诊断，用来区分 jet lag / shift turbulence 与慢性恶化。
- `fusion.utilityFusion.circadianDriftPressure`：连续相位偏移、睡眠规律性下降和活动碎片化造成的慢性昼夜漂移压力。
- `fusion.utilityFusion.physiologyLeadPressure`：HRV、静息心率、睡眠和血氧先于主观/行为下滑出现异常时的生理预警压力。
- `fusion.utilityFusion.presenteeismStrainPressure`：用户仍在高活动或高专注，但恢复、情绪或昼夜节律已经变弱时的硬撑型消耗压力。
- `fusion.utilityFusion.endpointCalibrationPressure`：中低分且近期 drawdown / transition 证据一致时的端点校准压力，避免慢性下滑被中位数抬高。
- `fusion.utilityFusion.tailOverreactionRelief`：极端单日尾部低值但中位数和历史证据不支持崩塌时的缓释项，减少孤立噪声把分数打穿。
- `baseline`：42 天指数衰减鲁棒个人基线。
- `features`：融合算法、相位、规律性、碎片化、恢复指标、活动节律特征。
- `activity_bins`：HealthKit 24 小时活动曲线，保存于 `health_metric_snapshots`。
- `sleep_stage_minutes`：HealthKit 睡眠阶段分钟数，保存于 `health_metric_snapshots`。
- `regularity_score`：综合 IS/RA/IV 或相位代理后的规律性分。
- `fragmentation_score`：活动碎片化、睡眠阶段和相位偏移合成的风险分。
- `circadian_score`：昼夜节律子分。
- `data_quality_score`：由数据覆盖、历史基线、信号深度、信号连续性和跨信号一致性换算出的质量分。
- `features.signalHealth`：各信号最近 28 天 availability、recency、longest gap、current observed、quality。
- `anomaly_flags`：短睡、相位偏移、低活动、高心率、低 HRV、低血氧、日夜活动幅度弱、日内碎片化高等。
- `profile_labels`：`late_shift`、`recovery_debt`、`activity_gap`、`weak_day_night_boundary`、`fragmented_activity` 等用户状态标签。
- `score_lower` / `score_upper`：80% 分数区间。
- `latent_state`：`circadian`、`recovery`、`behavior`、`affect` 四个潜在状态。
- `change_point_probability`：当日结构性变化概率。
- `trend_slope`：最近一周鲁棒趋势斜率。
- `schema_version`：算法输出 schema 版本。

这套算法现在是 App 后端自研核心 baseline，可直接分享给算法端和 Web 端同学继续增强或展示。它不是简单加权平均：分数由四因子动态状态空间模型、Student-t 鲁棒滤波、风险敏感下尾效用、急性多域一致证据、信号连续性质量建模、慢性负债压力、功能补偿门控、稀疏断崖冲击、慢性停滞压力、绝对生理压力、假恢复 drawdown 压力、相位扰动保护、昼夜漂移压力、生理先导预警、硬撑型消耗压力、自适应残差区间、Bayesian online change-point detection、个体化 MAD 基线和不确定性区间共同生成。

## 部署

先确认本地安装 Supabase CLI，并已登录：

```powershell
supabase login
```

项目 ref 已固定为：

```powershell
$env:SUPABASE_PROJECT_REF="wxteapvwagvhhtrjrbim"
```

校验：

```powershell
npm run backend:verify
```

默认只部署 APP 专属函数，不自动执行数据库迁移：

```powershell
npm run backend:deploy
```

审核全部迁移计划后，才可以显式推送数据库迁移：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-backend.ps1 -ApplyAllMigrations
```

共享的 AI、饮食和面部函数默认不会被覆盖；只有与 Web 后端负责人确认后才使用 `-DeploySharedFunctions`。

## 算法服务配置

正式算法不要把 key 写进 App 仓库。使用 Supabase secrets：

```powershell
supabase secrets set NAVA_DIET_EXTRACT_URL="https://..." NAVA_DIET_EXTRACT_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
supabase secrets set NAVA_FACE_ANALYZE_URL="https://..." NAVA_FACE_ANALYZE_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
supabase secrets set NAVA_AI_EXTRACT_URL="https://..." NAVA_AI_EXTRACT_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
supabase secrets set NAVA_AI_CHAT_URL="https://..." NAVA_AI_CHAT_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
# NAVA 当前正式对话模型：DeepSeek V4 Flash（原 DeepSeek Chat 快速路线）
supabase secrets set DEEPSEEK_API_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
```

`ai-chat-reply` 默认以 SSE 流式返回最终回答。服务端只根据当前 JWT 读取该用户的最近对话、画像和健康摘要，并向 DeepSeek 传递匿名化 `user_id`；客户端提交的历史记录和健康上下文不会作为权威数据使用。界面在首个文本片段前只展示一次与授权画像相适配的处理状态，不展示模型隐藏推理原文。

未配置正式算法时：

- `ai-extract-data` 明确返回“真实记录抽取模型尚未配置”；规则解析只作为模型输入候选，不会在正式模式冒充模型结果。
- `ai-chat-reply` 返回“真实 AI 尚未配置”，不会用演示文案伪装成外部模型结果。
- `diet-extract` 和 `face-analyze` 明确返回视觉模型未配置，不会生成固定食物、分数或面部结论。
- App 保持可操作并显示可理解的错误，但不会把失败包装成分析成功。

饮食和面部照片必须先上传到当前账号前缀下的私有 Storage。
Edge Function 会校验对象路径归属，只生成十分钟签名 URL；客户端提供的
原始 `data:` 图片或任意其他账号路径都不能绕过此边界。

健康和饮食 AI 报告的缓存包含规范化源数据指纹。只要画像或对应时期的
真实记录发生变化，旧缓存即失效并重新调用模型；仅凭同一日期和报告类型
不再复用已经过期的文字。

## 仍需人工提供

- Supabase production/staging 环境区分。
- 正式算法服务 URL、鉴权 key、返回 schema。
- iOS/Watch 真机编译所需 Mac、Xcode、Apple Developer Team。
