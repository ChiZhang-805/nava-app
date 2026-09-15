# NAVA App 后端说明

App 的唯一正式后端是 Supabase 项目 `wxteapvwagvhhtrjrbim`。我们负责 App 专属的表、RLS、Storage、Edge Functions 和部署脚本；Web 端完成迁移后也应连接该项目，三端才会共享同一账号与数据源。

## 已实现 Edge Functions

| Function | 作用 | 主要写入 |
| --- | --- | --- |
| `ai-extract-data` | 使用正式模型提取睡眠、运动、情绪、专注、饮食、资料更新和待办；本地规则只形成候选，用户确认后保存 | App 确认后写对应业务表 |
| `ai-chat-reply` | 基于当前 JWT、授权画像与真实记录流式生成 NAVA AI 回复 | App 写 `ai_conversations` |
| `ai-diet-report` | 根据最近七日真实饮食和授权画像生成普通与紧凑摘要 | 当前日 `nutrition_records.ai_feedback` |
| `ai-health-report` | 为情绪、睡眠、运动、专注、面部和周报生成带证据、行动与置信度的结构化报告 | `ai_health_reports` |
| `dnb-weekly-report` | 对明确日期区间运行研究性 FDNB 周分析 | `fdnb_health_scores`、`weekly_health_reports` |
| `fdnb-recompute` | 对截至指定日期的纵向窗口重新计算 FDNB | `fdnb_health_scores`、`weekly_health_reports` |
| `health-sync-ingest` | 接收 iPhone / Apple Watch HealthKit 摘要，写运动、睡眠、小时活动、睡眠阶段、同步任务，并刷新节律分数 | `exercise_records`、`sleep_records`、`health_metric_snapshots`、`health_sync_jobs`、`daily_rhythm_scores` |
| `watch-sync` | 保存 Watch 快照，处理手表快速情绪和专注动作；完成事件通过稳定 action id 原子写入会话明细、日聚合和时段分布 | `watch_snapshots`、`device_connections`、`mood_records`、`focus_session_events`、`focus_records`、`focus_time_distribution` |
| `diet-extract` | 私有饮食照片的真实视觉模型识别入口 | 不直接写表，App 确认后写 `nutrition_records` |
| `face-analyze` | 私有面部照片的非诊断真实视觉模型入口；同时返回光线、居中、自然表情三项非阻塞拍摄条件判断 | App 确认后写 `face_records`；条件判断只用于当前拍摄交互 |
| `rhythm-score` | 读取 42 天窗口，生成 NAVA ChronoState V4.27 节律分、个人基线、节律特征、动态状态、慢性负债压力、功能补偿门控、稀疏断崖冲击、慢性停滞压力、绝对生理压力、假恢复 drawdown 压力、相位扰动保护、昼夜漂移压力、生理先导预警、硬撑型消耗压力、自适应端点校准、尾部过反应缓释、不确定性区间、异常旗标和建议 | `daily_rhythm_scores` |
| `export-user-data` | 导出当前用户 Auth 身份、全部账号表以及三个私有 bucket 的文件清单；客户端随后下载实际文件内容并与 JSON 打包，任一表/文件读取失败则拒绝伪装成完整导出 | 只读 |
| `delete-account` | 先删除当前用户三个私有 bucket 下的对象及邮箱/手机号对应的服务端 HMAC 限流摘要，再删除 Auth 身份；所有账号表由数据库外键级联删除 | 私有文件、账号安全摘要与当前 Auth 用户 |
| `aliyun-sms-send` | 生成、限流、发送中国大陆手机号 OTP | `nava_phone_otp_challenges` |
| `aliyun-sms-verify` | 校验 OTP 并完成手机号身份映射/登录流程 | OTP challenge 与 Auth identity |
| `auth-account-status` | 以不暴露账号是否存在的公共响应执行注册/登录资格检查 | 只读 |
| `push-dispatch` | 以内部 secret 调度当前用户已有通知到 APNs、FCM v1 或 HMS，并记录幂等送达结果 | `push_delivery_receipts`、失效时更新 `push_device_tokens`（production 已部署；provider 凭据与真机送达待验收） |

