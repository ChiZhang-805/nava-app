# 国内食物重制模型配置（2026-11-07，源码已配置，未部署）

`food-visualize` 的生产默认链路已经从国外生图服务切换为阿里云百炼北京区：

- 菜品理解与最终双图复核：`qwen3-vl-plus`；
- 低成本首次生成：`wan2.7-image`，官方北京区定价 0.20 元/张；
- 质量失败后的第二次兜底：`wan2.7-image-pro`，官方北京区定价 0.50 元/张；
- 生成后透明底：显式 `NAVA_FOOD_MATTING_URL` 适配国内抠图服务；参考阿里云智能抠图
  0.002 元/张。该步骤只处理 AI 重制后的标准白盘素材，不抠用户原始照片。

必须配置 NAVA 专用 `DASHSCOPE_API_KEY_NAVA`，推荐同时配置
`NAVA_DASHSCOPE_WORKSPACE_ID`。抠图适配器必须返回 `imageBase64`、可选 `modelVersion`，且结果
必须是真实 alpha 的严格 1024×1024 PNG，否则 Edge Function 与 iOS 两端都会拒绝。可用
`NAVA_FOOD_RENDER_MODEL`、`NAVA_FOOD_RENDER_FALLBACK_MODEL`、
`NAVA_FOOD_RENDER_QA_MODEL` 覆盖模型名；不得回退到通用、其他项目或国外模型密钥。

当前只完成本地源码、部署脚本和合同配置；尚未向 Supabase 写入密钥、部署新函数或用真实
样本计费调用。上线前还要接入国内抠图适配器并完成菜品身份、可见食材、透明通道和像素规格
四类验收。

# 账号完整导出本地修复（2026-10-30，未部署）

`export-user-data` 和前端导出回退共用 `_shared/export-pagination.ts`：按稳定列分页，
每页读取 exact count，按实际返回行数前进，提前空页、计数变化或查询失败立即报错。
避免 Supabase 行数上限将首批记录冒充完整数据。不是数据库事务快照，导出期间更新
建议停止；相同行数的并发修改仍须真实数据集验收。复合主键表选用户范围内的排序列。
前端导出前补齐 exercise 活跃会话同步；只接受有 paginationVerified 标记的后端完整结果，
旧函数走当前登录用户 RLS 分页查询，任何缺表/权限错误均不宣称完整。

本次仅本地修改及 Deno 类型/分页模拟测试，未部署函数、迁移或读取真实私密记录。
待获后端部署授权后选择性部署 export-user-data，再用测试账号核对大于单页记录量、
带饮食照片、空账号和失败场景。TAR 长路径和 iOS 原生文件分享的修复见当前交接。

# 小猫衣橱共享积分与多饰品穿戴偏好（2026-10-13）

追加目录迁移`202610130003_expand_mascot_wardrobe_catalog.sql`只向服务端商品目录新增40项：
13套皮肤、14件饰品和13个背景，与原有可见条目合计后每类均为17项。旧的
`accessory-none`仅作为滚动兼容哨兵保留，不作为前端商品显示。迁移已在用户对同一衣橱后端的
明确授权下选择性应用并登记；远端只读计数为皮肤17、可见饰品17、背景17，schema lint零错误，
且历史待定`202609270001`仍未应用。迁移不创建账号解锁、不改变穿戴偏好、不消费积分。

追加迁移`202610130002_mascot_wardrobe_multi_accessories.sql`为偏好表增加`accessory_ids`数组；旧
`accessory_id`继续同步第一件饰品，确保滚动发布和旧客户端兼容。迁移把既有非“不佩戴”的单饰品
偏好无损迁入数组，不创建解锁、不扣积分、不修改皮肤或背景。新RPC
`nava_select_mascot_wardrobe_look`一次接收皮肤、最多12件去重饰品和背景，逐项验证目录类别与当前
账号的免费／已解锁资格后，在同一事务保存整套穿戴并写最小化事件。状态RPC同时返回新
`accessoryIds`和兼容`accessoryId`。前端不再把“不佩戴”作为商品选项；空数组就是不穿饰品。

用户先前对本衣橱迁移的明确授权覆盖本次同一功能修订；`202610130002`已通过canonical linked
Management API选择性应用并登记。远端只读读回`accessory_ids`为ARRAY、新整套穿戴RPC存在、迁移
记录存在，且`202609270001`仍未应用；linked schema lint零错误。应用与核验没有读取账号私密行、
修改用户穿戴、创建解锁或消费积分。

