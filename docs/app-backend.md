# NAVA App 后端说明

App 后端不另起账号系统，继续使用 Web 同一个 Supabase 项目。我们负责 App 专属的表、RLS、Storage、Edge Functions 和部署脚本。

## 已实现 Edge Functions

| Function | 作用 | 主要写入 |
| --- | --- | --- |
| `health-sync-ingest` | 接收 iPhone / Apple Watch HealthKit 摘要，写运动、睡眠、同步任务，并刷新节律分数 | `exercise_records`、`sleep_records`、`health_sync_jobs`、`daily_rhythm_scores` |
| `watch-sync` | 保存 Watch 快照，处理手表快速情绪和专注动作 | `watch_snapshots`、`device_connections`、`mood_records`、`focus_records` |
| `diet-extract` | 饮食照片识别入口，支持正式算法服务转发和 fallback | 不直接写表，App 确认后写 `nutrition_records` |
| `face-analyze` | 面部状态分析入口，支持正式算法服务转发和 fallback | App 确认后写 `face_records` |
| `rhythm-score` | 读取当日多源数据，生成节律分、理由、建议、信心度 | `daily_rhythm_scores` |
| `export-user-data` | 导出当前用户 App/Web 共享数据 | 只读 |

## 已实现数据库/Storage

迁移文件：

```text
supabase/migrations/202607170001_app_mobile_contracts.sql
supabase/migrations/202607170002_app_edge_backend.sql
```

新增或加固的对象：

- `face_records`
- `device_connections`
- `health_sync_jobs`
- `daily_rhythm_scores`
- `watch_snapshots`
- 私有 bucket：`diet-photos`
- 私有 bucket：`face-photos`
- Storage RLS：用户只能访问自己 `user_id/` 路径下的照片

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