### 饮食照片热量估算与修正

`diet-extract` 的视觉模型只根据照片中**实际可见的份量**估算菜品、克重、热量和三大营养素，不能把标准一份直接当作照片份量；遮挡、油脂、酱汁和封闭馅料的不确定性要降低置信度并提示核对。输出的每项营养来源标记为 `vision_estimate`，不是数据库核准值；每日总热量和三大营养素以各食物项目之和为准，避免模型另报的 totals 与项目值矛盾。用户在 APP 逐项修改克重时，当前项目的热量与三大营养素按新旧克重比例复算；直接修改项目热量则仅替换该热量。修改后标记 `user_corrected`，但仍不声称另外三项已由营养数据库重新核准。保存依旧需要用户确认，并由现有四餐聚合流程写入 `nutrition_records`。

这一步没有擅自接入 FatSecret、Passio、Gemini 或 Edamam。现有 USDA FoodData Central 知识工具用于 AI 文本证据，不代表饮食照片链路已经用 USDA 逐项核准。供应商数据库授权、匹配质量、地区覆盖和缓存条款需要另行验证后才能把项目标记为 `usda_fdc`；在此之前 UI 明示 AI 估算或待核对，不宣传“拍照精确测热量”。

最后留存部署记录中，canonical 项目的 `diet-extract` version25、`ai-diet-report` version23、`ai-health-report` version23 和 `ai-extract-data` version27 均为 ACTIVE/JWT；2026-09-15 `ai-chat-reply` 已更新到 ACTIVE version42/JWT，专注优先 Pro、双站四入口真实生成/显示通过，见总交接§77。其余版本的留存部署记录不等于本日全部通路重新验收。`ai-extract-data` v27 新增待办意图及设备本地日期、时间的模型结构化抽取；曾用授权账号验证“下周三上午九点要准备小组汇报”得到事项、日期和09:00，否定句未生成待办，两次抽取均未写任务。饮食摘要合同为 `deepseek-v4-flash-15-18-plus-compact-seven-v11-single-item-repair`，健康报告合同为 `deepseek-v4-flash-health-report-v9-grounded-evidence-repair`。留存的2026-08-28至09-13账号安全审计确认十类记录表各覆盖17/17天、四餐逐项/日聚合一致、饮食摘要17/17有真实DeepSeek v11结果、六种健康报告作用域每个日期有真实DeepSeek结果。当时真实登录两站可读09-07至09-13结构化AI周洞察；Sites饮食页可见09-13四餐、AI即时反馈及份量/热量编辑器。上述读取与来源审计不等于逐历史日期重新调用模型，不作为今天当前可用性保证。

以下 2026-09-10 至 09-13 的版本号和验收段落保留为历史快照，不代表上述当前部署版本。
截至 2026-09-10，当轮涉及的 `ai-chat-reply`、`ai-diet-report`、`ai-health-report`、
`diet-extract`、`delete-account`、`export-user-data`、`health-sync-ingest` 和 `watch-sync`
最新源码均已部署到 canonical 项目，状态 ACTIVE 且启用 JWT 验证。真实账号的模型输出、
Apple 真机和破坏性账号删除仍按各专项文档明确为人工验收，不因部署完成而自动视为通过。

`ai-health-report` 当时的生产模型合同为
`deepseek-v4-flash-health-report-v8-derived-evidence-normalization`，canonical Supabase
上为 ACTIVE version 21、`verify_jwt=true`。它在 65 秒总预算内最多执行三次有界生成/结构
修复，并对网络、408、429 与 provider 5xx 做短退避重试；模型使用的派生统计值只有在后端
可从授权记录精确复算时才通过，无法核对的数字仍会被拒绝。2026-09-10 的真实登录强制刷新
验收已确认情绪、睡眠、运动、专注、面部和周报 6/6 均由 DeepSeek 生成结构化 v8 报告并
持久化；未认证请求返回 HTTP 401。后续真实登录缓存演练在不修改原始健康记录的前提下，
逐作用域临时注入过期报告指纹，确认六类均会重新生成一次并在下一次相同请求中复用新缓存；
原缓存复用、指纹失效重算和新缓存复用共 18 项检查全部通过。

