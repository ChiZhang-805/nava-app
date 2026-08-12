# NAVA App local workspace

当前本机只使用一个 NAVA App 工作区：

```text
Z:\NAVA
├─ app
├─ data
├─ archive
└─ _local
```

## Paths

- `Z:\NAVA\app`: APP 主工程，也是日常开发唯一入口。
- `Z:\NAVA\data`: 固定算法数据集和 benchmark 输出。这里的大文件不提交 Git。
- `Z:\NAVA\archive\nava-app-v46-worktree`: 旧 v46 临时 worktree，只做历史参考。
- `Z:\NAVA\_local`: 本机备份和敏感本地文件备份，不提交 Git。
- `Z:\style-muse-next`: Web 端同学维护的网页仓库/上游参考，APP 端不在这里开发。

## Supabase env

APP 前端连接 Supabase 至少需要：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

同一个 `.env` 只能说明 APP 指向某个 Supabase 项目。要实现 Web、iPhone、Watch 真正互通，还需要同一个 Supabase Auth、兼容的数据表、RLS 权限、Storage 策略和 Edge Functions 合约。

不要把 service role key、JWT secret、个人账号密码或任何后端特权密钥放进 APP、Git、聊天记录或公开部署环境。
