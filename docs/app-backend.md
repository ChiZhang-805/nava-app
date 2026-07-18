# NAVA App 后端说明

App 后端不另起账号系统，继续使用 Web 同一个 Supabase 项目。我们负责 App 专属的表、RLS、Storage、Edge Functions 和部署脚本。

## 已实现 Edge Functions

| Function | 作用 | 主要写入 |
| --- | --- | --- |
| `health-sync-ingest` | 接收 iPhone / Apple Watch HealthKit 摘要，写运动、睡眠、小时活动、睡眠阶段、同步任务，并刷新节律分数 | `exercise_records`、`sleep_records`、`health_metric_snapshots`、`health_sync_jobs`、`daily_rhythm_scores` |
| `watch-sync` | 保存 Watch 快照，处理手表快速情绪和专注动作 | `watch_snapshots`、`device_connections`、`mood_records`、`focus_records` |
| `diet-extract` | 饮食照片识别入口，支持正式算法服务转发和 fallback | 不直接写表，App 确认后写 `nutrition_records` |
| `face-analyze` | 面部状态分析入口，支持正式算法服务转发和 fallback | App 确认后写 `face_records` |
| `rhythm-score` | 读取 42 天窗口，生成 NAVA ChronoState V4 节律分、个人基线、节律特征、动态状态、不确定性区间、异常旗标和建议 | `daily_rhythm_scores` |
| `export-user-data` | 导出当前用户 App/Web 共享数据 | 只读 |

## 已实现数据库/Storage

迁移文件：

```text
supabase/migrations/202607170001_app_mobile_contracts.sql
supabase/migrations/202607170002_app_edge_backend.sql
supabase/migrations/202607180001_nava_rhythm_v2.sql
supabase/migrations/202607180002_nava_fusion_v3.sql
supabase/migrations/202607180003_nava_chronostate_v4.sql
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

## NAVA ChronoState V4 输出

`rhythm-score` 和 `health-sync-ingest` 会写入：

- `score`：总节律分。
- `confidence`：当前数据覆盖和历史基线支撑度。
- `signals`：睡眠、活动、昼夜节律、情绪、饮食、专注、恢复子分，每个信号都带 `reliability`。
- `fusion`：非简单加权的融合诊断，包含四因子后验状态、Student-t 鲁棒观测权重、急性证据 blend、低分/高分一致性、趋势压力、变点概率和不确定性区间。
- `baseline`：42 天指数衰减鲁棒个人基线。
- `features`：融合算法、相位、规律性、碎片化、恢复指标、活动节律特征。
- `activity_bins`：HealthKit 24 小时活动曲线，保存于 `health_metric_snapshots`。
- `sleep_stage_minutes`：HealthKit 睡眠阶段分钟数，保存于 `health_metric_snapshots`。
- `regularity_score`：综合 IS/RA/IV 或相位代理后的规律性分。
- `fragmentation_score`：活动碎片化、睡眠阶段和相位偏移合成的风险分。
- `circadian_score`：昼夜节律子分。
- `data_quality_score`：由数据覆盖、历史基线、信号深度换算出的质量分。
- `anomaly_flags`：短睡、相位偏移、低活动、高心率、低 HRV、低血氧、日夜活动幅度弱、日内碎片化高等。
- `profile_labels`：`late_shift`、`recovery_debt`、`activity_gap`、`weak_day_night_boundary`、`fragmented_activity` 等用户状态标签。
- `score_lower` / `score_upper`：80% 分数区间。
- `latent_state`：`circadian`、`recovery`、`behavior`、`affect` 四个潜在状态。
- `change_point_probability`：当日结构性变化概率。
- `trend_slope`：最近一周鲁棒趋势斜率。
- `schema_version`：算法输出 schema 版本。

这套算法现在是 App 后端自研核心 baseline，可直接分享给算法端和 Web 端同学继续增强或展示。它不是简单加权平均：分数由四因子动态状态空间模型、Student-t 鲁棒滤波、风险敏感下尾效用、急性多域一致证据、Bayesian online change-point detection、个体化 MAD 基线和不确定性区间共同生成。

## 部署

先确认本地安装 Supabase CLI，并已登录：

```powershell
supabase login
```

设置项目 ref：

```powershell
$env:SUPABASE_PROJECT_REF="your-project-ref"
```

校验：

```powershell
npm run backend:verify
```

部署数据库和函数：

```powershell
npm run backend:deploy
```

只部署函数：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-backend.ps1 -SkipDbPush
```

## 算法服务配置

正式算法不要把 key 写进 App 仓库。使用 Supabase secrets：

```powershell
supabase secrets set NAVA_DIET_EXTRACT_URL="https://..." NAVA_DIET_EXTRACT_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
supabase secrets set NAVA_FACE_ANALYZE_URL="https://..." NAVA_FACE_ANALYZE_KEY="..." --project-ref $env:SUPABASE_PROJECT_REF
```

未配置正式算法时：

- `diet-extract` 返回低置信度 fallback 食物条目。
- `face-analyze` 返回低置信度基础状态结果。
- App 不会崩溃，但结果不能当成正式算法结论。

## 仍需人工提供

- Supabase 项目 ref 和部署权限。
- Supabase production/staging 环境区分。
- 正式算法服务 URL、鉴权 key、返回 schema。
- iOS/Watch 真机编译所需 Mac、Xcode、Apple Developer Team。