2026-09-13 的账号补齐验收发现，饮食的每日一行 `nutrition_records` 同时包含早餐、午餐、
晚餐、加餐四组条目与时间；页面的 `3/4` 是加餐为空，不是 Supabase 把三餐计错。
补齐后 2026-09-10 至 09-12 各日四餐均有记录，各餐内嵌营养汇总及每日总量在
热量、蛋白质、碳水、脂肪、饮水量上均一致。六作用域 `ai-health-report` 的三日普通
读取均返回真实 DeepSeek v8 结构化结果。`ai-diet-report` 生产 v6 在这三日重生成时
均因双四条严格长度合同失败。经用户单独授权后，v7 用逐项明确的 JSON 模板和 15–18
汉字/七汉字要求指导模型，输出预算从 220 提升至 500 tokens，最多三轮；失败轮次将每项
实际字数和前一轮模型草稿送回同一模型定向修复，仍不放宽长度、来源或非诊断校验。
生产函数经两次有界部署后为 ACTIVE version 17、`verify_jwt=true`。三天的普通读取均
返回与当前源指纹一致的 DeepSeek v7 摘要，`nutrition_records.ai_feedback` 各有四条
15–18 汉字正文及四条七字小卡标签，安全审计 3/3 通过。公开 APP 登录后逐日可见三条
不同的真实 AI 即时反馈，不再显示格式错误；没有手写摘要直接入库。
公开 APP 的旧浏览器会话曾显示 Edge Function 登录提示，退出再登录后调用恢复；尚未
证明这是前端鉴权实现缺陷，故未改动前端或当前标签页会话策略。

2026-09-06 单独将 `aliyun-sms-send` 的阿里云 `SendSms` 请求改为官方自签名示例使用的
canonical query + 空请求体，并部署为 production version 17（ACTIVE，公开注册边界因此
保持 `verify_jwt=false`）。上线后的无效手机号探测已确认请求进入新函数且业务校验正常；
未向真实手机号发送测试短信，因此运营侧仍需完成一次真实发送、收码和校验验收。

## 已实现数据库/Storage

当前源码共有 29 个 append-only migration，目录 `supabase/migrations` 是唯一文件清单
来源。它们按顺序覆盖：移动端业务表和 Edge 后端、Rhythm/Fusion/ChronoState、
密码复用保护、手机号 OTP、Watch action 幂等、头像、账号状态、onboarding、FDNB、
AI 会话隔离、成长奖励、健康报告、专注待办、Health Realtime，以及跨设备账号状态和
删除/导出完整性、运动恢复闭环、远程推送设备路由与待办四象限排序。2026-09-14 已在 canonical
production 应用前 28 项；2026-09-15 追加应用 `202609150001_unknown_nutrition_calories.sql`。

该迁移仅移除 `nutrition_records.total_calories` 的 NOT NULL 和默认零，不改写历史
数据。饮食/运动缺失数值以 null 表示；用户明确填写的零保留零。新运动行显式写入
null，避免旧 DEFAULT 0 自动补值；更新时 undefined 表示未更改、null 表示清空。
非空餐食中任一项目热量未知，总热量保持未知；不能按每日热量比例猜测每餐三大
营养素。修改单项热量不覆盖独立填写的蛋白质/碳水/脂肪。同批 source_id 去重，全部
重放不写库，不抹掉现有聚合。恢复时长未知时不生成估算。