迁移`202610130001_mascot_wardrobe.sql`为小猫衣橱增加公开可读的
`mascot_wardrobe_items`目录，以及只允许账号本人读取的`user_mascot_wardrobe_unlocks`解锁账本和
`user_mascot_wardrobe_preferences`当前穿戴偏好。三类条目分别是皮肤、饰品和背景；免费默认项不写
伪造消费，付费项通过`nava_unlock_mascot_wardrobe_item`原子解锁。

- `nava_mascot_wardrobe_state`一次返回目录、已拥有条目、当前选择和共享积分余额；
- `nava_select_mascot_wardrobe_item`只允许选择免费或已解锁的同类条目；
- `nava_unlock_mascot_wardrobe_item`用账号级事务锁、`user_id + item_id`和
  `user_id + idempotency_key`唯一约束防重复扣分，并记录最小化审计事件；
- `nava_reward_points_balance`继续是唯一共享额度，新增扣除衣橱解锁消费；
- 账号删除依靠两张账号表到`auth.users`的级联外键，账号导出schema 1.4.0同时覆盖两张表。

用户明确授权后，只应用并登记`202610130001`；历史未授权的`202609270001`仍未应用。远端只读核验
返回12项目录、两张账号表和三个RPC均存在，数据库lint零错误。`export-user-data`的schema 1.4.0
已部署为ACTIVE v28并保持JWT校验。没有创建用户解锁、改变穿戴偏好或消费真实积分。

# 商品管理双语字段与三态目录（2026-09-28，已上线）

用户已单独授权并应用 `202609280002_admin_product_catalog.sql`，同一事务记录迁移历史。
未应用 `202609270001`；`202610090001`已于2026-10-09选择性应用，`security-contact-otp`已部署为
ACTIVE v1/JWT。既有2个账号、5条积分账本、4笔订单、
4件商品均保留；没有借测试删除商品、创建订单、群发通知或改变管理员身份。

- `nava_admin_list_reward_products_v2` / `nava_admin_save_reward_product_v2` 返回和验证中英名称、
  品牌、说明、slug、整数积分价格/库存、最多6张HTTPS图片与 listing_status；每次保存仍需
  服务端管理员身份并写审计。新编辑页要求中英文成对填写；旧商品空翻译保留并回退中文，
  不自动编造品牌或翻译。普通用户不能读库存数或直接写商品表。
- 状态为 `published`、`unpublished`、`upcoming`。`published`布尔值兼容原客户端，只控制
  可见性；upcoming可见但不能购买。购物车与订单明细写入触发器共同校验可购买状态并锁行，
  包括旧购物车/旧客户端；拒绝会回滚整笔结算，不扣积分、不消耗库存。
- `nava_admin_archive_reward_product` 为可恢复删除（deleted_at），重复调用不重复审计；
  商品从新旧管理列表及公开目录消失，历史订单快照/图片保留。前端提供显式删除确认。
  旧购物车里的已下架/删除项显示为不可购买的通用条目并允许移除，不读取私有商品详情，
  避免隐藏的失效条目永久阻挡结算。
- `admin:db:test` 在隔离PostgreSQL执行权限、双语、状态、结算回滚、最后库存、归档与审计。
  生产只读RPC/表合同探测和数据库lint通过；不等同于真实用户购物或物理iPhone验收。

前端同一源码 `4073842eb29d225167f06908a2f5b2570aa036fe` 已发布到Sites v184和GitHub Pages。
两站公开登录门、canonical项目与编译资源哈希已核验；生产现有商品的英文和品牌未代填。

# 积分卡共享额度与卡面解锁（2026-09-28，已上线）

卡片只是账号积分的视觉入口，不是多个钱包。三张默认卡免费；额外卡面通过
`nava_unlock_reward_card_skin` 原子解锁，每张固定10 XP，并复用账号总积分余额。迁移
`202609280001_reward_card_skins.sql` 新增服务端卡面目录、账号解锁账本和当前卡偏好；
`nava_reward_points_balance` 统一计算“成长账本收入 - 已确认商品订单 - 卡片解锁消费”。
账号级事务锁、`user_id + skin_id` 与 `user_id + idempotency_key` 两个唯一约束防止重复扣分。
`nava_select_reward_card_skin` 只保存已免费或已解锁卡面，切卡不改变积分。

