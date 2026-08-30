# NAVA Codex 最终任务交接（2026-08-29）

> 最终核验：2026-08-29，Asia/Shanghai  
> NAVA 唯一顶级根：`Q:\NAVA-Workspace`  
> 主源码仓：`Q:\NAVA-Workspace\nava-app`  
> 静态预览发布仓：`Q:\NAVA-Workspace\nava-app-figma-preview`  
> 当前任务到此停止：只完成交接，不继续实现或发布，不移动或删除项目数据。

## 1. 当前目标和范围

本文件用于归档旧对话、移除旧 Codex 项目入口，并在正确的 NAVA 项目中新建对话后恢复工作。本次只读取并记录当前文件系统、两个 Git 仓库、Sites 状态和 Q 盘治理结果；没有实现功能、写入 Supabase、提交/推送 Git、保存/部署 Sites、移动或删除数据。

NAVA 的长期目标是让情绪、睡眠、运动、饮食、专注、面部和周报页面由真实 Supabase 用户数据驱动，AI 洞察真正调用模型，并在不同手机尺寸上保持一致的响应式视觉。

停止前最后一个未实现的 UI 请求位于 `#tab=record&module=exercise`：

1. “今日运动”的步数、活动消耗、运动时长整体向左移动。
2. 步数数字后增加大写单位 `STEP`。
3. “健康指标 / 活跃窗口 / 节律同步”三个小卡的图标和字体稍微放大。
4. 继续保持一屏式和多尺寸适配。

上述请求没有形成代码修改。新任务必须先向用户确认是否继续。

## 2. 已完成工作

主仓相对 `origin/main` 新增了 9 个本地提交：

1. `3f435a8 Refine exercise report share poster`：滚动近七日分享海报、标题右侧日期、洞察间距和运动小猫。
2. `ec53cff Redesign mood overview with live daily summary`：情绪摘要/记录/七日趋势三卡，滑块实时驱动今天的数据。
3. `0ca7ab7 Redesign focus overview around real trend data`：专注摘要、趋势和专注事项结构。
4. `742aee4 Make health insights and charts data-driven`：真实健康报告服务、AI Edge Function 和数据库迁移。
5. `16680f2 Refine weekly health report layout`：本周报告、节律轨迹和 AI 洞察排版。
6. `e1fe0e4 Smooth the face trend curve`：保形单调三次 Hermite 曲线。
7. `df3b1e4 Center chart dates beneath bars`：日期与同日柱子中心对齐。
8. `efedb3a Add daily engagement growth rewards`：登录、分享和 AI 对话成长积分。
9. `3c1782c Refine health reports and interaction flows`：健康报告与交互流程调整。

Q 盘治理已由专门任务完成，不得重做：

- 全局规则已从旧 `Q:\AGENTS.md` 迁移到 `Q:\Codex\Live\AGENTS.md`；旧文件当前不存在，不得重建。
- 只读审计脚本已迁移到 `Q:\CodexData\Governance\Audit-QDrive.ps1`。
- `Q:\Revise` 已由用户主动删除，不允许重建。
- Q 根目录只读审计结果为 `retired=0`、`unknown=0`。
- DroneDream、NAVA、Codex 三个所有权域必须长期隔离。
- `Q:\NAVA-Workspace` 是 NAVA 唯一顶级根；不要创建或建议 `Q:\Projects`。
- `nava-app`、`nava-app-figma-preview` 和旧 `.review-venv` 路径保持不动。
- 三个 Sites 包已归档到 `Q:\NAVA-Workspace\Build\Sites\Packages`，移动前后 SHA-256 一致且各有 16 个条目。
- 整理收据：`Q:\NAVA-Workspace\Documents\q-drive-reorganization-20260829.md`。
- Codex sessions 去重已完成；不要再次扫描、合并、重命名或删除 session 数据。

Sites 当前实际状态：

- 项目：`appgprj_6a5de710811c8191af8ce2681358d518`，访问级别为公开。
- 生产地址：`https://nava-app-preview-cz.chizhang1031.chatgpt.site`。
- 当前线上是 v55，源提交 `ec53cffb2195493699c93943ee84953f51e16ac4`，部署状态 `succeeded`。
- v56 已保存但未公开部署，源提交 `3f435a81c9bedfa60807a30ce41f13e66ed1c488`，内容包括最新运动趋势分享海报。

情绪历史补录脚本已经准备，但未执行账号写入：`npm run data:backfill:mood:account`。脚本只补缺失日期，不覆盖已有数据；安全终端曾启动但未输入凭据，随后已结束。

## 3. 当前分支、HEAD、远端关系和全部未提交状态

### 主源码仓 `Q:\NAVA-Workspace\nava-app`