`verify-record-null-storage.mjs` 在 canonical 数据库以指定账号的 authenticated RLS
身份做 null→0→null 往返，始终事务回滚；不输出账号记录/密钥，不改变历史数据。
四档独立浏览器本地表单覆盖空值、真实零、保存回读、摘要和不伪造恢复估算；本地
表单证据不能冒充正式账号的健康记录写入验收。

`202609140001_task_quadrants_priority.sql` 给 `tasks` 增加可空的重要、紧急布尔字段和
用户确认后才保存的排序位次；数据库检查两项分类必须同时有值或同时为空，旧任务不会被
推断为重要/紧急。`nava_set_task_priority_order` 用当前认证用户权限在一笔事务中验证
2–12 条未完成待办并写入排序；RLS 仍限制账号隔离。正式账号用两条临时任务完成分类、
原子排序和重新登录读取验收，随后按精确 ID 删除临时任务。

查看精确清单：

```powershell
Get-ChildItem -LiteralPath supabase/migrations -File | Sort-Object Name
```

其中与健康/Watch 主链路直接相关的新增或加固对象包括：

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
- `user_app_preferences`：语言、AI 语音和首页 0–6 个组件及排序；本地存储只作缓存。
- `user_notifications`：应用内收件箱、已读与删除 tombstone，并通过 Realtime 同步。
- `ai_conversation_archives`：用户手动新建会话或设备本地日期跨日时的 AI 会话归档。
  现有表仍只使用 `messages` JSONB；归档日期与标题保存在数组首项的版本化
  `__navaArchive` 元数据中，读取时会剥离，旧版纯消息数组仍可兼容，因此本轮不需要
  修改已应用 migration。归档写入成功后才按当前用户和消息 ID 删除活动会话行；历史
  删除也同时约束 `user_id` 与归档 `id`。
- `active_user_sessions`：支持进行中的专注/睡眠/运动会话，供换设备或清理缓存后恢复。
- `focus_session_events` 与 `record_focus_session`：以稳定 action id 保存每次专注完成事件，
  并在同一数据库事务中更新 `focus_records` 和 `focus_time_distribution`，重复提交不会重复累计。
- `focus_records.note`、`tasks.source` 与四餐时间字段均由编辑器真实读写；新增的
  `pantry_time` 补齐加餐时间。
- `profile-avatars` 已从公开 bucket 收紧为私有、仅当前 owner 可读写删除；`profiles.avatar_url`
  保存稳定 `storage://` 引用，页面展示时再签发一小时 URL。
- `exercise_records` 新增酸痛、疲劳、伤病、保守恢复区间、置信度、可审计依据和后续
  恢复状态；字段由已应用的 `202609070004` 定义。
- `push_device_tokens` 与 `push_delivery_receipts` 定义账号隔离、级联删除、token 停用和
  幂等 provider 送达记录；由已应用的 `202609070005` 定义。

## 账号数据完整性合同

- 生产 migration `202609060001_cloud_data_completeness.sql` 会遍历所有 public
  `user_id` 表；任何表没有指向 `auth.users` 的 `ON DELETE CASCADE` 外键都会使迁移失败。
  `profiles.id` 也有同样断言，旧账号缺失的 profile 会按 Auth 身份安全回填。
- `delete-account` 还会用服务端相同 HMAC 合同清除该邮箱/手机号在
  `nava_auth_account_checks` 与 `nava_phone_otp_challenges` 中的账号相关限流摘要。
  若共享项目仍保留旧 `phone_verification_codes` 表，也会用只授予 service role 的
  `nava_delete_legacy_phone_codes` 清除匹配手机号残留。
  这些无明文、短期留存的服务器风控状态不属于用户内容，因此不进入用户导出。
- `export-user-data` 生产源码覆盖全部 45 个账号归属 public 表、Auth 基本身份与三个用户
  Storage 前缀；其中积分商城的购物车、订单和订单明细也属于导出范围，商品公共目录不属于
  单一账号数据。客户端把清单中的私有文件逐一下载并连同 JSON 生成 `.tar.gz` / `.tar`。
  它不会导出 access token、service-role、OTP、服务器密钥或其他凭据。