账号数据导出已把 `user_reward_card_unlocks` 与 `user_reward_card_preferences` 纳入完整性合同。
本地 PGlite PostgreSQL 实际执行通过。2026-09-28 获明确授权后，`202609280001` 已作为独立
事务应用到 canonical Supabase；另一条未授权的 `202609270001` 未被夹带。远端表和 RPC 已
读回确认，`export-user-data` 已单独部署为 ACTIVE v26。

依赖这些 RPC 的前端已由同一源码 `5b582b3c8cd066f99b63313cb12ff33c751bbc09` 发布为
ChatGPT Sites v178 和 GitHub Pages v178；公开核验只读取入口、来源回执与构建资源，未替
用户创建真实解锁、订单或积分消费。

# 管理员权限、商品发布与通知群发（2026-09-27，当前）

管理员身份现在由 canonical Supabase 的 `nava_user_roles` 服务端表决定，不读取前端参数、
邮箱白名单或可由用户修改的 profile 字段。迁移 `202609260001_admin_console.sql` 已应用：
迁移当时现有的2个开发账号均设为 `admin`；之后新注册账号由 `auth.users` 触发器默认写入
`member`，不会自动获得管理权限。`nava_is_admin()`、商品写 RPC 和通知发布 RPC 均为
锁定 `search_path` 的 `SECURITY DEFINER`，普通账号即使直接调用接口也会被拒绝。

管理员端当前有三项服务端能力：

- `nava_admin_save_reward_product` 校验 slug、名称、积分价格、库存、最多6张 HTTPS 图片及
  上架状态；普通商城读取仍只能看到 `published=true`。商品图片上传到公开只读的
  `reward-products` bucket，写入/修改/删除策略只允许管理员。
- `nava_admin_publish_notification` 为每个当前 Auth 账号创建同一批次的 `user_notifications`
  收件箱记录，并写 `admin_notification_batches` 和 `admin_audit_log`。`admin-notification-publish`
  v2 不接受前端选择派发方式，而是根据服务端远程推送能力自动决定是否继续调用内部
  `push-dispatch`；浏览器不能获得 service-role、派发 secret 或 APNs key。
- `nava_admin_list_accounts` 按邮箱或内部手机号别名返回最小化账号摘要，
  `nava_admin_set_account_role` 负责 member/admin 升降级并写审计。迁移
  `202609270002_admin_role_management.sql` 至 `202609270004_admin_role_lint_cleanup.sql`
  已应用；调用者必须是管理员，禁止自降级、禁止移除最后一名管理员，并用事务锁阻止两个
  管理员并发互降导致系统失去管理员。

生产只读核验确认2个注册账号对应2条管理员角色，商城图片 bucket、管理表、账号权限 RPC
和未认证 Edge 拒绝边界均正常；本轮未修改真实账号角色，也未群发测试通知。canonical 项目
当前没有远程派发或 APNs provider secret，所以管理员发送会真实写应用内通知，但不会伪称
iPhone 系统推送。管理员前端已由同一源码提交
`a0776643bfce7cf85ba7383f3a5ab13f61c21712` 发布到 ChatGPT Sites v176 与 GitHub Pages；
Pages `source.json` 和两个公开站点的管理员编译产物均已在线核对。

# 开发数据重置与积分重设计（2026-09-27）

用户在九场景发布后明确要求清除 canonical Supabase 的全部注册账号、积分和关联数据，
保留必要变量。这里的“保留变量”落实为保留表/字段/类型、约束、RLS、函数、迁移历史、
Storage bucket 和公共商品配置，不把清库误作 DROP SCHEMA 或删除 Supabase 项目。
服务端模型 Key、SMTP/短信配置和登录方式不修改。

本轮安全重置工具仍为 `scripts/reset-development-accounts.mjs`：默认只读；显式项目确认
参数才删除；新 `--backup-dir` 必须在 NAVA TestRuns 内且不得覆盖既有备份。数据库记录与
Auth identities 用同一查询快照导出，再经 Windows CurrentUser DPAPI 加密和解密校验。
删除前重新比对账号集合、逐表内容和配置指纹；未知业务表/Storage 对象会阻止删除。
只使用 Storage API 和 Auth Admin deleteUser，账号表按既有外键级联删除。
安全摘要/旧OTP表单独备份与清空；不重新创建账号，不写测试健康数据。

已执行结果：1个账号、4条积分、其余账号关联数据及11条账号检查摘要删除；48张账号
关联表均为0，账号/私有文件/安全摘要无残留，结构及配置指纹一致。恢复资料为
`Q:/NAVA-Workspace/Build/TestRuns/account-reset-20260927`，未覆盖上次备份；DPAPI解密
校验通过，实际回灌未做，恢复需要管理员及同一Windows用户。需要重新注册登录。