- 分支：`main`
- HEAD：`3f435a81c9bedfa60807a30ce41f13e66ed1c488`
- 上游：`origin/main`
- 上游 HEAD：`b4ef97b88486c36d1f7f76871dad4297861b38bf`
- 关系：`ahead 9, behind 0`
- 远端：`https://github.com/ChiZhang-805/nava-app.git`
- 暂存区为空。
- 当前全部未提交/未跟踪项：

```text
 M docs/local-workspace.md
 M package.json
 M scripts/benchmark-fixed-dataset.ts
 M scripts/compare-fixed-benchmarks.ts
 M scripts/verify-shared-supabase.mjs
?? docs/CODEX_HANDOFF_2026-08-29.md
```

前五项是刚完成的 Q 盘/NAVA 路径治理修改，不能 reset、clean、checkout 或覆盖：

- `docs/local-workspace.md`：把旧 `Z:\NAVA` 说明改成 `Q:\NAVA-Workspace` 规范布局。
- `package.json`：固定数据导出改为 `../Data/synthetic-population`。
- `scripts/benchmark-fixed-dataset.ts`：从脚本位置解析工作区数据路径。
- `scripts/compare-fixed-benchmarks.ts`：默认 benchmark 目录改为工作区 `Data`。
- `scripts/verify-shared-supabase.mjs`：不再依赖 `process.cwd()` 或旧 Z 盘，默认定位工作区 preview 仓，并支持 `NAVA_WEB_REPO` 覆盖。
- 本交接文件当前是未跟踪文件。

### 静态预览发布仓 `Q:\NAVA-Workspace\nava-app-figma-preview`

- 分支：`main`
- HEAD：`313c9e456297c5ba2e5eef648f1b6340401c0000`
- 上游 HEAD：`acdd69d0e6a686aa1eb3e196c59c7fecdbbfae22`
- 关系：`ahead 1, behind 0`
- 远端：`https://github.com/ChiZhang-805/nava-app-figma-preview.git`
- 工作区干净。
- 尚未推送：`313c9e4 deploy: prepare diet and contextual navigation updates`。

`nava-app` 是唯一源码事实来源；`nava-app-figma-preview` 只保存 `npm run build:pages` 生成的静态发布产物。两者不是 worktree、submodule 或链接，也没有本地绝对路径绑定。允许的方向只有“主源码仓构建 -> 受控同步编译产物 -> preview 发布仓”，禁止从 preview 反向合并编译 JS/CSS 到主仓。

## 4. 重要文件及用途

治理与恢复：

- `Q:\Codex\Live\AGENTS.md`：Q 盘全局所有权域和写入/安全规则。
- `Q:\CodexData\Governance\Audit-QDrive.ps1`：只读 Q 根审计。
- `Q:\NAVA-Workspace\README.md`：NAVA 唯一根和规范布局。
- `Q:\NAVA-Workspace\Documents\q-drive-reorganization-20260829.md`：目录整理收据。
- `docs/CODEX_HANDOFF_2026-08-29.md`：新项目/新对话的任务恢复入口。

产品与可视化：

- `src/features/RecordModuleDashboard.tsx`：情绪、睡眠、运动、饮食、专注和面部主页/报告；未实现的运动页请求入口约在 563–582 行。
- `src/features/RecordsScreen.tsx`：记录保存、本周报告、AI 周报和情绪自动保存。
- `src/components/BarLineTrendChart.tsx`：柱状图与折线/曲线、日期和几何中心锚点。
- `src/components/LineTrendChart.tsx`：纯折线/曲线。
- `src/services/chartCurves.ts`：`bump` 和 `monotone` 曲线算法。
- `src/services/visualMetrics.ts`：从真实记录生成图表指标。
- `src/services/healthReport.ts`：调用真实 AI 健康报告。
- `src/services/reportShareCard.ts`：1080×1440 七日分享海报。
- `src/services/demo.ts`：演示入口；真实账号不能依赖这里的前端死值。
- `src/services/ai.ts`：AI 提取/聊天及演示降级；正式 AI 不能把本地规则冒充模型结果。

后端与数据：

- `supabase/functions/ai-health-report/index.ts`：真实 AI 四条健康洞察。
- `supabase/functions/ai-diet-report/index.ts`：饮食 AI 报告。
- `supabase/functions/face-analyze/index.ts`：面部分析，真实线上模型仍需确认。
- `supabase/migrations/202608290001_growth_engagement_rewards.sql`：成长积分事件。
- `supabase/migrations/202608290002_ai_health_reports.sql`：AI 健康报告表。
- `scripts/backfill-account-mood-week.mjs`、`scripts/run-mood-history-secure.ps1`：安全补录缺失情绪历史。

发布与测试：