- 删除账号时，服务端先清空三个用户 Storage 前缀，再删除 Auth 身份并触发数据库级联；
  客户端同时清除该用户的 local/session storage、AES-GCM 面部草稿、Watch 待处理动作、
  Watch 当前快照和已安排的本地系统通知。
- 浏览器 Supabase 登录仍有意保留为当前 tab 的 `sessionStorage`；未确认上传的原始面部
  草稿仍只在本机加密保存 30 分钟；Watch 离线动作在送达前仍需要本机队列。这三类数据
  留在设备是安全/离线边界，不是云端事实源缺口。

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
  `docs/APPLE_HEALTH_WATCH_DELIVERY.md`。

## 通知数据与送达边界

- 应用内通知由当天真实 `TodaySnapshot`、ChronoState 已持久化 action 或成功保存的
  记录事件生成；生产构建不注入演示通知。
- `notification_preferences` 只保存当前用户的提醒类型、是否启用、本地时间、时区和
  最近调度时间，并由 RLS 隔离。它不是通知消息表。
- 通知收件箱、已读/删除和撤销状态以 `user_notifications` 为云端事实源；设备
  `localStorage` 是启动与离线缓存。只同步实际变更的通知行，避免一台设备用陈旧全量列表
  覆盖另一台设备；失败写入会留在账号隔离的 outbox 并在下次加载/导出前重试，Realtime
  会刷新当前打开的客户端。通知偏好、记录草稿、首页偏好和进行中会话采用相同的先排队、
  成功后才清除 pending 合同。
- Capacitor 本地通知可在已安装原生 App 中由系统离线调度；网页 Notification API
  只在页面打开且浏览器允许时作为增强。远程 APNs/FCM/HMS 的 token 表、客户端注册和
  `push-dispatch` 已部署 production；内部调度 secret 与 provider 凭据尚未配置，也未完成真机送达验收。
- 详细合同与人工验收边界见
  [`NOTIFICATIONS_DELIVERY.md`](./NOTIFICATIONS_DELIVERY.md)。

## NAVA ChronoState V4.27 输出

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

## 2026-09-07 真实数据读写、完整性与可视化复核

- 生产共享项目再次通过扩展后的字段探针。探针不再只检查代表列，而是覆盖六模块
  编辑器、详情页、HealthKit 快照、Watch 快照、ChronoState 特征、FDNB 输出、
  AI 报告、云端草稿、通知和用户偏好实际读取/写入的字段；`ai-health-report` 与
  `ai-diet-report` 也纳入线上 Function 状态检查。
- 周报节律轨迹只在真实点数为零时显示无数据占位；一个或更多真实点会直接绘制。
  六维雷达图对没有记录日的维度显示 `--` 且不绘制成零分，避免把缺失解释为健康低分。
- 当日综合报告的 `x/6` 使用与六模块进度环相同的完成合同，不再把一条未完成的部分记录
  计为完整模块。无睡眠/节律数据时，生物钟同步显示 `--`，不生成虚假的 `0%`。
- 睡眠草稿现在恢复起止时间、总时长、三种睡眠阶段、评分和备注；运动草稿恢复步数、
  热量、分钟、心率、血氧和备注。Supabase `record_drafts` 仍是跨设备事实源，浏览器
  localStorage 只是离线缓存。
- 保存记录后的 AI 报告请求不再强制绕过缓存。Edge Function 每次根据当前画像与记录
  计算 `sourceFingerprint`：相同输入直接返回已存报告，输入变化才调用模型并覆盖同一
  日期/范围的报告。
- Watch 动作保留设备本地日期和 UTC offset；生产 `watch-sync` v13 按动作发生时间分配
  专注时段，而不是按服务器收到请求的 UTC 时间。原生动作只有在服务端接收成功后才确认；
  失败或超时的 receipt 可安全重领，`focus.stop` 通过原子 RPC 防止重复累计。