## 新积分规则草案（等待用户选择，不是已上线规则）

推荐方案把积分定义为“完成记录的奖励”，而不是身体好坏、AI评分或使用时长的奖励：

1. 情绪、睡眠、运动、饮食、专注、面部各10分/天，六项合计最多60分/天。
   当天第一条通过现有字段验证并由用户确认保存的记录才奖励；早餐/午餐/晚餐共享饮食项。
   不要求记录结果更“健康”，也不要求用户同意AI分析才能获得记录奖励。
2. 取消登录、资料完善、分享、普通AI聊天、素颜加成及普通待办的额外积分。专注和运动仍需
   真实有效时长，但不额外要求旧20/25分钟奖励门槛；若用户选择保留旧分值，则继续原门槛。
3. 以 `user_id + reward_day + module` 为数据库唯一约束；规则版本仅作审计字段，不进入
   去重键，因此升级规则不能再给同一天同模块补一份。客户端不得传奖励数量或领取次数。
4. 奖励日由服务端时钟和账号保存的IANA时区计算。首次固定账号奖励时区；后续时区调整
   不回改已发账本，也不能在两个时区之间反复切换领取。补填历史或未来日期保存记录但不
   发当日奖励，不把记录日期当作任意可领取日期。
5. 记录与首次奖励在同一个数据库事务内提交。超时重试、并发双击、多设备同时保存只命中
   一条账本。修改和删除重录不重新发奖；删除记录保留奖励去重凭据，不级联删积分。
6. Great Job 只是保存成功的反馈；播放、刷新、Continue 和回顾没有发奖能力。重复保存
   可以继续庆祝，但没有第二份积分；分数只在积分页显示，前端不得靠展示次数自行加分。
7. 前端积分页必须读云端账本结果，不能用“当前记录还在不在”推算已领状态。累计获得与
   商城可用余额区分；保留既有订单扣款/库存锁合同，余额=获得积分-已确认兑换。
8. 服务端保存 `reward_day`、`module`、`points`、`rule_version`、`source_record_id`、
   `awarded_at`、`timezone`，读账本受RLS限制。规则配置只允许服务器/管理员改。

切换方案必须同时更新服务端所有旧领取入口及积分页任务清单，避免旧客户端仍从登录、
分享或旧记录表额外领分。不得先部署会双重计分的半套合同；旧待应用迁移
`202609270001_journal_growth_rewards.sql` 当前继续保持未应用，等待新规则选择后以追加
迁移替换合同，不修改已应用迁移。

验收应覆盖：首次保存、重复/编辑/删后重录、多连接并发、跨账号、跨午夜、DST/换时区、
历史补录、非法字段、原子回滚、旧接口旁路、商城扣款/重试，以及真实登录后积分页回读。
物理 iPhone 和旧相机回归问题不属于清库验收，不因数据库重置而自动视为完成。

# 六模块静默积分增补（旧兼容方案，尚未应用）

本轮新迁移 `202609270001_journal_growth_rewards.sql` 待用户批准后才部署；既有账本、
账号、记录、历史积分都保留。新增 v2 RPC，避免滚动发布改变旧 RPC 的参数合同：

- `nava_growth_local_date` 是不对客户端授权的内部帮助函数，校验 IANA 时区，用服务端
  now() 算当天，不信任客户端任意日期；其他RPC只用 auth.uid() 确定账号。
- `nava_reconcile_growth_rewards_v2` 将旧表和 journal_entries 映射到同一成长奖励键。
  保持所有原分值、运动单条20分钟/3000步及专注累计25分钟门槛；文字面部记录不冒认素颜加成。
- `nava_save_journal_entry_v2` 包装原版本检查/幂等保存并在同一事务核对积分；先取账号级
  advisory锁再保存，避免并发专注累计遗漏。唯一账本约束确保重复保存、更新、删除重录都不会
  重复奖励。积分写失败会回滚该次记录，不返回假成功。
- `nava_record_growth_activity_v2` 保持登录/分享/AI对话的旧分值，同样按设备时区日期幂等。
- 完成画面、刷新和 Continue 均不能产生奖励。前端 Journal 不再排队第二层积分庆祝。
  `growthRewardRpc.ts` 仅对 PGRST202 缺少新RPC作旧版本兼容，不隐藏权限/网络/数据库错误。
  迁移应用前仍然是旧积分合同，不能保证新六模块已参与线上奖励。

