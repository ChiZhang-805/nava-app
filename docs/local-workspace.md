# NAVA App local workspace

当前本机只使用一个 NAVA 工作区根；源码、构建、数据、缓存与归档都必须
落在这个根下面，不得在 `Q:\` 或旧 `Z:\NAVA` 路径创建新内容：

```text
Q:\NAVA-Workspace\NAVA-App
├─ nava-app
├─ nava-app-preview
├─ Build
│  ├─ Sites\Packages
│  ├─ TestRuns
│  └─ History
├─ Caches
│  ├─ VirtualEnvs
│  └─ Tooling
├─ Data
├─ Documents
├─ Archive
├─ Temp
└─ Tools
```

## Paths

- `Q:\NAVA-Workspace\NAVA-App\nava-app`: APP 主工程，也是日常开发唯一入口。
- `Q:\NAVA-Workspace\NAVA-App\nava-app-preview`: 独立的静态预览发布仓库，
  不是 `nava-app` 的 worktree 或 submodule。
- `Q:\NAVA-Workspace\NAVA-App\Data`: 固定算法数据集和 benchmark 输出；大文件不提交 Git。
- `Q:\NAVA-Workspace\Build`: Sites 包、跨项目测试证据和构建历史。
- `Q:\NAVA-Workspace\NAVA-App\Caches`: 可重建虚拟环境与工具缓存；不得保存唯一结果。
- `Q:\NAVA-Workspace\NAVA-App\Archive`: 带清单和来源的历史材料。

脚本必须从脚本文件位置解析 `nava-app` 和 workspace 根，不能把
`process.cwd()` 当成可信项目根。需要引用另一个 Web 仓库时显式设置
`NAVA_WEB_REPO`；默认只检查当前 workspace 中的预览仓库。

## Supabase env

APP 前端连接 Supabase 至少需要：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

同一个 `.env` 只能说明 APP 指向某个 Supabase 项目。要实现 Web、iPhone、Watch 真正互通，还需要同一个 Supabase Auth、兼容的数据表、RLS 权限、Storage 策略和 Edge Functions 合约。

不要把 service role key、JWT secret、个人账号密码或任何后端特权密钥放进 APP、Git、聊天记录或公开部署环境。
