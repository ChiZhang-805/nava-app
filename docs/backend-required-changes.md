# 后端与 Web 配合清单

## 必须确认的配置

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- dev / staging / prod 项目区分
- Auth redirect URL
- Web 当前支持的登录方式
- Edge Functions 入参和出参

## 不应提供给 App 仓库

- Supabase service role key
- 数据库密码
- DeepSeek key
- Gemini key
- Lovable Gateway secret
- 阿里云短信 secret

## 建议优先补的数据库项

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