- `.openai/hosting.json`：现有 Sites 项目 ID；不得新建第二个 NAVA Sites 项目。
- `scripts/prepare-github-pages.mjs`：准备 preview 静态文件。
- `tests/chart-curves.test.ts`、`tests/chart-motion.test.ts`、`tests/weekly-report.test.ts`、`tests/report-share-card.test.ts`：图表、周报和分享卡测试。
- `Q:\NAVA-Workspace\Build\Sites\Packages\nava-sites-*.tgz`：保留的历史部署证据，不是运行依赖。

## 5. 实际运行过的测试、构建和部署结果

最近功能提交明确运行过：

- `npm run report-share:test`：通过，2 个测试。
- `npm run lint`：通过。
- `npm run build`：通过；TypeScript/Vite/Sites 产物成功，只有 chunk 大于 500 KB 的非阻塞警告。
- `git diff --check`：通过。
- 情绪主页视觉验证：390×844、360×740、430×932。
- 情绪滑块实时更新今日摘要和最后一天图表；分享海报做过真实 Canvas 预览。

路径治理修改根据迁移收据已运行并通过：

- TypeScript/JavaScript 语法检查。
- `npm run lint`。
- `npm run build`。
- `git diff --check`。

历史 Sites 包核验：

| 文件 | SHA-256 | 条目 |
| --- | --- | ---: |
| `nava-sites-1700cf0.tgz` | `D4D5D995E5805DB480CEDA70E0131DCBFC05C14A6BF626683D0FF2AF382BE4F2` | 16 |
| `nava-sites-6c1c101.tgz` | `BB1BA327ED1963B01BB7BE74C433C156CCD4222C487F643D6B73A2F56DC96E58` | 16 |
| `nava-sites-76c387a.tgz` | `6BF987C7216491DB096DDEC42EC815B49882E9E4C25BD8FE56181BE0295BA7DF` | 16 |

最终交接再次运行 `Q:\CodexData\Governance\Audit-QDrive.ps1`：成功、只读、未修改文件；retired=0、unknown=0，DroneDream Runtime/download-cache marker 正常，pnpm store 位于预期的 CodexData 缓存目录。

部署：v55 已公开部署成功；v56 仅保存，未公开部署。本最终交接没有运行部署命令。

## 6. 未完成问题、阻塞和风险

1. 运动主页最新 UI 请求未实现。
2. 主仓领先远端 9 个提交，另有 5 个治理修改未暂存和本交接文档未跟踪。
3. preview 仓领先远端 1 个提交。
4. v56 未部署；站点公开，部署前需再次获得明确确认。
5. 情绪历史未补录；需要用户在安全终端输入凭据。
6. Supabase 远端是否已应用新增迁移、Edge Function 和模型密钥尚未完全证明。
7. 生产注册、验证邮件、登录和数据隔离需重新端到端验证。
8. 面部真实模型仍是已知缺口；其他 AI 不得因此使用本地规则冒充模型。
9. 普通网页不能访问 HealthKit；真正 Apple 健康/Watch 同步需要 iOS 原生能力。
10. preview 最新提交缺少明确的 NAVA source SHA 追踪。
11. 旧 `.review-venv` 含绝对路径；不得移动，只能在 `Caches\VirtualEnvs` 重建验证后再单独申请删除。
12. 当前 Codex Saved Project“`NAVA`”指向非 Git 的 `Q:\NAVA-Workspace`，不是正确开发入口。
13. Q 盘目录迁移和 Codex sessions 去重已完成，重复执行可能破坏已整理状态。

## 7. 下一位 Codex 的逐步恢复操作

1. 新项目的准确目录必须是 `Q:\NAVA-Workspace\nava-app`。
2. 完整读取：
   - `Q:\Codex\Live\AGENTS.md`
   - `Q:\NAVA-Workspace\README.md`
   - 本交接文件
   - `Q:\NAVA-Workspace\Documents\q-drive-reorganization-20260829.md`
3. 只读运行：

   ```powershell
   git status --short --branch
   git log -12 --oneline --decorate
   git diff -- docs/local-workspace.md package.json scripts/benchmark-fixed-dataset.ts scripts/compare-fixed-benchmarks.ts scripts/verify-shared-supabase.mjs
   git -C Q:\NAVA-Workspace\nava-app-figma-preview status --short --branch
   & 'Q:\CodexData\Governance\Audit-QDrive.ps1' -FailOnUnknown
   ```

