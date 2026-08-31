# Starting the next NAVA Codex task

## What the user should do manually

1. Finish or archive the current oversized Codex task. Do not delete its local
   recovery evidence.
2. Open a new task inside the existing NAVA project. If Codex asks for a working
   directory, select `Q:\NAVA-Workspace\nava-app` rather than the public preview
   repository.
3. Paste the exact bootstrap prompt below.
4. Wait for the new task to report the Git/deployment baseline before giving it
   the next product request.
5. Keep only one task writing the primary checkout. Other tasks may review
   read-only unless deliberately created in isolated worktrees.

The full 206 MB transcript does not need to be copied into the new task.

## Bootstrap prompt to copy

```text
请接管 NAVA 项目，但先不要修改、提交、推送或部署任何内容。

工作目录和唯一业务源码仓库是：
Q:\NAVA-Workspace\nava-app

请按顺序完整阅读：
1. Q:\NAVA-Workspace\nava-app\AGENTS.md
2. Q:\NAVA-Workspace\nava-app\docs\CODEX_HANDOFF_CURRENT.md
3. CURRENT 文件指向的最新版日期交接文档
4. Q:\NAVA-Workspace\nava-app\README.md

然后只做只读核对：
- 确认 cwd、git status、当前分支、HEAD 与 origin/main；
- 确认 Q:\NAVA-Workspace\nava-app-preview 只是公开编译镜像；
- 确认 ChatGPT Sites、GitHub Pages、Supabase 的当前版本/项目标识与交接一致；
- 明确哪些事实已验证，哪些仍需要人工凭据、真实手机、阿里云、SMTP、DNS 或 Mac/Xcode；
- 不要把旧的 2026-08-29 交接状态当成当前状态；
- 不要猜测或自行接续一个没有明确指定的新功能。

核对完成后，用简洁中文报告接管基线，并等待我给出下一项明确任务。
```

## Prompt for the first concrete outcome

After the baseline is confirmed, send one coherent outcome, for example:

```text
本次任务只完成【在这里写一个明确成果】。请先阅读与它直接相关的页面、服务、样式、测试和后端函数，保留所有不相关改动。实现后在 360x740、375x812、390x844、430x932 检查相关页面，运行对应测试；如果我明确要求公开发布，则两个公开站点必须来自同一个已推送源提交并一起验证。没有明确授权时不要部署。
```

## When to start another task

There is no official fixed MB threshold that guarantees Codex task stability.
Use practical signals instead:

- a coherent release or milestone is complete;
- the task starts lagging, replaying old messages, or hiding recent turns;
- the transcript or tool output has become unusually large;
- the next outcome is materially different from the current one.

As a local operating guideline, consider writing a handoff and switching before a
task grows into the 50–100 MB range, and switch immediately if the UI becomes
unreliable. This is a project hygiene rule, not a product limit.
