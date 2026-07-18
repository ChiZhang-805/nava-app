# 后端与 Web 配合清单

## 分工结论

App 后端由 App 团队负责，但必须部署在 Web 同一个 Supabase 项目里，不能拆出第二套账号系统。

- Web 同学负责：Web 页面、Web 已有表/接口、Web 部署和现有 Auth 配置。
- App 团队负责：Apple Health、Apple Watch、App 图片上传、App 专属 Edge Functions、App migrations、Storage/RLS、节律评分落库。
- 算法同学负责：正式识别/评分模型和稳定接口。

App 后端完整说明见：

```text
docs/app-backend.md
```

## 必须确认的配置

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- dev / staging / prod 项目区分
- Auth redirect URL
- Web 当前支持的登录方式
- Edge Functions 入参和出参
- App 已实现的函数清单：`ai-extract-data`、`ai-chat-reply`、`diet-extract`、`face-analyze`、`health-sync-ingest`、`watch-sync`、`rhythm-score`、`export-user-data`

## 不应提供给 App 仓库

- Supabase service role key
- 数据库密码
- DeepSeek key
- Gemini key
- Lovable Gateway secret
- 阿里云短信 secret

## 建议优先补的数据库项

可执行 SQL 已放入：

```text
supabase/migrations/202607170001_app_mobile_contracts.sql
```

这份迁移包含运动唯一约束、`face_records`、`device_connections`、`health_sync_jobs`。

App Edge Functions 的新增迁移为：

```text
supabase/migrations/202607170002_app_edge_backend.sql
supabase/migrations/202607180001_nava_rhythm_v2.sql
supabase/migrations/202607180002_nava_fusion_v3.sql
supabase/migrations/202607180003_nava_chronostate_v4.sql
```

它包含 `daily_rhythm_scores`、`watch_snapshots`、`health_metric_snapshots`、`diet-photos`、`face-photos`、Storage RLS，以及 NAVA ChronoState V4.4 所需的 `activity_bins`、`sleep_stage_minutes`、`fusion`、`circadian_score`、`data_quality_score`、`score_lower`、`score_upper`、`latent_state`、`change_point_probability`、`trend_slope`、`schema_version`、`rhythm_outcome_feedback`。V4.4 新增的 `chronicDebtPressure` 和 `functionalCompensation` 存在于 `fusion.utilityFusion` JSON 内，不需要新建数据库列。

### NAVA ChronoState V4.4 字段同步

Web 端如要展示 App 算法结果，建议优先读取：

- `daily_rhythm_scores.score`：用户看到的总分。
- `daily_rhythm_scores.confidence` / `data_quality_score`：这次评分是否可信。
- `daily_rhythm_scores.signals`：睡眠、活动、昼夜节律、情绪、饮食、专注、恢复子分。
- `daily_rhythm_scores.fusion`：后端算法解释，不建议直接给普通用户全量展示，可给算法/运营后台使用。
- `daily_rhythm_scores.fusion->utilityFusion`：慢状态、急性证据、低分/高分一致性和趋势压力，用于算法审计。
- `daily_rhythm_scores.fusion->utilityFusion->softDeclinePressure` / `mixedConflict` / `loadRecoveryConflict` / `drawdownPressure` / `transitionPressure` / `chronicDebtPressure` / `functionalCompensation`：慢性下滑、混合冲突、负荷-恢复矛盾、低谷记忆、突发转折、慢性负债和功能补偿审计字段。
- `daily_rhythm_scores.features->circadian`：M10、L5、RA、IV、IS、cosinor、SRI 等节律特征。
- `daily_rhythm_scores.features->signalHealth`：每个信号最近 28 天的连续性和缺失行为。
- `daily_rhythm_scores.anomaly_flags`：异常提示来源。
- `daily_rhythm_scores.profile_labels`：用户状态标签。
- `daily_rhythm_scores.score_lower` / `score_upper`：80% 分数区间。
- `daily_rhythm_scores.change_point_probability` / `trend_slope`：结构性变化和最近趋势。

### AI 自然语言函数

App AI 页现在调用：

- `ai-extract-data`：把一句话抽取成可落库记录，当前内置规则支持睡眠、运动、情绪、专注、饮食、资料更新和多记录组合。
- `ai-chat-reply`：根据抽取结果生成回复，当前内置规则可用；后续可通过 `NAVA_AI_EXTRACT_URL/KEY` 和 `NAVA_AI_CHAT_URL/KEY` 接入算法同学的大模型服务。

Web 端如也要复用同一套 AI 入口，只需要按同一 Supabase Auth 调用这两个 Edge Functions，不需要在网页端重复实现抽取逻辑。

Web 端不需要实现 App 的算法，但需要兼容这些字段，否则 App 先落库的 V4.4 结果在网页端会无法完整展示。

### 1. exercise_records 唯一约束

当前 App 端为避免冲突，先查询再更新。后端更推荐补：

```sql
ALTER TABLE public.exercise_records
ADD CONSTRAINT exercise_records_user_date_unique UNIQUE (user_id, record_date);
```

### 2. face_records

```sql
CREATE TABLE public.face_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  image_path text,
  overall_score numeric,
  skin_age numeric,
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback text,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, record_date)
);

ALTER TABLE public.face_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own face records"
ON public.face_records FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own face records"
ON public.face_records FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own face records"
ON public.face_records FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own face records"
ON public.face_records FOR DELETE TO authenticated
USING (auth.uid() = user_id);
```

### 3. diet-photos 私有化

饮食照片不建议 public read。建议把 bucket 改为私有，并只允许用户访问自己的路径。

## Edge Function 契约建议

所有 AI / 算法接口建议统一返回：

```json
{
  "schemaVersion": "1.0.0",
  "modelVersion": "rhythm-2026-07",
  "summary": "string",
  "score": 88,
  "reasons": [],
  "actions": [],
  "confidence": 0.82
}
```