- 手工饮食和 AI 确认饮食都带稳定来源 ID；同一编辑/确认动作在网络响应丢失后重试不会
  重复追加。四餐各自保存宏量营养摘要，日总量由四餐真实合计重算，不再把全天总量复制到每餐。
- HealthKit 空摘要不会创建空节律分；活动分箱、时间、心率、HRV、血氧、睡眠效率等在入库前
  做边界校验。健康报告和 AI 对话授权上下文已纳入 `health_metric_snapshots` 与完整允许画像。
- 2026-09-07 已实际应用 migration `202609070001`–`202609070005`；最终验收点本地与远端均为
  26 项，`supabase db lint --linked --level warning` 返回零 schema 错误。生产表统计可见既有六模块、
  健康快照、节律分、周报和 AI 报告真实行，新专注事件表已建立但尚无新客户端写入。
- 本轮相关函数中，`export-user-data` production v24 为 ACTIVE、`verify_jwt=true`；
  `push-dispatch` production v1 为 ACTIVE，并按设计以独立内部 secret 而非用户 JWT 鉴权。

## 2026-09-07 运动恢复与远程推送源码补齐

- NAVA Sports 的预设现在可真正开始、暂停、继续、结束或放弃；wall-clock 活动会话通过
  `active_user_sessions` 恢复，结束后只预填实际计时分钟并进入用户确认编辑器。
- 运动记录新增 1–5 感受、0–10 酸痛/疲劳、伤病说明、规则恢复时间范围、置信度、依据和
  后续恢复复测。估算是保守可审计规则，不冒充医学或训练处方。
- 原生远程 token 注册、退出停用、通知点击深链、Android channel、APNs 桥、设备/receipt
  migration 和 APNs/FCM/HMS 派发函数均已写入源码。推送正文继续来自
  `user_notifications`，receipt 只记录 provider 状态，不伪造用户已收到。
- 2026-09-07 本轮本地和 production migration 总数均为 26，当时导出函数覆盖 42 张账号表；
  `export-user-data` 与 `push-dispatch` 已部署。`NAVA_PUSH_DISPATCH_SECRET` 与 APNs/FCM/HMS
  provider secret 仍未配置，
  真实设备送达仍必须在提供平台凭据后验收，不能因函数 ACTIVE 就写成已经收到通知。

上述结论证明结构、部署和既有真实持久化行已核对，但不替代指定账号逐字段比对、真实模型
首次成功生成、Apple 真机或真实账号删除/完整导出等人工验收。

## 2026-09-08 积分商城与原子购买合同

- migration `202609080001_reward_shop.sql` 已应用到 canonical production；商品目录、购物车、
  订单和订单明细分别使用 `reward_products`、`reward_cart_items`、`reward_orders`、
  `reward_order_items`。商品库存字段不直接授予客户端读取，前端只看到 `sold_out`。
- `nava_reward_points_balance()` 从当前账号的成长积分账本计算可用余额；
  `nava_set_reward_cart_item()` 只修改当前账号购物车；`nava_checkout_reward_cart()` 使用
  幂等 request UUID、用户级事务锁和商品行锁，在同一事务内核验余额、扣减库存、写订单及
  清空已购买购物车。并发抢最后一件时只有锁内最先满足条件的请求能成功。
- 当前 production 没有伪造商品或库存。空目录由前端显示四张“商品待上架 / 定价：待填写”
  运营占位；占位不能加入购物车。真实商品上线需通过受控后台写入目录与库存，而不是把
  inventory 或 service-role 暴露给浏览器。
- `export-user-data` production 已升级到 schema 1.3.0，覆盖新增的三个账号归属商城表；
  账号数据表总数为 45。商品公共目录不随单个用户导出。

## 仍需人工提供

- Supabase production/staging 环境区分。
- 正式算法服务 URL、鉴权 key、返回 schema。
- iOS/Watch 真机编译所需 Mac、Xcode、Apple Developer Team。