`node scripts/verify-journal-rewards.mjs` 在独立、内存中的 PGlite PostgreSQL 实际执行旧
Journal迁移和新RPC，23项检查通过；旧表为精简测试schema，未测试生产数据或多连接并发。
工具默认位于 `Q:/NAVA-Workspace/Tools/reward-db-check`，不写生产项目。

# 当前四页记录合同（2026-09-23）

六模块的新流程使用 `journal_entries`，按 `user_id / record_date / category / id`
保存每次用户确认的记录；类别为 mood、food、focus、sport、sleep、face。字段保留
文字、每餐独立营养和跨日睡眠时间，不把情绪文字/面部观察映射成旧数值评分。
`save_journal_entry` 由服务器确定账号和时间戳，创建幂等，修改要求版本匹配；普通
账号不可绕过 RPC 直接写表。RLS 限定读取/删除当前账号的数据。`journal_preferences`
保存目标与暂停专注恢复信息；`journal_ai_runs` 由后端保存模型来源与实际输出。

已应用迁移：202609230001_journal_workflow、202609230002_journal_mutation_grants、
202609230003_account_delete_recompute_guard（账号级联删除时不再重建引用该账号的计算队列）。
已部署 `journal-assistant`：真实 JWT 与个性化 AI 授权校验、共享原子限流、大小限制，
服务端固定提供方与安全约束。所有文字使用 DeepSeek Chat 非思考模式（当前官方模型
ID `deepseek-flash`），只有饮食/面部照片调用百炼 `qwen3-vl-plus`。沿用 Supabase
现有服务端 secrets，不向前端传 Key，不支持任意上游 URL。返回只含正文，不含推理。
照片经现有本机编码去除 EXIF 后用于本次视觉请求，不在记录表/AI审计表保存原图。
JSON 字段校验和有限修复继续使用 v16 的可编辑确认合同；AI 成功不等于保存成功。

新表参与首页卡片、六模块完成状态、月历/年度记录覆盖；旧 ChronoState/健康报告
仍是旧评分数据合同，不能据新文字条目生成假分数。剩余页面的算法与展示改版按用户
下一阶段需求处理。原生照片、听写和常亮经父页面已有 Capacitor 桥；Windows 验收
不等于 Xcode 编译、签名或真实 iPhone 权限验收。

官方接口依据：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。
四页来源/边界见 `web-upstream-contract.md`；执行证据在
`Q:\NAVA-Workspace\Build\TestRuns\journal-integration`。

2026-09-23 追加接入 v17 首次使用“初见手记”，没有新增数据库迁移或 Edge Function。
正式账号首次登录和个人页回看均由 React 父页托管 `public/journal/onboarding.html`；
父页将七项受控选项映射回既有 `profiles` 字段（occupation、age_group、
exercise_frequency、sleep_schedule、diet_preference 等），并把完整 v17 语义资料保存到
`profiles.onboarding_answers.firstNotesProfile`。该资料仅包含语言、性别/角色/年龄段、
兴趣、睡眠、运动、饮食偏好和完成时间，不包含照片、音频、API Key、每日记录、评分或
AI 摘要。保存失败不会伪造完成标记；本地草稿只用于同浏览器恢复。

用户批准的开发库清理已执行：5个既有登录账号、48张账号关联表中的对应数据、23个
私有文件均已清除；完成后账号/新记录/AI运行表为0，验收临时账号均已删除。原登录账号
已失效，需要重新注册。恢复证据为同一Windows用户DPAPI加密的逐表/私有文件备份，位于
上述TestRuns的`account-reset`，不要删除该目录，也不要把解密数据放入仓库。

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
| `security-contact-otp` | 发送并验证备用邮箱8位OTP或备用手机号6位OTP；验证成功后仅更新当前用户的备用联系方式 | `nava_security_contact_otp_challenges`与Auth user metadata（ACTIVE v1/JWT；真实送达待人工验收） |
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

当前源码共有 31 个 append-only migration，目录 `supabase/migrations` 是唯一文件清单
来源。2026-09-20经用户明确批准追加提醒方式和类型扩展，既有开关/时间和健康记录不变。
它们按顺序覆盖：移动端业务表和 Edge 后端、Rhythm/Fusion/ChronoState、
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
- `notification_preferences` 只保存当前用户的提醒类型、是否启用、智能/固定方式、本地时间、时区和
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
supabase secrets set DEEPSEEK_API_KEY_NAVA="..." --project-ref $env:SUPABASE_PROJECT_REF
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