4. 保护第 3 节全部未提交内容；实际状态不同则保护最新状态，不能强行恢复本文快照。
5. 先让用户决定如何提交 5 个路径治理修改和交接文档；建议独立治理提交，不与运动 UI 混合。
6. 推送主仓 9 个提交/治理提交和 preview 的 1 个提交都需要用户授权。
7. 用户确认后再实现运动主页；验证 360×740、375×812、390×844、430×932。
8. 至少运行 `npm run lint`、`npm run chart-motion:test`、`npm run report-share:test`、`npm run interaction:test`、`npm run build`、`git diff --check`。
9. 补录情绪时由用户在安全终端输入凭据，并确认只插入缺失日期。
10. AI/真实数据工作先核验 Supabase 迁移、函数、模型密钥和持久化，不要只看前端。
11. Sites 必须复用现有项目；公开部署需再次确认，不能新建第二个站点。
12. 不得重新整理 Q 盘、重建 `Q:\AGENTS.md`/`Q:\Revise`、创建 `Q:\Projects` 或再次进行 session 去重。

## 8. 关键设计决策和不能轻易修改的约束

1. 登录账号图表必须来自 Supabase；预置历史也必须真实存在数据库，不能写死前端。
2. 历史补录只填缺失日期，不能覆盖真实记录。
3. AI 标识必须对应真实模型调用；不可用时明确报错。
4. 今日和滚动七日以设备本地日期为准，过午夜自动前移。
5. 柱状图最低值保留约 30%–34% 基础高度，最高值映射顶部，其余按比例分配。
6. 指定为柱体几何中心的折线/曲线点不得改回柱顶；日期必须在同日柱子正下方居中。
7. 平滑曲线使用 `monotone` 保形插值；明确要求折线的页面保留直线段。
8. 日期靠近图表底部，数值标签位于柱顶上方且不能重叠。
9. 记录入口负责保存，趋势入口负责报告；报告通常含图表、数据、四条 AI 洞察、小猫和分享。
10. AI 洞察通常四条，每条约 15–18 个汉字；标题到第一条间距略大。
11. 小猫透明背景、完整身体、等比例缩放，不能拉伸。
12. 多手机尺寸保持相同视觉层级，不能只适配单一截图。
13. 0–100 情绪档位无重叠/遗漏；当天实时变化，午夜后昨天固定。
14. 保存 Sites 版本不等于公开部署，部署必须动作前确认。
15. 网页不能伪造 Apple 健康已连接。
16. `Q:\NAVA-Workspace` 是 NAVA 唯一顶级根；禁止创建 `Q:\Projects` 或 `Q:\Revise`。
17. DroneDream、NAVA、Codex 所有权域严格隔离，不能跨域放源码、缓存、构建或 session。
18. 不重做已经完成的目录迁移、包归档、Q 根清理或 Codex sessions 去重。
19. 全局规则只在 `Q:\Codex\Live\AGENTS.md`，不得重建旧 `Q:\AGENTS.md`。
20. `nava-app` 是源码，`nava-app-figma-preview` 是编译发布仓，禁止反向同步。

## 9. 归档旧对话、删除旧项目入口和创建新 NAVA 项目/新对话

当前 Saved Project：

```text
名称：NAVA
项目 ID：d01fe103-4de9-4b89-b118-b1d09985e16a
路径：Q:\NAVA-Workspace
Git 仓库：否
```

恢复顺序：

1. 确认本文档已保存并记录两个仓库状态。
2. 归档旧任务；归档只改变 Codex 任务显示，不能删除本地文件。
3. 在 Codex UI 移除旧 Saved Project“`NAVA`”时，只删除应用入口，绝不能删除本地目录/仓库。
4. 不要重复 Codex sessions 去重。
5. 新增本地项目时准确选择：`Q:\NAVA-Workspace\nava-app`。
6. 不要选择 `Q:\NAVA-Workspace`、`nava-app-figma-preview` 或 `Q:\`。
7. 新项目必须识别为 Git 仓库，远端应为 `ChiZhang-805/nava-app`。
8. 因当前有未提交治理修改，第一个新任务应使用现有本地 checkout/working tree，不要使用不包含这些修改的新 worktree。
9. 新对话首条提示建议：

   ```text
   这是 NAVA 主源码项目。请完整读取 Q:\Codex\Live\AGENTS.md、
   Q:\NAVA-Workspace\README.md 和
   Q:\NAVA-Workspace\nava-app\docs\CODEX_HANDOFF_2026-08-29.md。
   先只读核验两个仓库，保护全部未提交修改；不要重新整理 Q 盘、
   不要重做 sessions 去重、不要创建 Q:\Projects 或 Q:\Revise。
   核验后先报告恢复状态，等待我决定下一项工作。
   ```

10. 新任务应先确认：cwd 正确、主仓 HEAD/ahead 状态、全部未提交内容被保留、preview 仍独立且 ahead 1、Q 审计仍为 retired=0/unknown=0。
11. `nava-app-figma-preview` 可仅在静态发布时单独打开，但绝不能作为 NAVA 主开发项目。

完成以上交接后，本旧对话可以归档；后续 NAVA 工作从指向 `Q:\NAVA-Workspace\nava-app` 的新项目/新对话恢复。
