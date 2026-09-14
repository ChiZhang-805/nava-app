# NAVA 当前完整交接（新任务唯一入口）

更新时间：**2026-09-13**

这份文件是新 Codex 任务接手 NAVA 时的第一入口，也是当前项目状态的
**独立、可直接使用的交接文档**。它不依赖这段很长、曾多次出现界面回退的
聊天记录。新任务必须以代码、数据库边界和本文件为准，不要根据旧聊天画面
推断进度。

## 0. 新任务先做什么

开始任何工作前，按下面顺序执行：

1. 阅读仓库根目录的 [`AGENTS.md`](../AGENTS.md)。其中的仓库边界、真实数据、
   视觉验收、双站发布和安全要求高于历史交接。
2. 阅读 [`INDEX.md`](./INDEX.md)，只使用仍在索引中的当前专项文档。
3. 运行 `git status --short --branch`，确认自己位于
   `Q:\NAVA-Workspace\nava-app`，保留所有既有改动，不得 reset、clean 或覆盖
   用户工作。
4. 完整阅读本文件，然后根据任务类型阅读：
   - 产品语义：`Q:\NAVA-Workspace\产品需求文档-技术对接.md`
   - 认证：[`auth-email-flow.md`](./auth-email-flow.md)
   - 数据与后端：[`app-backend.md`](./app-backend.md) 和
     [`SHARED_SUPABASE_READINESS.md`](./SHARED_SUPABASE_READINESS.md)
   - AI：[`AI_KNOWLEDGE_HARNESS.md`](./AI_KNOWLEDGE_HARNESS.md)
   - Apple Health / Apple Watch：
     [`APPLE_HEALTH_WATCH_DELIVERY.md`](./APPLE_HEALTH_WATCH_DELIVERY.md)
     和
     [`APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md`](./APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md)
5. 阅读与当前任务直接相关的实现、样式、服务、测试及 Edge Function 后再编辑。
6. 页面改动必须在 360x740、375x812、390x844、430x932 四种 CSS 视口分别验收；
   一个尺寸或一张截图不能代表通过。
7. 代码、页面或功能修改在验证后默认发布到两个公开站点；纯文档、只读审计、
   测试证据修改不触发发布。Edge Function、数据库迁移、生产 seed、secret 和
   访问策略仍需用户单独明确授权。

不要从 Git 历史恢复旧的 dated handoff、旧开发队列或一次性审计报告来推断当前
状态；这些文件已经由本交接吸收并从工作树删除。

## 1. 项目是什么

NAVA 是以手机竖屏为主的个人节律与生活状态应用。它把六类日常记录放在一个
统一体验中：

- 情绪
- 睡眠
- 运动
- 饮食
- 专注
- 面部状态

产品的核心不是展示一组演示数字，而是让经过认证的用户记录真实数据，将数据
安全写入同一个 Supabase 账户空间，再由统计、ChronoState、FDNB 与受约束的
AI harness 生成个人化的趋势、报告和建议。NAVA 猫是贯穿首页、AI 助手、报告、
成长反馈和部分空状态的产品角色，但不能用吉祥物或动画掩盖数据缺失、模型失败
或权限失败。

底部五个主入口目前在代码中的内部 tab 名是：

| 位置 | 内部 tab | 用户侧含义 | 主要实现 |
| --- | --- | --- | --- |
| 1 | `today` | 首页 / 今日状态 | `OptionTwoHome.tsx`、`TodayScreen.tsx` |
| 2 | `record` | 健康报告与六模块记录 | `RecordsScreen.tsx`、`RecordModuleDashboard.tsx` |
| 3 | `ai` | NAVA AI 助手 | `AIScreen.tsx` |
| 4 | `trends` | 成长任务与积分进度 | `GrowthTasksScreen.tsx` |
| 5 | `profile` | 个人资料、隐私与账户 | `ProfileScreen.tsx`、`AdvancedProfileScreen.tsx` |

`trends` 是历史内部命名，不代表现在仍是一个纯趋势页。不要仅凭变量名改变产品
文案或导航含义。

## 2. 仓库、公开版本和唯一后端

### 2.1 目录所有权

- 唯一可编辑源仓库：`Q:\NAVA-Workspace\nava-app`
- GitHub Pages 生成镜像：`Q:\NAVA-Workspace\nava-app-preview`
- Sites 包：`Q:\NAVA-Workspace\Build\Sites\Packages`
- 跨项目测试证据：`Q:\NAVA-Workspace\Build\TestRuns`

禁止在 `nava-app-preview` 里开发，也禁止把它的编译产物复制回源仓库。

### 2.2 当前公开发布锚点

截至本文件写入前，公开 APP 的最新功能源码为：

- 源码发布 commit：`73e0b72f80ff31a0e3057bca319bd25437941d87`
- ChatGPT Sites 项目：`appgprj_6a5de710811c8191af8ce2681358d518`
- ChatGPT Sites 版本：v133，public
- Sites version ID：
  `appgprj_6a5de710811c8191af8ce2681358d518~appgver_c1182c384d088191bce70b5f33e4aa58`
- Sites deployment ID：`appgdep_6aa69fd7e6e48191bc77f54aa4c99005`
- ChatGPT Sites：
  `https://nava-app-preview-cz.chizhang1031.chatgpt.site`
- GitHub Pages 镜像 commit：
  `37f71f783ea63a1472aa885bec0b6128d0e62ee1`
- GitHub Pages：`https://chizhang-805.github.io/nava-app-preview/`
- v133 Sites 包：
  `Q:\NAVA-Workspace\Build\Sites\Packages\nava-sites-v133.tar.gz`

GitHub Pages 镜像的 `source.json` 已记录 v133 和上述功能源码 commit。两个站点应当
始终由同一个干净且已 push 的源 commit 构建；只更新其中一个站点不算发布完成。

### 2.3 Canonical Supabase

两个公开站点以及未来 iOS/watchOS 客户端共享唯一 Supabase 项目：

- project ref：`wxteapvwagvhhtrjrbim`

公开构建必须使用真实 Supabase Auth；`?demo=1` 只能在本地 review 环境使用，
不得绕过公开站点登录。前端只能持有 publishable/anon 能力，service-role、模型
密钥、短信/SMTP 密钥等永远只能留在服务端或安全配置中。

## 3. 当前代码架构

### 3.1 Web / Capacitor 壳

- React 18 + TypeScript + Vite。
- `src/App.tsx` 维护主 tab、hash 路由、返回栈、懒加载、底部导航、工具菜单、
  Watch/Health 刷新和奖励反馈。
- `src/styles.css` 是当前主要视觉实现，包含大量针对不同宽高、键盘高度、安全区、
  固定导航与单屏编辑器的精细规则。不要为了“简化 CSS”批量删除媒体查询。
- `capacitor.config.ts` 当前 appId 是 `health.nava.mobile`，webDir 为 `dist`。
- `ios/App` 是已有 Capacitor iOS 工程；不是待创建的空壳。
- `native/ios` 包含 HealthKit、后台观察、Watch bridge、secure storage、speech 等
  原生插件实现。
- `native/watch` 包含真正的 SwiftUI Watch app、WatchConnectivity、节律首页、
  情绪快捷记录与专注计时。
- `ios/App/App.xcodeproj/project.pbxproj` 已嵌入 `NAVA Watch` target，bundle ID 使用
  `$(NAVA_APP_BUNDLE_ID).watchkitapp`。

### 3.2 页面和组件

主要页面：

- `src/features/OptionTwoHome.tsx`：当前首页视觉与六模块入口。
- `src/features/HomeWidgetEditor.tsx`：0–6 个首页健康组件的选择、三列排序与退出保护。
- `src/features/HomeCalendarExperience.tsx`：日历及日状态。
- `src/features/RecordsScreen.tsx`：健康报告、六模块卡片和六类编辑器。
- `src/features/RecordModuleDashboard.tsx`：模块完成后的真实数据详情、历史/报告。
- `src/features/AIScreen.tsx`：文本、结构化确认、语音/图片相关 AI 交互。
- `src/features/GrowthTasksScreen.tsx`：成长任务、积分与奖励入口。
- `src/features/ProfileScreen.tsx`：账户、隐私、连接、导出/删除等。
- `src/features/AdvancedProfileScreen.tsx`：详细资料、头像、AI/数据偏好。
- `src/features/AuthScreen.tsx`、`PasswordRecoveryScreen.tsx`、
  `OnboardingScreen.tsx`：认证与首次进入流程。

复用组件：

- `PageSkeleton.tsx`：按目标页面设计的骨架屏，不是统一全屏 loading。
- `WeeklyRadarChart.tsx`、`BarLineTrendChart.tsx`、`LineTrendChart.tsx`：报告图表。
- `ModuleProgressRing.tsx`：首页和记录页六模块完成度环。
- `LivingBackground.tsx` 与 `livingBackgroundRenderer.ts`：动态冰蓝背景。
- `MascotMotionSlot.tsx`、`InteractiveMascot.tsx`：NAVA 猫动画/状态。
- `RewardCelebration.tsx`：确认保存后的成长奖励反馈。
- `UtilityDrawer.tsx`：待办、积分等侧边入口。

### 3.3 服务层

服务不是单纯 mock 适配器。重要文件包括：

- `auth.ts`、`authStorage.ts`：Supabase 身份和当前 tab 会话存储。
- `records.ts`：六模块记录读取、保存、日快照、趋势 bundle。
- `singleRequestCache.ts`：同一窗口内的读请求合并与缓存失效。
- `health.ts`、`watch.ts`：原生 HealthKit、云端同步、Realtime 完成事件和 Watch
  action 队列。
- `healthReport.ts`、`dietReport.ts`、`weeklyModuleScores.ts`：真实报告数据与 AI 报告。
- `ai.ts`、`structuredEntry.ts`、`structuredEntryParser.ts`、`aiProcessing.ts`：AI
  调用、结构化记录确认和产品化处理状态。
- `consent.ts`：授权边界，不能被页面快捷逻辑绕过。
- `secureFaceDraft.ts`：AES-GCM + IndexedDB 的短期面部草稿恢复。
- `homeWidgets.ts`：账号云端首页组件偏好、本地离线缓存、统一默认组合、真实日值和近七日比较。
- `userCloudState.ts`：语言/AI 语音/首页组件偏好、AI 会话归档和进行中专注/睡眠会话的云端读写。
- `sessionMaintenance.ts`：可跨设备恢复的睡眠进行中会话及结束后的可编辑字段映射。
- `productivity.ts`、`growthProgressPresentation.ts`、`rewardPresentation.ts`：任务、
  积分、奖励与已确认保存后的反馈。
- `date.ts`、`useDeviceDate.ts`：设备本地日期和跨日刷新，禁止重新写死演示日期。
- `loadingRoute.ts`：根据真正目的页选择首页、详情或六种记录编辑器骨架。

## 4. 真实数据与安全不变量

以下不是建议，而是继续开发时不可破坏的产品合同：

1. UI 数字、完成状态、图表、摘要和报告必须来自当前认证用户的实际持久化数据，
   或明确标注为估算。不能用固定文案、随机数或演示对象伪装成功。
2. 无记录不等于零分。历史平均只除以有记录的天数；整个期间完全无记录时才使用
   规定的空状态。
3. 所有日期页使用设备当前本地日期，并在跨日时自动刷新。
4. 客户端通过 Supabase JWT 访问后端；不同用户依赖 RLS 隔离。不得在客户端加入
   shared ingest key 或 service-role。
5. 面部和饮食照片放在私有 bucket，展示使用短时 signed URL；头像复用已有
   `profile-avatars` 用户路径策略。
6. 健康和面部输出必须保持非诊断、带不确定性与来源边界。某个紧凑卡片删除一行
   重复免责声明，不代表可以删除全产品的安全合同。
7. AI 只能读取用户已经认证并明确授权的上下文。
8. 模型、网络或解析失败必须显示可理解的失败/重试状态，不能回落成一段看似成功
   的固定“AI 建议”。
9. 只有用户确认记录成功后，才能出现积分/成长奖励；AI 预览或识别草稿不能提前
   发奖励。
10. 浏览器登录有意使用 `sessionStorage` 按 tab 隔离。不要未经产品和安全决策改成
    跨浏览器长期持久化。

### 2026-09-07 数据事实源复核结论

- 六模块页面、首页组件、日历、分项详情和周报从认证用户的 Supabase 行构建；正式站点
  不能启用 `?demo=1`。生产表统计确认六模块、健康快照、节律分和 AI 报告已有持久化行，
  但未使用用户账号逐条读取隐私内容。
- 周报零真实点才显示占位；一个真实点也会替换占位并进入曲线。雷达缺失维度显示 `--`，
  不再画成 0 分；无睡眠/节律数据的生物钟同步也显示 `--`。
- 当日报告完整度复用六模块完成标准；首页专注近七日比较会先按天汇总多个 session，
  不再把每条 session 的均值误当成当日总分钟。
- 云端记录草稿已补齐睡眠阶段/时长与运动心率/血氧恢复。AI 健康和饮食报告继续持久化，
  保存后由服务端源指纹判断是否重算，相同输入不重复消耗模型调用。
- `watch-sync` 生产 v13 已上线：Watch 本地日期、时区和专注起止时间进入规范化写入链路；
  原生动作仅在 Supabase 接受后确认，专注完成使用稳定 action id 和数据库原子 RPC，快捷
  情绪不会覆盖用户已有日记。最终数值一致性仍需 Mac/Xcode/iPhone/Watch 真机验收。
- 扩展后的生产探针覆盖页面实际依赖的完整字段，并纳入健康/饮食 AI Function；本轮复核
  结果为 APP/CLI/Web target、Auth、核心表、扩展表、Functions 和 Storage 全部 READY。

Supabase 当前重要表、bucket、迁移和 Edge Function 以
[`app-backend.md`](./app-backend.md) 为准。迁移是 append-only，绝不能修改一个
已应用迁移来“修正”生产库。

## 5. 认证状态

已经实现的主合同：

- 邮箱注册/登录走 Supabase Auth，邮箱验证码为 8 位。
- 中国大陆手机号走服务端 Aliyun SMS，验证码为 6 位；手机号 alias 最终收敛到
  同一 Supabase 身份模型。
- 浏览器会话按当前 tab 存储；iOS 原生安全会话使用 Keychain 的仅本设备策略。
- 公开站点没有生产 demo 绕过。
- v92 修复了真实登录时的“提交后先变处理中，随后闪回一个空邮箱/空密码的处理中
  表单，再进入首页”问题：提交时的 AuthScreen 实例会一直保留到认证目的页和
  onboarding 决策均就绪，再一次性切换。
- v84 修复了 Sites 把主入口内联后可能重复加载 React/AuthContext 的问题；
  `scripts/prepare-sites-build.mjs` 故意保持入口模块外置并统一 lazy chunk URL 身份。
  不要把入口重新内联。

仍需运营/人工确认的认证事项：

- 正式发信域名、SMTP、SPF、DKIM、DMARC 的生产配置和外部邮箱送达率。
- 手机号短信模板、签名、地域限制和真实设备送达率。
- 生产 migration 历史已经包含密码复用保护 RPC；后续改动仍需以真实认证用户验证
  “禁止复用当前密码”的完整页面与服务端流程。

任何账户审计都要使用已有 secure script，不得在终端输出密码、access token、
OTP、service-role 或私有记录。本交接也不得保存用户曾在聊天里提供的密码。

## 6. 六模块当前交互合同

首页和健康报告页的六个模块入口共享选中日期的真实日快照。点击后的目的页不是
固定的：

- 未开始或部分完成：进入对应的记录编辑器。
- 达到当天完成标准：进入真实数据详情页。
- 详情页仍提供进入历史和继续修改当天记录的路径。

进度环紧贴六个圆形按钮外缘，以绿色动画表示真实完成比例。首页圆盘每次展开时，非零
进度从按钮正上方沿顺时针方向绘制；达到当天完成标准后先转满一圈，再把蓝底模块图标
过渡为绿底白色对勾。未开始仍保持原蓝底模块图标，不用假进度填充：

| 模块 | 当日完成判定 | 部分进度 |
| --- | --- | --- |
| 情绪 | 情绪分数、原因/标签与日记满足保存合同 | 保存前保持未完成 |
| 睡眠 | 当天存在有效睡眠记录 | 无有效记录时未完成 |
| 运动 | 当天存在有效运动记录 | 无有效记录时未完成 |
| 饮食 | 早餐、午餐、晚餐、加餐四餐均有记录 | 按 0/4、1/4、2/4、3/4、4/4 |
| 专注 | 至少一个计时会话真实结束且时长大于 0 | 创建任务或开始计时不算完成 |
| 面部 | 当天分析成功并保存真实记录 | 仅选照片或分析中不算完成 |

### 6.1 情绪

- 一屏式记录页。
- 情绪滑杆、影响因素、日记与保存组成同一卡片。
- 日记区域根据可用高度吸收空间，使卡片底部接近固定导航但保留呼吸距离。
- 不同屏高不能简单使用同一个固定 textarea 高度；键盘高度代理也要验收。
- AI 反馈必须基于真实保存内容和授权上下文。

### 6.2 睡眠

- 一屏式记录页。
- 早睡、标准、晚睡采用与标题水平对齐的三个紧凑圆形图标快捷操作，而不是三块
  大文字按钮。
- 入睡、醒来、总分钟、深睡、浅睡、REM、自评和备注保留真实字段语义。
- 备注吸收快捷操作收紧后释放的空间；保存按钮需要留在卡片边界内，并和底部导航
  保持安全间距。
- “睡眠维持”原文只有栏目名，当前按 2026-09-06 最新口径实现：入口只显示标题与“从
  入睡开始，到醒来后填入记录”，按钮为“开始记录”；开始后离开或刷新页面仍可继续，
  同账号云端也可恢复。结束只填入起止时间和总时长，绝不估算深睡/浅睡/REM；只有用户
  确认后才保存，放弃只清除未保存会话。

### 6.3 运动

- 记录步骤、热量、运动分钟、心率、血氧、自评等实际字段。
- HealthKit 同步的数据和手工记录必须遵守合并/来源规则，不得用缺失值覆盖已有值。
- 图表的健康样本成功状态只在实际 `sample_count > 0` 时成立。

### 6.4 饮食

- 饮食页可以滚动，不强求一屏，因为照片及识别结果高度会变化。
- 鸡蛋、米饭、牛奶、苹果是标题行右侧的四个紧凑图标快捷项。
- 拍照/相册上传后由真实 `diet-extract` 分析，结果仍是可编辑草稿；用户确认后才
  保存。
- 食物输入支持自适应多行。结构化识别出的多道菜按一道菜一项保存，不把沙拉中
  看见的每个原料误拆成独立菜；复合菜可写成“沙拉（可见原料……）”。
- 识别项在数据层继续保持结构化，不能为了展示把数组永久压成一条字符串。

### 6.5 专注

- 一屏式准备页，保留正计时/倒计时两个模式图标。
- 2026-09-06 最新要求覆盖此前删除预设的决定：倒计时使用 25/45/60 分钟及“自定义”
  下拉项；选择“自定义”后才显示分钟输入。
- 正计时只要求任务和备注；倒计时增加分钟。
- 备注是帮助用户规划的私有说明，主要列表只展示任务，不把备注当标题。
- 主操作是“开始专注”。开始后进入沉浸计时页，底部导航隐藏。
- 只有用户结束真实计时，才写入有效 focus session；开始后未结束不能伪造完成。
- Watch 端也能开始/停止专注，并通过幂等 action queue 与手机汇合。

### 6.6 面部

- 一屏式入口，面部拍摄框占主要空间。
- 素颜/带妆是标题右侧的两个紧凑图标模式按钮，替代大文字 tabs。
- 无需在此页重复显示“真实状态最好”指导或再次勾选上传同意；授权在进入产品流程
  前完成，后端仍必须校验有效 consent。
- 支持前置摄像头和相册重选。
- “面部维持”原文没有交互定义。2026-09-06 最新口径取消正常页面的稳定条件块和强制
  门槛，拍摄/相册始终可用；三点菜单新增“条件检验”，真实视觉模型返回光线、居中、
  自然表情三项判断，用户可以手工改选，未满足也不阻止分析；结果仍是非诊断。
- 分析完成后显示来自真实分析反馈/annotations 的 AI 状态评价，最多四条适合卡片
  的语义句；不能用空状态固定文案冒充分析结果。
- 猫图 `src/assets/mascot/nava-face-insight-v2.webp` 的尺寸应与其他 AI 评价卡片
  的角色比例一致，文字不能被猫遮挡或截断。
- 相片分析草稿用 AES-GCM 加密保存到 IndexedDB，解密 key 只在当前 tab session，
  恢复窗口约 30 分钟。

## 7. 健康报告、图表和摘要合同

### 7.1 分项报告六卡

六张小卡空间非常有限，但必须始终保留完整四行：

- 无记录：显示各模块自己的固定四句词典，不使用统一的“暂无记录 / 点击补录 /
  补录后生成摘要 / 缺失不按零分”工程占位词。
- 有记录：显示 AI 独立生成的四行紧凑摘要。
- 中文紧凑摘要每行必须恰好 7 个汉字，不含空格、数字、拉丁字母或标点。
- 普通详情摘要与七字卡片摘要是同一次报告合同中的两套不同输出；不能把长摘要
  在前端机械截断成七字文案。
- 旧缓存没有 compact 字段时，前端只允许从该用户真实数据安全派生兼容内容，不能
  补固定成功话术。

### 7.2 周报

- 周报以自然周为单位，选周、前后周、数据完整度和较上周均来自真实日期范围。
- 雷达图和节律轨迹共用同一个模块高度；即使轨迹没有真实数据，切换时卡片也不能
  跳高或塌缩。
- 稀疏周的七日柱形占位保留日期轴和合理的视觉节奏，但不冒充真实分数。
- 柱高映射规则：该组最大值到有效绘图区最高处，最小值仍有可见最小高度，其余按
  比例分布；起始横线与柱底重合，不能切入柱体中间。
- 雷达图底部“专注 + 数值”已单独下移，避免与多边形过近。
- AI 周报解读不是一段固定示例。详情行可打开更长解释，解释需要引用实际证据、
  给出行动项和置信/不确定性，并保持非因果、非诊断措辞。
- 有数据不足门槛时必须诚实显示不足。周报告的跨模块 AI 关联至少需要 5 个记录日，
  不使用稀疏数据制造强结论。
- 成功报告在当前 APP 运行期间按“认证用户 + scope + 周期 + 语言 + 相关数据修订指纹”
  复用，不因页面来回切换而再次请求；HealthKit/Watch/Realtime 或页面刷新带来相关
  记录/授权画像变化时，本地指纹随之变化，保存真实记录的既有 `refresh: true` 路径也
  会清除此结果并重算。跨
  重载和设备仍以服务端 source fingerprint 为准：指纹与模型版本都不变时返回
  `ai_health_reports` 持久化缓存，只有授权的记录或画像变化才重新调用模型。

## 8. AI Model + Harness 当前合同

AI 链路的正确结构是：

1. 识别用户意图和涉及领域。
2. 只收集该用户、该日期范围、且经过 consent 授权的上下文。
3. 对自然语言/图片先产生结构化、可编辑的确认卡。
4. 需要时调用受限知识工具，例如 USDA FoodData Central、睡眠/AASM 参考、运动
   compendium、情绪 rubric、面部安全资料或个人资料风格工具。
5. 保存证据摘要、来源、置信度、模型版本和 source fingerprint。
6. 对模型 JSON 做 schema 校验；允许一次有边界的修复，不得无限递归调用。
7. 模型失败就返回可审计失败，不得展示预写的“AI 已完成”文本。
8. 用户确认后保存；奖励在保存成功后出现。

知识工具有调用数量和数据最小化限制，例如营养查询最多 3 次、证据条目最多 8 个；
不能把完整知识库或用户原始私密记录塞进日志。trace 只记录路由、工具、证据摘要、
置信和 fallback，不记录密钥、完整 prompt 或隐藏思维链。

### 8.1 已上线和未上线必须分开说

当前前端支持普通摘要 + 紧凑七字摘要双合同，相关测试存在且已通过。2026-09-09
`ai-health-report`、`ai-diet-report`、`ai-chat-reply` 与 `diet-extract` 最新源码均已部署到
canonical Supabase：

- `ai-health-report`：模型合同
  `deepseek-v4-flash-health-report-v7-retry-resilience`，生产 ACTIVE version 19，
  `verify_jwt=true`；在 65 秒总预算内最多执行三次有界生成/修复，对网络、408、429 和
  provider 5xx 做短退避重试；定向 repair、数字/日期证据边界、HealthKit 快照和完整授权
  画像都进入源指纹，相同输入复用持久化报告，相关输入变化才重算；
- `ai-diet-report`：v6 日历七日窗口、normal + compact、严格校验、一次 repair 和缓存，
  生产 ACTIVE version 15，`verify_jwt=true`；
- `ai-chat-reply`：授权上下文查询失败时不再静默降级，HealthKit 指标和允许画像进入紧凑
  context，生产 ACTIVE version 20，`verify_jwt=true`；
- `diet-extract`：“按菜识别、复合菜描述可见原料” prompt 已上线，生产 ACTIVE version
  17，`verify_jwt=true`。

部署完成仍不等于真实账号闭环：当前没有安全的用户会话去验证生产 provider 首次生成、
成功写缓存、跨重载复用、数据变化后恰好重算一次和实际餐食识别质量，因此这些边界必须
继续写为“已部署、待真实账号验收”。

2026-09-05 对截图所示周报失败做了真实只读诊断：当时生产 Supabase 的
`ai-health-report` 是 version 8 / 模型合同 v3；15:08–15:09 UTC 两次日志均为
“AI 未返回有效的结构化健康报告”，而不是 `DeepSeek 402/429`。生产旧函数确实已有
source fingerprint 与数据库缓存，但因为两次模型结果都未通过 schema/长度/证据/关联
边界中的至少一项，未生成可保存结果，页面再次进入时只能重新请求。旧 repair 也没有
把上一版草稿和失败字段交给模型，是本次确认的代码缺陷。开发机密钥的无用户数据检查
显示余额可用且同一模型名能返回 JSON，但其 digest 与生产 secret 不同，不能据此声称
生产账户具体余额；上述生产日志足以确认截图对应失败发生在模型响应后的结构校验阶段。
2026-09-07 获用户明确授权后完成上述 AI/饮食函数与本轮数据函数部署，并应用三个
append-only migration；没有执行 seed、backfill、账号删除或 secret 修改。

不要因为用户说过“AI key 已经配好”就在文档或客户端寻找/打印 key。只能通过
Supabase secrets 与已有部署工具验证 provider 可用性。

## 9. Apple Health / Apple Watch：代码完成到哪、人工还剩什么

### 9.1 已经在源码和后端完成的链路

目标数据流已经按下面路径实现：

`Apple Watch -> iPhone HealthKit -> Capacitor iOS 原生桥 -> 用户 JWT ->`
`health-sync-ingest -> canonical Supabase -> ChronoState / FDNB / AI -> 页面刷新`

已经存在：

- Capacitor iOS 工程与原生插件注册。
- HealthKit 权限请求、样本读取、后台观察和增量同步代码。
- 用户 JWT 服务端同步；客户端不持有 service-role 或共享 ingest key。
- `health_sync_jobs` Realtime 完成事件，前端收到后刷新相关页面。
- 部分指标上传保护：没有新样本的字段应被省略，不能用零/null 擦除服务器已有值。
- 15 分钟自动同步冷却、前台/冷启动触发与失败恢复逻辑。
- `NAVA Watch` target 已嵌入 Xcode project。
- Watch 首页节律快照、连接状态、请求同步、情绪快捷记录、专注开始/停止。
- WatchConnectivity 即时 message + 不可达时 `transferUserInfo` 队列。
- actionId 幂等、手机侧 protected queue、ACK/重放路径。
- migration `202609020002_health_sync_realtime.sql` 已在当时的生产实施中应用。
- 相关 Health/Watch Edge Functions 在 2026-09-02 的生产完成批次已经部署；当时
  的版本锚点保留在本文第 13 节和 Git 历史中。

必须纠正一个常见误解：普通网页不能因为电脑、iPhone 和 Apple Watch 位于同一
Wi-Fi 或蓝牙范围，就直接读取 Apple Watch 的完整历史 HealthKit 数据。正式路径
必须经签名 iOS app 获得 HealthKit 授权，再用用户 JWT 上传。网页预览只能读取
已经同步到 Supabase 的同一用户数据。

### 9.2 现在确实需要人工 / Apple 环境完成的事项

以下工作不能在当前 Windows/Codex 网页环境里冒充完成：

1. 在 Mac 上安装项目所需 Node、Xcode、CocoaPods，并运行 iOS release 准备流程。
2. 在 `health.nava.mobile` 与历史文档中的 `health.nava.app` 之间确认唯一正式 bundle
   ID；同步 Apple Developer、App Store Connect、Associated targets 和 Supabase
   redirect 配置。当前代码值不能自动等同于最终产品决策。
3. 选择 Apple Developer Team，为 iPhone app 和 `NAVA Watch` target 配置证书、
   profiles、HealthKit、WatchConnectivity、Background Delivery 等 capabilities。
4. 在真实 iPhone + Apple Watch 上验证：首次登录、杀进程重开后的安全会话恢复、
   首次授权、部分授权、拒绝、撤销、无血氧能力设备。
5. 真机验证 HealthKit background observer 在系统调度、低电量、离线、重启后的
   实际行为。模拟器或 TypeScript 测试不能证明后台持续同步。
6. 验证 Watch 在线即时动作、离线排队、重连重放、重复 actionId、ACK 和 UI 状态。
7. 用两个真实测试账户做完整 RLS/Storage 隔离：A 不能读取、覆盖或收到 B 的记录、
   图片、同步任务、Watch 动作或 AI 上下文。
8. 确认 HealthKit 部分指标、无样本和权限撤销时的最终中文文案。
9. 审计旧 `health_imports`/网页上游是否仍有真实消费者；确认无依赖后，单独授权
   退役 `health-auto-export`、删除/轮换 `HEALTH_EXPORT_API_KEY`，并让旧网页停止解析
   legacy import。当前 legacy function 有意保留，不能擅自删除。
10. 在真机完整运行
    [`APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md`](./APPLE_HEALTH_DEVICE_ACCEPTANCE_TEMPLATE.md)，
    保存截图、时间戳、sample count、失败证据与账号隔离结果。
11. Archive、TestFlight 内测、隐私清单/App Store 元数据和最终商店提交。

所以“只剩人工”只对 Apple 签名、真机、账户隔离和发布门槛成立；它不代表三个未
发布 AI Edge Functions 已上线，也不代表真机链路已经验收。

## 10. 视觉语言与排版习惯

### 10.1 总体视觉

- 手机竖屏优先，桌面浏览器只在中间呈现手机画布。
- 冰蓝/浅蓝玻璃质感、深海军蓝文字、白色描边、圆角卡片和柔和发光是基础系统。
- 背景有纹理和光影动画；NAVA 猫是有意识的品牌视觉，不可随意换成通用 emoji。
- 主要操作倾向“图标 + 短标签”；紧凑动作可只用可识别图标，但必须有 accessible
  label 和足够 touch target。
- 文字权级清楚：页面标题、卡片标题、字段 label、辅助说明不能挤成同一层级。

### 10.2 单屏与滚动

- 情绪、睡眠、专注准备页、面部入口是有意设计的一屏式页面。
- “一屏式”不是把内容强行缩小：表单卡底接近底部导航，但至少保留视觉呼吸区和
  safe-area；输入框/备注通过可用高度响应式伸缩。
- 饮食因为照片和可变识别行数允许滚动；详细资料也允许长页滚动。
- 详细资料是子页面，加载前和加载后都隐藏底部五键导航。
- 专注沉浸/中断页隐藏底部导航。

### 10.3 骨架屏

- 每个页面有符合自身最终结构的 loading skeleton；不能全部跳到统一 loading 页。
- 文本有几行，骨架就应有相近的几行；图表页有图表骨架；表单页有对应字段骨架。
- 从模块按钮跳转时，先根据真实 snapshot 决定下一页：未完成显示该模块 editor
  skeleton，完成显示 detail/dashboard skeleton。
- 加载中不得提前显示真实姓名、邮箱、“NAVA 用户”、完成度或其他尚未加载的数据。
- 没有数据与正在加载不是同一状态。加载完成后的空图表可以保留设计好的空结构，
  但不能继续播放无休止的 shimmer 让用户误以为仍在请求。

### 10.4 固定导航和布局验收

每次视觉改动必须分别检查：

- 360x740
- 375x812
- 390x844
- 430x932

至少检查以下项目：

- 页面根、手机 frame、内容容器和卡片无横向 overflow。
- 任何两个文字、图标、按钮、图表标签、猫图或固定导航都无交叉/重叠。
- 长中文、英文和真实 AI 返回不能被 `ellipsis` 隐藏关键内容。
- 卡片子元素完全位于卡片边界内；按钮距离边界和导航有安全间距。
- 底部导航不会遮挡最后一个输入框、按钮或 AI 评价。
- 侧边抽屉、弹层、头像 bottom sheet 位于当前手机 frame 内，不相对整个长文档错误
  定位。
- 软键盘代理高度下表单仍可编辑、滚动和保存。
- 空状态和有数据状态都检查；AI 短句和长句都检查。
- 没有不合理大留白；同时不要为了消除留白破坏节奏或把元素贴到一起。
- touch target、focus、aria label、返回栈、浏览器后退和 safe area 正常。
- `prefers-reduced-motion` 下动画可降级，功能不能消失。

响应式含义是卡片、字体、图标、间距和可变输入区随宽高共同调整，不是简单对整个
画面做 `transform: scale(...)`。已有 CSS 中看似重复的宽高规则常常对应一次真实
截图缺陷，删除前必须用四尺寸证据证明等价。

## 11. 已完成的近期修复（v83-v108）

这些是新任务最容易从旧聊天里误判的近期状态：

- v83：翻译扩展/外部 DOM 改写引发 `removeChild` 异常的韧性保护。
- v84：Sites 认证后重复入口与 AuthContext 问题，改为外置入口模块。
- v85：按页面骨架屏；周报空数据七日柱形结构；轨迹/雷达等高。
- v86：详细资料 loading 不泄露用户身份；子页面隐藏底部导航。
- v87：资料页开关排版；柱形最大/最小映射和基线；雷达“专注”下移。
- v88：六模块真实完成度、绿色进度环和“未完成进编辑器 / 完成进详情”路由。
- v90：健康报告六卡在小尺寸完整显示四行。
- v91：真实读请求合并、保存后失效、懒加载和无损 WebP 资源减重。
- v92：登录提交后空表单闪屏修复。
- v94：情绪、睡眠、饮食、专注、面部编辑器重构。
- v95：短屏睡眠保存边距、饮食多余 72px 空隙、面部 AI 文字截断修复。
- v96：详细资料头像拍照/相册更换；三点菜单；移除专注 25/45/60；面部模式紧凑
  图标与拍摄框；六模块目的页骨架。
- v97：应用内通知横幅、通知收件箱、手势、已读/删除/撤销与本地通知源码。
- v98：首页时段氛围、真实状态 guidance、动态入口和状态驱动小猫动作。
- v99：首页 0–6 个可配置健康组件、目标默认组合、三列拖动排序、近七日真实变化、
  睡眠维持、面部稳定拍摄条件，以及专注快捷预设口径统一。
- v100：首页默认五项统一为睡眠、专注、运动 / 情绪、饮食；右侧快捷入口改为菜单
  始终第一、通知第二且统一收放；今日建议卡补齐关闭按钮和约 10 秒自动消失。
- v101：首页五卡放大并按右侧通知/日历、详细资料/功能导航两段精确对齐；今日建议改为
  仅成功登录后的首次首页展示；通知中心补齐紧凑自适应卡、分类图标、完整详情、条件权限卡、
  三点菜单和长按/全选/批量管理。
- v102：通知中心分类图标放大并垂直居中，时间和未读点改为右侧上下层级；打开具体详情
  后才标记已读，详情改为大分类名层级，全部已读/多选不再使用对钩图标；首页五张加载
  骨架与正式卡片统一为相同矩形尺寸和圆角。
- v107：完成云端数据完整性复核、按餐营养并发/幂等、原子专注会话、私有头像、完整文件
  导出、legacy phone 删除清理、Health/Watch 缺失值与 ack 边界、AI 授权画像/健康指标
  指纹缓存，并将当前数据库/函数/前端从同一源码提交发布。
- v108：睡眠维持入口精简为两行并改为“开始记录”，作息快捷项不再推算睡眠阶段；专注
  改为 25/45/60/自定义下拉；面部正常页移除强制条件块，三点菜单增加非阻塞条件检验，
  face-analyze v16 返回三项视觉判断；双站与四尺寸线上登录边界同步验证。
- v109：今日安排的待办正文可直达专注准备页并带入任务/计划，完成圆钮保持独立；缺少计划
  时按可审计规则估算并写回 `tasks`。沉浸计时改为 body portal 的全视口层，加入浏览器
  Fullscreen API、Screen Wake Lock 开关与兼容回退，专注概览卡距和沉浸页纵向节奏重新统一。
- v110：首页不再复用登录页纸张纹理作为主场景，改为根据 Figma 参考图生成并随源码发布的
  纯竖屏冰蓝室内背景；窗柱、斜向光束、圆形台面、半透明地台和底部弧形地面均位于独立
  装饰层，卡片、猫咪、建议卡、快捷入口和导航继续由可交互 HTML/SVG 层呈现。

发布演进已经压缩进本节；精确差异使用 Git log/commit 查看，视觉和运行证据保存在
第 15 节列出的 TestRuns 目录，不再维护重复的 dated handoff。

## 12. 性能优化习惯：不能用视觉退化换速度

v91 已做并应保留：

- 同一渲染窗口的重复 Supabase read 合并。
- 保存、Health Realtime 完成和回到前台后的有意 cache invalidation。
- `RecordsScreen`、AI、成长、个人页及记录详情按需加载。
- AI 页面挂载策略保留会话体验，但非激活时 inert/隐藏。
- 大型猫图从约 6.82 MB 优化到约 3.55 MB 的无损 WebP。
- 初始 record chunk 从约 163.63 KB 降到约 59.67 KB；dashboard 为约 91.96 KB
  lazy chunk（以当时构建为准）。

后续优化优先做：请求去重、正确缓存粒度、chunk 拆分、资源编码、避免重复上下文和
无意义重渲染。不能通过删除背景光影、猫动画、页面过渡、真实状态检查或 skeleton
来换取“更快”。也不能加长 cache 导致保存后仍显示旧完成状态。

## 13. Supabase / 后端实施状态

当前仓库和 canonical production 均有 24 个 append-only migration，覆盖移动端合同、
AI/记录、ChronoState、密码与短信、Watch 幂等、头像、onboarding、FDNB、会话隔离、
奖励、健康报告、专注计划、Health Realtime、完整云端状态、原子专注会话、私有头像和
legacy phone 清理。

主要 Edge Function 目录：

- `ai-chat-reply`
- `ai-diet-report`
- `ai-extract-data`
- `ai-health-report`
- `diet-extract`
- `face-analyze`
- `rhythm-score`
- `dnb-weekly-report`
- `fdnb-recompute`
- `health-sync-ingest`
- `watch-sync`
- `export-user-data`
- `delete-account`
- `aliyun-sms-send` / `aliyun-sms-verify`
- `auth-account-status`

2026-09-07 已把本轮涉及的最新源码部署到 canonical production：ai-chat v20、
ai-diet v7、ai-health v10、diet-extract v17、delete v10、export v16、health ingest v12、
watch v13，均为 ACTIVE 且 `verify_jwt=true`。2026-09-06 又单独部署 face-analyze v16，
加入非阻塞拍摄条件判断；ai-extract v18 等未涉及函数保持原版本。部署身份、共享项目和未登录边界已检查；真实账户 provider 输出、报告持久化、
缓存命中与实际删除/导出内容仍要按第 18 节人工验收。

## 14. ChronoState、FDNB 与报告真实性

ChronoState 是可审计的节律计算层，不是装饰性分数。当前生产源码模型版本是
`nava-chronostate-v4.27-2026-07`；V4.8 是早期演进节点，不是当前版本号。当前合同
包括 score、置信区间、
信号、融合、baseline、数据质量、活动 bins、睡眠阶段、规律度、碎片化、异常、趋势、
change point、model/schema version 等。页面只展示适合用户的子集，但后端证据应当
可追踪。

FDNB 是研究性、非诊断增强层：

- 至少 14 个有效天；
- 4 个特征 / 3 个模块门槛；
- 使用 7/14/21 天窗口；
- 输出可以进入健康功能、FDNB 详情和周报，但必须标明研究/不确定性边界。

不能因为算法需要更多天，就生成一套固定曲线让页面“好看”。数据不足时展示结构化
空态或数据质量说明。真实报告缓存要使用 source fingerprint；记录改变后旧报告不能
继续当作当前结论。

## 15. 验证命令与证据

发布候选至少运行：

```powershell
npm run verify
npm run auth:verify:production
```

按变更补充：

```powershell
npm run interaction:test
npm run record-editor:visual
npm run module-progress:visual
npm run ai:compact:test
npm run weekly-report:test
npm run performance:test
npm run consent:contract:test
npm run health:contract:test
npm run ios:verify
npm run supabase:verify-shared
```

`npm run verify` 当前是 28 阶段综合门禁，interaction suite 当前记录为 11 组；具体
数字可能随脚本更新，新任务应以运行输出为准。构建通过不等于真实 Supabase 写入、
OTP 送达、模型 provider 可用、HealthKit 真机权限或视觉验收通过。

本交接完成后已于 2026-09-05 再运行一次完整 `npm run verify`：25 个阶段全部通过，
包括生产构建、lint、Sites 单入口身份、四尺寸六卡、四尺寸记录编辑器、真实完成度、
AI 双摘要、后端合同、16 个 Edge Function typecheck、Deno 测试、Health/Watch、iOS、
consent、翻译 DOM 韧性、请求缓存边界、通知规划和首页动态 guidance 合同。这个结果验证当前源树的一致性，但仍不替代
第 9.2 节的 Apple 真机验收或第 8.1 节的真实账户模型验收。

2026-09-05 健康 AI 定向修复批次再次运行完整 `npm run verify`，25 个阶段全部通过；
另外 `npm run weekly-report:test` 为 9/9、`npm run ai:compact:test` 为 4/4，16 个 Edge
Function typecheck 全部通过。2026-09-06 部署前又运行相同的三个定向命令，结果仍为
9/9、4/4 和 16 个 Function typecheck 全部通过；生产 `ai-health-report` v5 随后已部署，
但真实账户模型生成和缓存行为仍未验证。

2026-09-06 本轮云端完整性最终源码再次运行完整 `npm run verify`，26 个阶段全部通过；
新增第 26 阶段固定全部账号表/Storage 导出、级联删除、本地缓存云端对应物和以前遗漏
字段的合同。随后 `npm run auth:verify:production` 也通过，canonical project、公开站
禁用 demo 绕过、当前 tab 认证和邮箱/手机号入口均符合合同；严格 SMTP 状态未检查。

2026-09-07 更细一轮数据链路修复后，完整 `npm run verify` 的 27 个阶段、
`npm run interaction:test` 的 11 组、`npm run auth:verify:production`、
`npm run supabase:verify-shared`、production DB lint 和 migration history 均通过。
首页 guidance、首页组件和通知中心分别在 360x740、375x812、390x844、430x932 四档
无头 Playwright 通过；饮食评分在 430x932 的底部裁切也已修复。严格 SMTP、真实账户
AI provider、真实导出内容和破坏性账号删除没有在本轮冒充为已验证。

近期证据目录：

- `Q:\NAVA-Workspace\Build\TestRuns\nava-auth-transition-local`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-record-editor-v95-recheck`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-v95-public`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-v96-record-editors`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-v96-public`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-20260905`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-home-guidance-20260905`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-home-widgets-v102-20260905`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-home-guidance-v101-20260905`
- `Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v102-20260905`

截图只能证明被截取时的视觉状态。凡涉及写入、RLS、provider、HealthKit 或 Watch
队列，必须在真正边界记录网络/数据库/真机证据。

## 16. 发布流程和授权边界

### 16.1 前端双站

用户已给出持续授权：以后只要用户要求修改 APP 代码、页面或功能，完成并验证后就
同时发布 Sites 和 GitHub Pages，不必让用户再单独说“部署”。

发布必须满足：

1. 源仓库状态可解释，所有本任务改动已验证。
2. 从同一个已 commit、已 push 的源状态构建两种 artifact。
3. Sites 复用 `.openai/hosting.json` 中现有 project ID，不得创建第二个 NAVA Sites
   项目。
4. Pages 由源仓库生成后单向复制到 preview 镜像，并更新 `source.json`。
5. 验证两个未登录 URL、真实登录路由、canonical Supabase project ref、发布 commit
   和关键改动页面。
6. 公开验收不得随意修改生产记录；如果测试需要写入，先说明范围并使用可恢复数据。

### 16.2 仍需单独授权的外部动作

持续前端授权不包括：

- 应用 migration
- 部署或删除 Edge Function
- 改 Supabase secret
- 改 Storage/RLS/访问策略
- 生产 seed、账户 backfill 或删除记录
- 退役 legacy function / 轮换 legacy key
- TestFlight 或 App Store 发布

## 17. 详细资料与账户页最新合同

- 详细资料加载时整页使用自身 skeleton，不能先暴露邮箱、用户名或完成度。
- 加载完成后首卡显示实际 profile；详细资料子页无底部五键导航。
- 左侧头像是可点击 action，打开位于手机 frame 内的 bottom sheet：前置摄像头拍照
  或从相册选择。
- 图片上传到 `profile-avatars` 当前用户路径，成功后更新 `profiles.avatar_url`。
- 右上角是三点菜单，不是无功能的人形图标。当前动作：更换头像、数据与 AI 偏好、
  保存资料。
- “数据与 AI 偏好”的 toggle 圆点必须完全位于轨道内；窄屏不能向右溢出。
- 账户导出、删除、隐私与 consent 的实际能力不能被视觉菜单遮蔽或降级。

## 18. 明确未完成、延期或需后续决策的工作

### A. 有源码但尚未上线

截至 2026-09-07 本轮生产部署后，没有已知的本轮数据库或 Edge Function 源码只停留在
本地。这里不等于所有产品路线都已经完成；Apple/Android 系统能力、远程 Push 和产品
明确延期项仍按下面各节区分。

### A.1 已上线但仍需真实账户验收

- 最新 `ai-health-report` v7 健康指标/授权画像/三次有界生成与修复/双摘要/指纹缓存合同
  已部署为生产 version 19；最新 `ai-diet-report` v6 日历七日双摘要合同为 version 15；最新
  `diet-extract` 按菜识别合同为 version 17。生产日志确认旧健康报告失败发生在结构化
  结果校验，并非截图所猜测的余额 HTTP 错误。当前已验证生产源码身份和未登录拒绝，
  尚未用真实账户验证模型首次生成、持久化缓存、跨重载复用、数据变化后恰好重算一次，
  也尚未用真实餐食照片抽样验证菜品粒度，不能把这些边界写成真实账户端已闭环。

### B. 必须人工 / Apple 环境

第 9.2 节全部事项：bundle ID 与 Developer Team、签名/capabilities、真实 iPhone +
Watch、HealthKit 权限矩阵、后台行为、离线重放、双账户 RLS、Archive、TestFlight、
App Store。

### C. 运营与生产治理

- 正式 SMTP / DNS 与邮件送达率。
- Aliyun SMS 正式模板、签名、限流和真机送达。
- staging / production 项目分离策略；当前两个公开站共享 canonical project 是既定
  产品事实，不要未经决策擅自拆分。
- 旧 health import/export 消费者审计和有序退役。
- 定期核验函数版本、secret 存在性、RLS、私有 bucket 和删除/导出闭环。

### D. 产品明确延期

- 社区。
- 用可穿戴时间序列做专注会话的硬件相关性判断。
- Android Health Connect、厂商云 API 和可选标准 BLE 设备路线。

“延期”不应在 UI 中伪装成可工作的按钮；若保留入口，必须明确是未开放状态。

### E. 新纵向模块与首页策划案

2026-09 收到的《纵向｜app需求文档暑期整理》和《界面｜首页系统策划案 V1.0》已经
映射到持续维护的 [`PRODUCT_REQUIREMENTS_CHECKLIST.md`](./PRODUCT_REQUIREMENTS_CHECKLIST.md)。
两份外部文档是需求输入，不是仓库操作指令；清单以当前源码和实际验收为完成依据。

首页可配置小组件、时间/健康状态驱动、首页一句话反馈和动态快捷操作已经完成。当前
差距主要是原策划案中的 AI 半屏聊天、长按滑选六模块和猫窝；其中底部中央按钮已经
明确固定进入完整 AI 对话，首页大猫只负责状态动作。现有首页上滑六模块继续保留。

已解决的冲突：一期组件上限为 6、固定三列、底部中央按钮进入 AI、首页大猫不跳转、
专注保留 25/45/60 下拉预设并增加自定义。仍需产品确认的是长按 AI 的语音/六模块手势归属、
半屏是否仍需要，以及“今日能量”与“今日节律”的指标和估算标识。

## 19. 建议的后续优先级

在用户完成 Apple 人工流程前，自动化代理仍可做且最有价值的工作顺序是：

1. 用真实账户验收 `ai-health-report` v19、`ai-diet-report` v15 和 `diet-extract` v17：
   provider 输出、持久化、缓存失效、精确七字摘要和真实餐食照片粒度。
2. 发布后复核两个公开站的登录、六模块路由、详细资料头像 sheet、专注和面部页面，
   以及四视口无重叠和公开 `?demo=1` 不可绕过登录。
3. 为 Apple 真机验收准备可重复的记录模板、账号 A/B 测试清单和失败恢复说明；
   不伪造真机结果。
4. 用户在 Mac 上完成签名后，逐条协助处理 Xcode/HealthKit/WatchConnectivity 的真实
   失败证据。
5. 真机主链路稳定后再评估运营 SMTP/SMS、staging/prod 和 legacy health 退役。
6. 商城、社区、Android/厂商手表只在产品重新排期后开始。

每轮修改继续遵循“读相关代码 -> 修改 -> 自动测试 -> 四尺寸视觉验收 -> 双站发布 ->
真实边界复核 -> 更新本交接”的闭环。

## 20. 文档维护和冲突处理

旧日期交接、旧新任务提示、旧开发队列、一次性审计、早期 Figma 预览、旧
ChronoState/Fusion 实现报告和已经被正式 Apple 方案覆盖的 wearable 调研已经从
工作树删除。需要追溯时使用 Git 历史，不把它们恢复成并列“现行文档”。

新任务遇到冲突时采用以下优先级：`AGENTS.md` > 用户当前明确要求 > 当前代码和真实
外部状态 > 本文件 > [`INDEX.md`](./INDEX.md) 中列出的专项当前文档 > Git 历史。

以后每轮迭代直接更新本文件和受影响的专项文档；如果一个新文档完全取代旧文档，
同一提交删除旧文件、修复所有引用并更新 `INDEX.md`。

## 21. 新任务接手检查单

可以把下面这组命令作为安全起点：

```powershell
Set-Location -LiteralPath 'Q:\NAVA-Workspace\nava-app'
git status --short --branch
git log -8 --oneline
Get-Content -LiteralPath 'docs\CODEX_HANDOFF_CURRENT.md' -Raw
npm run verify
```

随后根据任务决定是否运行 public auth、视觉或后端核验。不要自动运行会写生产数据的
seed/backfill，也不要自动部署 migration/function。

完成任务时必须报告：

- 实际改了哪些文件和行为；
- 哪些测试和尺寸真正通过；
- 哪些结论只在本地验证，哪些已在两个公开站验证；
- 是否改动生产数据、backend、secret 或策略；
- 当前源 commit、Sites 版本、Pages mirror commit；
- 剩余人工或外部门槛，不能把“未验证”写成“完成”。

## 22. 最后一条连续性说明

这次交接写作的直接原因是旧 Codex 任务非常长，包含大量图片与多次上下文压缩，
桌面界面曾回退显示数天前的消息。项目代码、Git 历史和本文件才是连续性来源。
归档旧任务、重新建立 Codex 项目或打开新任务不会删除源仓库；但用户如果要在 Codex
界面删除“项目”，应确认操作只影响 Codex 的项目索引/会话，不要删除
`Q:\NAVA-Workspace\nava-app`、`Q:\NAVA-Workspace\nava-app-preview`、Build 证据或
Supabase 资源。

新任务不需要复述整段聊天，也不要重新从零实现已经存在的功能。先用本文件定位，
再用代码、测试和真实外部边界验证，然后从第 18、19 节继续。

## 23. 通知与提醒最新状态

2026-09-05 已在源码中补齐统一通知体验：首页右上角铃铛和未读数、一次一条的顶部
圆角横幅（上滑/关闭/点击跳转）；通知中心标题不再显示状态副标题，右上角三点菜单提供
全部已读、全部删除和多选。权限卡仅在尚未授权或不支持时显示，成功开启后立即移除。
列表按类别使用不同颜色和睡眠/月亮、饮食/餐具、运动/脚步等语义图标；一至两行正文
决定紧凑卡片高度，超出显示省略号。v102 将分类色块和图标放大并垂直居中，时间固定
在右侧，未读圆点居中放在时间下方；进入通知中心不会自动标记已读，只有打开具体详情
或执行明确的单条/批量标记动作才改变已读状态。详情使用“图标 + 大分类名 + 小时间”
标题行，再展示通知标题、完整正文和目标页面按钮。
右滑露出删除、左滑露出已读动作仍保留；菜单或长按进入多选后可全选、批量已读或删除，
单条和批量删除均可撤销。三点菜单的全部已读改用打开的信封，多选改用带加号的列表，
不再把对钩同时用作两种不同操作。

专项 Playwright 在 360x740、375x812、390x844、430x932 实跑横幅、列表高度适配、
类别图标、详情弹窗、权限卡消失、三点菜单、长按与批量操作、两种滑动、删除撤销、
空状态和无横向溢出。证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v102-20260905`。

通知内容不使用生产示例数据。六模块成功保存会产生完成通知；首页读取当前用户真实
`TodaySnapshot` 后，按本地时间和真实缺失/低活动/专注/情绪完整性/面部记录以及
ChronoState 已持久化 action 生成当日提醒。收件箱、已读和删除 tombstone 以
`user_notifications` 为跨设备事实源，`localStorage` 只作启动/离线缓存；
`notification_preferences` 继续保存已有 RLS 保护的提醒偏好。

Capacitor 本地通知现可安排睡眠、饮食、专注、情绪、今日状态和周报，前台接收或点击
系统通知会回流应用内收件箱并打开相应模块。这个结论是源码与 Windows 静态合同，仍
不能替代 Mac/Xcode/iPhone 的锁屏、后台、权限和深链真机验收。仓库没有 Android 原生
工程，所以华为锁屏通知也尚未交付；APNs/FCM/HMS 远程 Push、设备 token 和服务端发送
均未实现。应用内收件箱多端同步已完成，但不能冒充系统锁屏远程 Push。

完整边界见 [`NOTIFICATIONS_DELIVERY.md`](./NOTIFICATIONS_DELIVERY.md)。原生锁屏送达仍
必须等 Mac/Xcode/iPhone 真机验收后才能写成完成。

上述应用内通知与首页调整已由同一功能源码 commit
`fe71c3b824c29037150b4b22caef47df3833c49d` 发布为 ChatGPT Sites v102 和 GitHub
Pages v102。两个公开 URL 均返回 200；在线入口和 `App` chunk SHA-256 一致，且使用
canonical Supabase project ref，`?demo=1` 仍只显示真实认证门。

## 24. 首页动态状态最新状态

2026-09-05 已在源码中新增 `buildHomeGuidance` 纯规则合同：首页按设备本地小时切换
清晨、白天、傍晚、夜间四种轻量氛围；读取当天真实 `TodaySnapshot`，按睡眠不足、
ChronoState 已持久化行动、傍晚低活动、专注完成/缺失、夜间放松和稳定状态排序，
选择一条最多两行的建议、一个小猫动作及 2–3 个真实页面入口。规则不调用新模型、
不发明健康结论，缺数据时只引导补记录。

小猫保留原有五套精灵动画；首页有真实 guidance 时，点击优先播放建议动作，没有
guidance 时仍使用原序列。健康建议卡在六模块圆盘展开时自动淡出，避免遮挡入口。
`npm run home-guidance:test` 覆盖时段边界、状态优先级、动作映射和入口去重；
`npm run home-guidance:visual` 已在 360x740、375x812、390x844、430x932 验证建议卡、
上下层关系、无横向溢出、小猫动作和报告跳转。证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-guidance-20260905`。

上述首页动态状态已由同一源码 commit `bf4178f72c06595106090db0ed0a245dd11d867d`
发布为 ChatGPT Sites v98，并同步到 GitHub Pages v98。线上无头 Playwright 已确认两个
站点均返回 200、显示真实登录门而不出现 `.phone-frame` 演示态；线上构建资产均包含
canonical Supabase project ref `wxteapvwagvhhtrjrbim` 与本轮 guidance 实现。

## 25. 首页组件与“维持”链路最新状态

2026-09-05 用户明确一期首页健康组件最多 6 个、固定三列；2026-09-06 又将专注时长
最新定为 25/45/60 分钟加“自定义”的下拉选择。底部中央按钮固定进入 AI 对话。
`HomeWidgetEditor` 现在从功能抽屉进入，支持 0–6 个
组件选择、两步编辑、指针拖动、辅助前后移动、保存/取消和未保存退出确认。2026-09-05
最新产品决定覆盖旧策划案的按目标默认组合：没有设备配置时固定显示睡眠、专注、运动 /
情绪、饮食五项，面部作为可选第六项。首页组件只显示一个核心值和一条辅助信息，值来自
当前用户真实 `TodaySnapshot`；未完成或部分完成点击进入编辑器，达到模块完整标准后点击
进入数据详情。至少有两个更早记录日时才显示最近最多七个记录日的百分比变化。组件显示
偏好同步到账号云端并在本机保留离线缓存，不扩大 AI consent 范围。

首页右侧快捷入口已固定为三横杠菜单、通知、健康日历、详细资料、功能导航；三横杠始终
在最上方，并统一收起/展开其余四项，收起时这些按钮退出键盘焦点。首页健康卡统一为
106 CSS px 高：第一行上下边界对齐通知按钮顶部与日历按钮底部，第二行对齐详细资料按钮
顶部与功能导航按钮底部；卡内标题、核心值和辅助文本同步放大。v102 同时修复加载状态：
五张骨架卡直接采用正式卡片的宽度、106 CSS px 高度和 15/18 px 响应式圆角，不再被
通用胶囊骨架规则覆盖成椭圆。

今日建议卡只在用户以邮箱/手机号密码或 OTP 成功登录后的本次首次首页展示；恢复已有
session、刷新页面或从其他页面返回首页均不会再次出现。卡片保留右上角关闭，并在连续
停留约 10 秒后自动移除；不显示倒计时，数据来源和跳转入口仍保持真实
`TodaySnapshot` / ChronoState 合同。

睡眠“维持”被定义为账号可恢复的进行中会话，入口只保留两行文字并改为“开始记录”；
结束后只填入起止时间/总时长，不直接保存，也不推算睡眠阶段。面部正常入口取消条件块
和 3/3 强制门槛，前置拍摄与相册始终可用；三点菜单单独提供“条件检验”，由视觉模型
返回光线、居中、自然表情判断并允许手工改选，任何未通过项都不阻止分析。30 分钟加密
草稿恢复仍保留。

实际验证：

- `npm run verify` 27 个阶段全部通过；`npm run auth:verify:production` 通过，严格 SMTP
  因未提供 Management token 而未检查。
- `npm run record-editor:visual` 在 360x740、375x812、390x844、430x932 实跑睡眠两行
  入口与“不伪造阶段”、专注四项下拉/自定义输入、面部普通页无条件块、三点菜单条件检验、
  三项自动回填/人工改选和非阻塞拍摄；全部一屏且无横向溢出。证据在
  `Q:\NAVA-Workspace\Build\TestRuns\nava-record-editor-layout-v108`。
- `npm run home-widgets:visual` 在 360x740、375x812、390x844、430x932 实跑默认五项
  固定顺序、放大后两行和右侧按钮区段的精确对齐、六项、零项、三列排序与拖动、右侧按钮顺序/收放、底部 AI 路由、睡眠刷新
  恢复/结束填表和面部 3/3 条件；证据在
  `Q:\NAVA-Workspace\Build\TestRuns\nava-home-widgets-v102-20260905`；其中也逐尺寸比较五张
  加载骨架与正式卡片的实际宽高和圆角。
- `npm run home-guidance:visual` 四档实跑成功登录后首次展示，并分别验证 10.1 秒自动消失、
  手动关闭后刷新不重复、页面间返回首页不重复和快捷入口跳转；证据在
  `Q:\NAVA-Workspace\Build\TestRuns\nava-home-guidance-v101-20260905`。
- `npm run notification:visual` 四档实跑紧凑自适应列表、语义图标、详情、权限、三点菜单、
  长按/全选/批量操作、滑动与撤销；证据在
  `Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v102-20260905`。
- 功能源码 commit `fe71c3b824c29037150b4b22caef47df3833c49d` 已发布为 ChatGPT
  Sites v102，并同步为 GitHub Pages v102；镜像 commit 为
  `0af29abde6ce41e0a12a29487681a1664c46d033`。
- 两个公开 URL 均返回 200；在线入口与功能 chunks 字节一致，包含本轮组件/睡眠/面部
  实现及 canonical Supabase project ref。对两个公开 URL 使用 `?demo=1` 仍只出现真实
  登录页，未出现 `.phone-frame` 演示态。

持续清单 [`PRODUCT_REQUIREMENTS_CHECKLIST.md`](./PRODUCT_REQUIREMENTS_CHECKLIST.md)
加入四项账号数据完整性验收后当前为 66 项完成、33 项待完成。剩余项中，Apple/通知真机、Android/华为、远程 Push、
健康/饮食 AI 真实账户验收和真实餐食图片识别抽样需要人工环境；商城、社区、复杂
猫窝与多尺寸组件明确延期；AI 半屏、长按手势归属、运动结构化会话等仍需后续产品或
实现批次，不能写成已完成。

## 26. 健康报告 AI 失败诊断与 v104 前端发布

2026-09-05 已完成第 8.1 节所述真实生产日志诊断，并在源码中修复旧 repair 看不到
失败草稿/失败字段的问题。`src/services/healthReport.ts` 同时加入按认证用户和相关数据
修订指纹隔离的当前运行期成功结果缓存；模块或周报页面来回切换不再重复经过 Edge
请求，保存真实记录或 HealthKit/Watch/Realtime 刷新改变相关数据时会失效缓存并重算。
跨运行期仍由 Supabase 的 source fingerprint
持久化缓存判定数据是否变化。

这项前端缓存已随源码 commit `1cc66c088b3bc283c65c4b2b25c07898c3536513`
发布为 ChatGPT Sites v104，并同步为 GitHub Pages v104；镜像 commit 为
`58726594d02cf0b33b69e7e7952760d6d66aa9ff`。两个公开 URL 的无头 Playwright 均返回
200、显示真实登录门、拒绝公开 `?demo=1` 绕过并包含 canonical Supabase project ref；
两边线上 `healthReport-CbDTFbwO.js` 与本地构建 SHA-256 一致。

2026-09-06 获用户明确授权后，只将 `supabase/functions/ai-health-report` v5 部署到
canonical Supabase；生产由 function version 8 / 模型合同 v3 升为 version 9 /
`deepseek-v4-flash-health-report-v5-targeted-repair`，状态 active 且 `verify_jwt=true`。
生产只读下载的 `index.ts` 与本地 SHA-256 完全一致；对 canonical endpoint 的未登录调用
实际返回 `请先登录后再调用 App 后端。`，证明线上函数可达且用户边界生效。此次没有部署
其他 Edge Function，也没有执行 migration、seed、backfill、secret 或访问策略修改。

仍需用产生截图的真实账户/同一周数据验证：首次生成成功并写缓存、页面切换零重复调用、
无数据变化跨重载命中持久化缓存、修改一条相关记录后指纹变化并恰好重新生成一次。在这组
真实账户证据完成前，只能说修复已上线，不能说截图问题已在真实数据边界闭环。

## 27. 账号云端数据完整性与删除/导出合同

2026-09-06 已获得用户对本轮 Supabase 数据完整性修改和部署的明确授权。生产 migration
`202609060001_cloud_data_completeness.sql` 已实际应用到 canonical project
`wxteapvwagvhhtrjrbim`。2026-09-07 又实际应用三项 append-only migration：
`focus_session_integrity`、`profile_avatar_privacy` 和 `legacy_phone_cleanup`；本地/远端
migration history 现在均为 24 项。云端完整性批次新增：

- `user_app_preferences`：语言、AI 语音、首页 0–6 个组件及顺序；
- `user_notifications`：应用内收件箱、已读/删除状态与 Realtime；
- `ai_conversation_archives`：AI 历史会话归档；
- `active_user_sessions`：进行中的专注/睡眠会话；
- `focus_records.note`、`tasks.source`、`nutrition_records.pantry_time`，并补齐四餐时间读写。
- `focus_session_events` 与原子 `complete_focus_session` RPC：完成专注、积分与 receipt 在
  单一数据库事务中落地，重试使用稳定 session ID 去重；
- `profile-avatars` 变为私有 bucket，`profiles.avatar_url` 保存私有对象路径并临时签名展示；
- 删除账户时额外清理历史 phone alias / verification / OTP 行，避免认证别名残留。

迁移把 11 张旧业务表补成指向 `auth.users` 的级联外键，把 analytics 从
`ON DELETE SET NULL` 改成 `ON DELETE CASCADE`，并在生产事务内遍历所有 public
`user_id` 表及 `profiles.id`：任一对象没有 `ON DELETE CASCADE` 即失败。迁移成功因此是
实际生产结构证据，而不是只读源码推断。旧账号 profile 回填后，生产表统计显示 profiles
从 2 行变为 3 行，与已知 3 个 Auth 用户一致；没有打印账号、token 或私有记录。

`export-user-data` 已升级并部署为生产 version 16、ACTIVE、`verify_jwt=true`。导出包含
Auth 基本身份、全部 40 张账号归属 public 表，以及 `diet-photos`、`face-photos`、
`profile-avatars` 的对象清单；浏览器随后下载用户拥有的实际私有文件并与 JSON 一起打包
为 `.tar.gz`。任一表、对象或文件内容读取失败会整体报错，不再用会过期的 signed URL
冒充完整文件导出。未登录实际 POST 返回 401。由于没有在本任务取得真实用户凭据，尚未
把某个真实账号的完整归档下载并逐项校验；这项不能写成已做真实账号内容验收。

客户端删除确认现在也会清理该用户 local/session storage、30 分钟 AES-GCM 面部草稿、
Watch 本地队列和应用上下文、已安排的六类系统本地通知；服务端仍先删除三个 Storage
用户前缀，并用相同服务端 HMAC 合同清除该邮箱/手机号对应的账号检查与 OTP 摘要，
再删除 Auth，由上述外键级联清表。更新后的 `delete-account` 已部署为生产 version 10、
ACTIVE、`verify_jwt=true`，未登录实际 POST 返回 401。本轮没有删除任何真实用户，也没有运行
production seed/backfill；“没有残留”的证据是生产结构断言、删除源码合同与静态测试，
仍建议在专门可牺牲测试账号上做一次端到端破坏性验收。

有意保留在本机而不上传的只有：浏览器当前 tab 的认证会话、尚未确认上传的短期加密
面部草稿、待上传 outbox 本身、临时 UI/视觉 QA 状态和可重新取得的缓存。通知、偏好、
AI 归档、记录草稿、活动会话及 Watch 动作都有 Supabase 事实源或可重放 outbox；应用
启动/联网后会重试，不再把待发送本机状态当作云端已成功。`npm run cloud-data:test` 固定
导出表清单、Storage、级联删除、云端偏好/通知/AI 归档/活动会话和以前丢失字段的源码
合同；生产 REST 探测已确认新增表和字段可达。

本轮功能源码 commit `00826372167d45b414531d4426ccc35c5ebbae6e` 已从同一干净、
已 push 状态发布为 ChatGPT Sites v106，并同步到 GitHub Pages v106；镜像 commit 为
`a1d2e61fe2d5ad0009e21ce84282b8fad5821a63`。两个公开根 URL 实际返回 200，均包含 NAVA
与 canonical Supabase project ref；Pages `source.json` 实际返回 v106 和上述源码 commit。
发布后生产认证合同再次通过，公开 demo 绕过保持禁用。

## 28. 2026-09-07 全量数据链路复核与修复

本轮在代码、migration、Edge Function、客户端缓存/重试和真实 production 结构之间又做了
一轮逐项复核，并修复以下数据完整性问题：

- 记录编辑器不再用虚构睡眠时间/阶段、全日营养或缺失运动指标填补空字段；六模块完成度、
  周报和图表只依据满足各自完成合同的真实记录。
- 饮食改为按餐保存营养摘要，覆盖一餐时保留其他餐并重算全日合计；AI/手动重试使用稳定
  source ID，跨设备并发更新使用 optimistic concurrency，不再静默覆盖另一设备的新数据。
- 专注完成通过 `record_focus_session` RPC 原子更新会话、分时分布、积分和幂等事件；倒计时
  使用真实 wall clock，重复回执不会重复累计。
- HealthKit/Watch 缺失字段保持缺失，不伪造 0 或睡眠阶段；Watch 只有 Supabase 成功后才
  ack，失败 receipt 可重领并重试，未知动作显式失败。
- 通知、偏好、记录草稿、活动会话和 Watch 队列都具有云端事实源或可重放 outbox；头像改为
  私有对象路径；导出包含 40 张账号表和实际私有文件；删除补齐 legacy phone 残留清理。
- 健康 AI v6 的源指纹纳入授权画像和 HealthKit 指标，饮食 AI 使用真实日历七日窗口；只有
  相关源数据/授权画像改变才重算，普通摘要和严格七字紧凑摘要一起校验并缓存。

真实 production 已应用全部 24 个 migration，并部署 ai-chat v20、ai-diet v7、ai-health
v10、diet-extract v17、face-analyze v16、delete v10、export v16、health ingest v12、watch v13。共享项目检查、
DB lint、migration history、生产 auth 合同和 `npm run verify` 27 阶段均通过；interaction
11 组及首页/通知相关四视口无头 Playwright 也通过。没有执行 production seed、backfill、
真实账号删除或写入用户记录。

尚不能自动替代的证据仍是：真实账户 AI provider/缓存验收、真实完整导出和可牺牲账号删除、
Mac/Xcode/iPhone/Apple Watch 签名与真机矩阵、APNs/FCM/HMS 远程推送以及 Android/华为
原生壳。本轮完成的是源码、production schema/function 和非破坏性边界，不把这些人工项
写成已经完成。

功能源码 commit `1715af7c1bd204459a69962262b67b5a37dd1d5a` 已从同一已 push 状态
发布为 ChatGPT Sites v108 和 GitHub Pages v108；Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_ebebd39a845c81919a482b6b2aa04fd1`，
deployment ID 为 `appgdep_6a9d3967915881919f9dd4b3888fd87f`，Pages 镜像 commit 为
`9d21493303e17f2de58e66fbb4e144c653311e1a`。两个公开根 URL 均返回 200；两个站点
在四个规定视口的线上无头 Playwright 都显示真实登录页、无横向溢出，`?demo=1` 不可
绕过，入口模块 SHA-256 均为 `3abbc659de9f3e37a49895b8dbb5c30074746166a631d945cdc50b0369f39404`。
线上证据在 `Q:\NAVA-Workspace\Build\TestRuns\nava-v108-public`。发布后
`npm run auth:verify:production` 再次通过；严格
SMTP 仍因未提供 Management token 而未检查。

## 29. 2026-09-06 阿里云短信生产故障定位与单函数修复

用户提供的阿里云控制台证据已经确认：当前 RAM 用户拥有
`AliyunDysmsFullAccess`，新的 AccessKey 处于启用状态且已被 `Dysmsapi` 实际调用，旧 Key
已禁用；短信签名处于“可用-正常”。Supabase Secret 的 SHA-256 摘要与当前启用的
AccessKey ID、精确签名文本分别核对一致，全程未读取、打印或写入 AccessKey Secret。
因此现有证据排除了仍在使用旧 Key、缺少 RAM 短信权限、Secret 多出引号/空格等原因。

修复前 production challenge 的真实 provider 错误持续为
`isv.SMS_SIGNATURE_ILLEGAL`，而不是权限不足、余额不足、IP 地域拒绝或 ACS3 签名错误。
本地 V3 signer 也通过阿里云官方固定向量。剩余的代码差异是旧实现把 SendSms 业务参数
放入 form body；本轮已改为与 SendSms 官方自签名示例一致的排序 canonical query，空
body 参与签名，并在 provider 失败时保留 `RequestId` 供后续精确追查。新增回归测试固定
中文签名、模板 JSON 和查询编码结果。

`npm run backend:test` 为 16/16，16 个 Edge Function typecheck 和
`npm run backend:verify` 均通过。只部署了 `aliyun-sms-send`，production 当前为 version 17、
ACTIVE、`verify_jwt=false`；没有部署 migration、其他函数或前端双站。线上无效手机号探测
返回预期 `INVALID_REQUEST`，证明新函数可达且入口校验生效，同时没有触发短信发送。

真实短信送达尚未由本任务验证，必须由用户在公开站点使用本人中国大陆手机号重新点击
“获取验证码”。若仍失败，应按新 challenge 保存的 provider error 与 `RequestId` 判断，
不能再笼统猜测为余额或权限问题。Supabase Edge 当前出站地域可能在签名问题解决后暴露
`isv.DENY_IP_RANGE`，但只有阿里云实际返回该码时才能认定，当前不能写成已发生。

## 30. 2026-09-06 待办直达专注与沉浸计时补全

`UtilityDrawer` 不再把整行点击都解释为完成：左侧圆钮只切换完成状态，正文和箭头进入
专注准备页。任务名、每次分钟数、计划次数及待办 ID 会贯穿准备页、进行中云端会话和最终
专注记录；已有用户计划优先，缺失计划使用 `focusPlanning.ts` 的确定性建议并写回当前用户
的 Supabase `tasks`，不会声称这是 AI 结论。

专注进行页通过 React portal 脱离手机壳祖先布局并固定覆盖整个视口；用户触发进入时会尝试
Fullscreen API，失败时仍保持应用内全视口沉浸。右上角提供屏幕常亮和全屏开关，默认在
沉浸态申请 Screen Wake Lock，切页、退出、卸载时释放，页面从后台恢复时重新申请。实际
锁屏常亮和浏览器 chrome 隐藏仍受设备/浏览器能力约束，不能仅凭无头测试声称所有真机都
支持。

新增规则/合同测试，并更新四视口记录编辑器回归：360x740、375x812、390x844、430x932
均验证沉浸层覆盖完整视口、标题/计时盘/控制区不重叠、常亮/全屏控制存在；`npm run verify`
28 个阶段与完整 interaction 11 组通过，后者还验证了抽屉待办跳转后任务名与 25 分钟建议
真实带入。

功能源码 commit `522a7126e5489b88325ee19fb7249923d34fbb66` 已从同一已 push 状态发布为
ChatGPT Sites v109 和 GitHub Pages v109；Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_38cd74697aa08191a64b33313014f4de`，
deployment ID 为 `appgdep_6a9d7eedbed881919e1d6576a88bfaf7`，Pages 镜像 commit 为
`71336f632bfb5fd593689523cbbfea3b10657d04`。两个公开站点在四个规定视口共 8 组
均返回 200、无横向溢出、显示真实登录页且 `?demo=1` 不可绕过；入口模块 SHA-256 均为
`f085ce96b0bcc7d565e08acafb2ec0da6b6319675771cc3eec57c7022b72f96a`。线上证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-v109-public`。

## 31. 2026-09-06 首页 Figma 背景复刻

首页新增 `home-scene-v1.png` 场景底图。该图由用户提供的 Figma 截图作为构图与风格参考生成，
只保留冰蓝虚化室内、竖向透光窗柱、斜向白光、圆形台面、半透明地台和底部弧形地面；手机
硬件、状态栏、文字、按钮、卡片、导航、猫咪和水印均被排除。`OptionTwoHome` 将其作为
`aria-hidden` 的独立装饰图层加载，真实数据组件、右侧快捷入口、动态建议、角色和底部导航
仍是独立可访问、可操作的产品层。

四个规定视口 360x740、375x812、390x844、430x932 均已验证底图完整加载并覆盖首页，
未引入横向溢出；首页加载态、五卡/六卡/空态、快捷入口、建议卡、健康圆盘、记录入口和导航
回归保持通过。视觉证据保存在
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-background-v110-20260906` 与
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-background-guidance-v110-20260906`。

功能源码 commit `af24ec36d276d8b3fe6b2a5fb940beae3870878f` 已从同一个干净且已 push 的状态发布为
ChatGPT Sites v110 和 GitHub Pages v110；Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_2c90b4490a8c819193b2adeaad3d3547`，
deployment ID 为 `appgdep_6a9d86942094819199b735d1dd603bbe`，Pages 镜像 commit 为
`2c8f4017e4740818b8cd8dd9bc31219479f21648`。两个公开站点在四个规定视口共 8 组
均返回 200、无横向溢出、显示真实登录页且 `?demo=1` 不可绕过；入口模块 SHA-256 均为
`fe2c7d6995998b94c8253482a15aa226aca6443ae8e6839de207fe3a4b750eca`，生成背景 SHA-256 均为
`390b8d3417dc1e35b43a2ffaaf0684298c777063dd7cb2c4684e907203c7766e`。线上证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-v110-public`。

## 32. 2026-09-07 首页像素复刻与桌面 iPhone 预览双轨

首页已按用户提供的 430×932 Figma 参考重新建立可测量的坐标合同：默认是心率单卡加
睡眠、运动、步数三卡的 `1+3` 排列，顶部保留两枚状态胶囊，右侧使用参考式快捷按钮，
底部是五按钮磨砂 Dock 和居中的 AI 对话主按钮；上滑后的六模块圆弧使用同一套白色心率
符号并按参考坐标展开。所有数值和辅助文案继续来自当前账号真实持久化数据，缺失值保持
缺失，不把参考图数字写进生产。首页编辑器保留最多六卡，但默认四卡顺序固定为
`heart, sleep, exercise, steps`。

场景更新为 `home-scene-v3.png`，角色更新为 `home-mascot-v5.png`；两者均是独立装饰层，
不会吞掉组件点击和可访问文本。首页状态、模块和底部导航图标改为本地 SVG/React SVG，
不依赖操作系统 emoji。`create-home-parity-grid.mjs` 会把实际截图和参考画面裁成同一
430×932 坐标系并输出 4px 网格及叠加图；默认态和六模块展开态的证据分别在
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-figma-parity-v111-20260906\grid-review` 与
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-guidance-figma-parity-v111-20260906\grid-review-expanded`。

浏览器桌面预览与真实产品画布现在是两条明确隔离的显示路径：只有同时满足宽高至少
700px、精细指针和 hover 的桌面环境才显示 `DesktopDevicePreviewChrome`。它提供外壳、
圆角黑边、侧键、设备本地实时时钟、Dynamic Island、蜂窝信号、Wi-Fi 和电量图标；应用内
通知会从灵动岛下方的系统保留区滑入。产品内容始终以原始 430×932 画布布局，矮电脑窗口
只对整台设备作统一比例缩放，不触发第二套卡片重排。触屏、窄屏、移动浏览器、PWA 和原生
App 中 `data-preview-only="desktop-device-chrome"` 保持 `display:none`，因此不会把模拟外壳
或模拟系统状态栏打包成产品界面。

`device-preview:visual` 已分别验证 1365×1000 桌面、1365×768 等比缩放桌面、桌面通知态
和 430×932 触屏产品态；外壳/内容同轴、灵动岛居中、首页坐标不变且移动端模拟元素为零。
证据在 `Q:\NAVA-Workspace\Build\TestRuns\nava-desktop-device-preview-v111-20260907`。
首页组件与建议视觉脚本在 360×740、375×812、390×844、430×932 四个产品视口通过；
完整 interaction 11 组、`npm run verify` 28 阶段和 production auth 合同也通过。

v111 上线后的公开未登录边界复核发现，登录/注册页由 `AppBootstrap` 直接渲染，原先只挂在
登录后 `App` 树中的桌面预览壳不会出现。v112 已把同一预览壳补到启动加载、配置错误、
未登录、登录过渡和会话恢复路径；登录后的产品页继续使用原有唯一实例，不产生双壳。
桌面登录页的语言按钮也下移到 64px 系统保留区之后，不再与 Wi-Fi/电量重叠。视觉脚本新增
未登录桌面和未登录触屏两项断言，证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-desktop-device-preview-v112-20260907`。

修正源码 commit `527ab338bc515c61016509bc416c3499431306a8` 已从同一已 push 状态
发布为 ChatGPT Sites v112 和 GitHub Pages v112；Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_752448391220819180f4b70c7ad53824`，
deployment ID 为 `appgdep_6a9dac04cde881919de3695dd8cb6e71`，Pages 镜像 commit 为
`705e36e7eef201d676d2b06582471c4f5f3fd316`。两个公开站点的 v112 入口模块 SHA-256
均为 `2cb80766ae9855f06c3c6cd24c06be2af7a3ca4634336188baec1df55294ccac`；公开桌面均显示
登录页、手机外壳和系统栏，430×932 触屏均不显示模拟外壳，`?demo=1` 不可绕过登录，
canonical Supabase project ref 保持不变。线上证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-v112-public`。

## 33. 2026-09-07 纵向需求补齐、专注维持与真实趋势提醒

本轮重新逐页检查用户提供的 15 页《纵向｜app需求文档暑期整理》，并以当前用户要求
覆盖文档中的 T0/T1/T2 排队限制：只要在现有前端和已授权数据合同内可以真实完成，就按
功能验收而不是优先级标签实施。完整复核记录与 15 页渲染证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-requirements-audit-20260907`。

专注沉浸页新增白噪音、粉噪音、棕噪音三种由 Web Audio 本地生成的背景声，音量控制、
10 秒进入状态动画和 25/45/60 分钟休息提示。屏幕常亮和浏览器全屏在不支持或申请失败
时不再静默失效，而是保留可操作入口并显示真实能力状态；应用内全视口沉浸与计时继续
可用。页面转后台会暂停并进入中断确认，用户可记录消息、来电、分心或其他原因；原因
统计随现有活动专注会话恢复，并写入最终专注记录备注，没有新增生产 schema。

待办超过 5 项时出现“AI 排优先级”入口，把当前账号真实待办送入已有真实 AI 对话；
模型被要求先澄清缺失截止期、重要性和工作量，不自动编造顺序。NAVA Sports 新增今日
建议、15 分钟舒展、25 分钟轻步行和 12 分钟恢复四项可选择预设，选择后只预填真实可
编辑运动记录，不冒充已完成运动。

提醒规划器继续只读取当前登录用户的真实 TodaySnapshot、TrendBundle 与 ChronoState，
新增短睡眠下的轻量专注/运动、连续低情绪、情绪大幅变化、连续晚睡、相对个人近期基线
的运动负荷与饮食变化、以及非诊断面部趋势提醒，并按优先级最多保留 6 条。应用内横幅
按 Apple 官方通知信息层级改为 NAVA 图标、应用名/“现在”、短标题与一至两行正文；
支持点击打开、上滑关闭和 8.5 秒自动收起。页面在前台时不再重复弹出浏览器系统通知。

`npm run verify` 全部 28 阶段、`npm run auth:verify:production`、通知四视口、
记录编辑器/专注沉浸四视口、PRD 六模块四视口和全应用 interaction 11 组均通过。
通知证据在 `Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v113-20260907`；
线上证据在 `Q:\NAVA-Workspace\Build\TestRuns\nava-v113-public`。

功能源码 commit `807033df2f4dcbe49e9447d80fec3c07810d8e54` 已从同一干净且
已 push 的状态发布为 ChatGPT Sites v113 和 GitHub Pages v113；Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_7cfcb7ff7ff48191a24592de95215a53`，
deployment ID 为 `appgdep_6a9dbdadd9f8819195935e4327dd06c5`，Pages 镜像 commit
为 `c21da4fd5f7b660d89638fe7b0f9055a7f601534`。两个公开根 URL 均返回真实登录
门，公开 `?demo=1` 不可绕过，canonical Supabase project ref 保持
`wxteapvwagvhhtrjrbim`；桌面预览壳与 430×932 触屏产品路径均无横向溢出。
两种托管使用不同构建模式，所以产物哈希不同；线上校验逐站实际加载并确认新版专注功能
字符串和数据边界存在，不用错误的“两个压缩文件必须字节相同”代替行为验证。

本轮没有执行 migration、Edge Function 部署、secret 修改或生产用户写入。仍未写成完成
的项目是：iPhone 真机锁屏/后台通知、APNs/FCM/HMS 远程推送、Android/华为原生壳、
需要 schema 的运动活动会话和酸痛/疲劳/伤病独立字段、以及缺少验证模型的恢复时长预测。

## 34. 2026-09-07 运动恢复闭环与原生远程推送源码

本轮继续完成上节明确遗留且能在仓库内真实实现的功能。NAVA Sports 的四类计划现在可
真正开始、暂停、继续、结束或放弃；计时依据 wall clock，活动状态同时写入本地离线缓存与
当前账号 `active_user_sessions`，刷新、换页或同账号设备可恢复。结束不会直接制造运动完成
记录，只把实际运行分钟和计划说明带入运动编辑器，由用户确认后保存。

运动编辑器新增 1–5 运动感受、0–10 酸痛、0–10 疲劳、伤病开关/说明、恢复状态复测，
以及由实际分钟、可选心率、上述自评和已记录睡眠生成的保守恢复时间范围。结果包含置信度、
规则版本与可审计依据，明确标注非医疗建议；伤病或高不适只触发停止加重负荷和寻求专业
评估的安全提示，不输出诊断。`202609070004_exercise_recovery_loop.sql` 扩展运动表和活动
会话类型，并已应用 production。

应用内提醒补齐按场景反馈：运动可选择调整/恢复/仍需恢复，情绪、饮食、面部也有各自
确认和稍后动作；反馈写回 `user_notifications.target` 并跨设备同步。规划器新增低饮水、
未恢复复测、面部记录空档和面部低分叠加短睡眠/低情绪的保守提醒，仍只读取当前账号真实
数据，最多输出六条且不注入生产示例。

原生远程推送源码现在包含：iOS APNs 注册桥与 capability、Android Capacitor 工程和
`nava_general` channel、APNs/FCM token 注册、账号级停用、通知点击深链、
`push_device_tokens`/`push_delivery_receipts` RLS 与级联删除，以及使用独立内部 secret 的
`push-dispatch`。派发函数覆盖 APNs token auth、FCM HTTP v1 和 HMS，provider 明确判定
token 失效时停用设备，并按通知/设备写幂等 receipt。更新后的账号导出源码覆盖 42 张
账号表。

2026-09-07 获得明确后端授权后，`202609070004`、`202609070005` 已应用，源码与 canonical
production 均为 26 个 migration；更新后的 `export-user-data` production v24 和新
`push-dispatch` production v1 均为 ACTIVE。内部调度 secret 与 APNs/FCM/HMS secret 仍未配置。Windows 环境缺少 JDK，Android Gradle 未能编译；iOS 仍需
Mac/Xcode/Apple Developer Team，华为客户端仍需 HMS SDK、`agconnect-services.json` 和真机。
这些不是“函数已上线所以送达已通过”，仍必须在提供平台凭据后编译并做真机验收。

本地 `npm run verify` 30 个阶段全部通过，包含四档记录编辑器、完整业务合同、17 个 Edge
Function typecheck、云端完整性、运动恢复和远程推送静态合同；`npm run
auth:verify:production` 继续确认 canonical project、公开登录门和禁用 demo bypass。
升级后的只读 `npm run supabase:verify-shared` 已恢复全部 READY：新运动字段、两张推送表、
`push-dispatch`、既有 Auth/表/函数/Storage 均可访问，数据库 schema lint 无错误。
Android `gradlew` 也已尝试，当前唯一启动前阻塞是系统没有 Java/JDK，未把未编译状态写成
通过。

## 35. 2026-09-07 全应用布局与真实数据呈现复核

本轮没有只复核首页，而是把首页默认态与六模块圆盘展开态、月历、日报、通知、组件编辑、
详细资料、AI、记录中心、六类记录编辑与二级页、周报、成长和个人资料共 35 个页面/状态
放入同一浏览器回归，在 360×740、375×812、390×844、430×932 四个规定视口生成 140 张截图。截图脚本除横向
溢出外，新增专注待办上下轨道不得重叠、运动设备卡不得留下异常内部空洞、组件排序必须
符合首页 `1+3` 槽位，以及详细资料不得显示 `under_5h`、`almost_none`、`none` 等云端
原始枚举的可执行断言。圆盘展开态还验证六个按钮均可见，且模块顺序和身份必须精确为
运动、饮食、睡眠、面部、专注、情绪。发布门禁证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-release-gate-20260907`。

实际修正包括：专注待办标题与时间/分钟控件的网格高度和间距；运动设备二级页取消强制
撑满整屏，并展示真实运行环境、Apple Watch 配对/可达、Health 授权和最后同步状态；首页
组件排序页按最终首页槽位预览；个人资料首屏取消卡片内部人为撑高；详细资料把 onboarding
和 Supabase 中的睡眠、运动、饮食 canonical 值映射为可读且可继续编辑的控件，同时保留
未知旧值，避免仅为了显示而破坏原云端资料。网页预览会明确显示不能直接读取 HealthKit，
不会把不可用能力写成已同步。

本地 `npm run verify` 30 个阶段全部通过；全应用 interaction 11 组逐项确认圆盘六模块的
按钮身份、`record` 路由、模块参数与完成/未完成分流，并确认底部五项根路由、目标页面和
选中态一致；首页组件、首页推荐、通知中心和桌面 iPhone 预览也分别通过四档或对应桌面/触屏验证。这里的“真实数据”结论
限定为代码合同、读写路径、空值处理和 production schema 探测，不等同于擅自查看某位
生产用户的私有内容。

后续获得明确后端与双站发布授权后，canonical Supabase 已应用 `202609070004`、
`202609070005`，并部署更新后的 `export-user-data` 与新 `push-dispatch`；只读 readiness
探测恢复全部 READY，数据库 lint 无错误。内部调度 secret、provider secret 与真机推送送达
仍是独立外部验收项。

## 36. 2026-09-07 后端升级、双站 v114 与线上复核

在用户明确授权生产后端与双站发布后，canonical Supabase 已应用 append-only migration
`202609070004_exercise_recovery_loop` 与 `202609070005_remote_push_devices`，本地/远端
26 项历史完全对齐。`export-user-data` production v24（JWT）与 `push-dispatch`
production v1（内部调度鉴权）均为 ACTIVE；`npm run supabase:verify-shared` 的 Auth、核心表、
APP 扩展表、函数和 Storage 全部 READY，`supabase db lint --linked --level warning` 无错误。
已存在的 secret 名称复核确认没有 `NAVA_PUSH_DISPATCH_SECRET` 或 APNs/FCM/HMS provider
凭据，因此远程推送只完成了 production 结构和函数部署，仍不能宣称真机已经收到。

发布源码 commit 为 `f79a9aa7a7b5f2c8e38d98e3f93d78c91cf4f388`。该提交先推送到
GitHub 与 Sites 源码仓库，再从同一干净状态构建两个产物。ChatGPT Sites v114 version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_678073216a788191b1f88e3eae4413d8`，
deployment ID 为 `appgdep_6a9e467f19b081918764d16296480567`，状态 succeeded；GitHub Pages
镜像 commit 为 `f327a34157cacedb685a19df4d6af75b0a06d11e`，`source.json` 指向相同
source commit 与 Sites v114。

线上两站均返回 HTTP 200，并实际加载 v114 的 `index-BszBi6go.js`；真实浏览器复核登录、
注册、找回方式、验证码登录、返回登录和中英文切换，双站均无 console warning/error，且
`?demo=1` 保持真实登录门。登录后的私有页面没有借用或伪造生产账号；同一发布提交另行通过
完整 `npm run verify` 30 阶段和 `npm run interaction:test` 11 组，精确覆盖首页六模块圆盘、
底部五导航、十一个成长入口、六个周报入口和其余业务交互。四档 35 状态共 140 张视觉证据
继续位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-release-gate-20260907`。

## 37. 2026-09-07 首页健康圆盘 v115 校准与双站发布

根据补充的展开前、展开后设计截图，本轮把首页健康入口拆成两个可独立验收的稳定态：
收起态只保留底部低矮圆角胶囊和五个主导航按钮，不显示圆盘或六模块按钮；展开态使用
宽度为页面 120% 的完整圆形，其顶缘位于页面高度约 71%，圆心落在页面下边缘附近，形成
从底部胶囊后方向上展开的圆润扇面。六个模块按钮按三层左右对称弧线放置，并由运动、
饮食、睡眠、面部、专注、情绪六个真实模块图标取代重复的心率占位图标。底部四个小圆与
中央 AI 大圆继续使用一个共享圆心水平线，中央聊天图形和四个主导航图形做了光学校准。

`scripts/verify-navigation-icons.mjs` 现在分别截图并断言收起态和展开态，覆盖 360×740、
375×812、390×844、430×932 四个规定视口；它会检查收起态圆盘不可交互、底部胶囊宽高和
圆角、六个模块图标唯一、按钮圆形且无遮挡、三层弧线左右同高、圆盘顶缘/宽度/圆心比例、
五个底部按钮圆心同线，以及中央 AI 图形比例。稳定截图证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-wheel-v117-20260907`。完整 `npm run verify`
30 阶段、`npm run interaction:test` 11 组和发布前后 `npm run auth:verify:production` 均通过。

功能源码 commit `a26fe18269bc8303556c3e7b641b45669a7935d9` 已同时发布为 ChatGPT Sites
v115 和 GitHub Pages v115。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_62ec18d8cdd08191ade3ff6d1422c603`，
deployment ID 为 `appgdep_6a9e7fa53f508191ab9eb17b7bf973f5`，状态 succeeded；Pages 镜像
commit 为 `bbf59225d5b4eda90b92d9f2928f51ee609891d4`。两站均返回 HTTP 200，并实际加载
同一组 `index-DiZW3Ogp.js` / `index-BTA7zPHo.css` 内容；线上样式探测确认两站都包含
圆盘 `width: 120%`、`top: 71%` 和共享底栏圆心变量，公开 `?demo=1` 仍不能绕过真实登录门。
图像生成仅用于一次结构校准草图，没有把生成位图作为产品圆盘或导航实现；最终界面仍由
可测量、可响应、可交互的 HTML/CSS 和现有本地模块图标组成。

## 38. 2026-09-07 首页圆盘像素复核与双站 v116

根据圆盘局部参考图再次进行等比例叠图，本轮保留用户指定的六个真实模块图标，其余展开态
继续向参考收敛。圆盘宽度由 120% 收至 98%，顶缘位于页面高度 69%；猫咪在展开时随圆盘
平滑上移，让鼻口保持在圆盘顶沿上方。六个模块按钮增至最多 56px，并继续按三层左右对称
弧线排列。底栏高度收至 70px，中央 AI 圆增至最多 100px，四个外侧圆增至最多 49px；
五个按钮共享同一圆心水平线。外侧图标按各自 SVG 的视觉墨迹单独校准，不再出现首页、
记录、成长和个人图标大小失衡；颜色统一为深蓝灰，未选中按钮改为半透明冰蓝。

`scripts/verify-navigation-icons.mjs` 的圆盘几何门禁同步为 98% 宽、69% 顶缘，并继续在
360×740、375×812、390×844、430×932 四种视口验证收起/展开、六模块唯一图标、无遮挡、
左右对称弧线、五按钮圆心同线和 AI 图形比例。最终视觉证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-wheel-v123-20260907`。完整 `npm run verify`
30 阶段、`npm run interaction:test` 11 组和 `npm run auth:verify:production` 均通过。

功能源码 commit `4889f699dcae24ac0cef05379915ac26a300e3b7` 已由同一已 push 状态发布为
ChatGPT Sites v116 与 GitHub Pages v116。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_817bcfe771b48191a77dd573ae83cd67`，
deployment ID 为 `appgdep_6a9eb7cc804c819182f3d654c7a4d45f`，状态 succeeded；Pages
镜像 commit 为 `7681cd99ccae24f0048935f6fe04e3e617decd98`，在线 `source.json` 指向同一
源码 commit 与 Sites v116。两个公开 URL 均返回 HTTP 200，线上产物均包含新版圆盘
`width: 98%` 与 `top: 69%` 样式；canonical Supabase、生产 secrets、migration 和
Edge Function 均未在本轮修改。

## 39. 2026-09-07 桌面设备居中、安全顶栏与单一展开圆盘 v117

本轮把桌面浏览器预览壳改为真正按视口双向居中：1365×1000 时手机上下空隙均为
34px；1365×768 的缩放预览上下空隙均约为 26px。桌面 iPhone 壳内新增明确的系统安全
顶栏轨道，动态岛底缘与业务页头之间保留 16px；资料页标题、返回按钮和右侧动作控件的
圆心均为 137px。原生/窄屏路径继续使用 `safe-area-inset-top`，没有把桌面模拟状态栏写入
最终 APP 内容。

月历、当日综合报告和首页组件编辑页移除了页面标题上方的小字，只保留“我的月历”、
“当日综合报告”和“选择小组件/调整首页顺序”单行标题。自动化在 360×740、375×812、
390×844、430×932 四个规定视口逐页断言标题、左侧返回和右侧动作处于同一水平中线，且
不存在横向溢出。相同标题结构已完成源码扫描；卡片内部用于解释字段或数据的辅助小字不
属于页面标题，继续保留。

首页展开态的底栏胶囊背景现在完全退场，圆盘自身成为六个模块按钮和五个底部导航共用的
唯一玻璃表面；收起态仍只显示低矮圆角胶囊。圆盘、猫咪、六个真实模块图标和五个导航
圆心的既有几何保持不变。回归测试会分别断言收起胶囊可见、展开胶囊透明且无阴影，避免
再次出现圆盘和底栏分离的接缝。

本地 `npm run verify` 30 阶段、`npm run interaction:test` 11 组与
`npm run auth:verify:production` 均通过；设备安全区证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-device-safe-area-v117-20260907`，首页圆盘证据
位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-home-wheel-v124-20260907`。功能源码
commit `59520bc9ecff1f5d0da4f55cf03d7420ef715e1f` 已发布为 ChatGPT Sites v117 与
GitHub Pages v117。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_cf44eab448d88191ac47a3aa9a9fdff4`，
deployment ID 为 `appgdep_6a9ec7377cb0819199afbcd4606eeeae`，状态 succeeded；Pages 镜像
commit 为 `5fe594704c5237f6d790250fb52d8f0eebb839c5`。两个公开 URL 均返回 HTTP 200，
均加载 `index-D4JiTcga.js`；线上 CSS 包含居中、安全顶栏和展开态单一表面的新版规则，
两个站点的真实浏览器均无 warning/error，公开 `?demo=1` 继续停留在真实登录门。本轮没有
修改 Supabase、认证配置、短信/模型 secret、migration、Edge Function 或生产用户数据。

## 40. 2026-09-07 Apple 全机型桌面预览矩阵 v118

桌面开发预览新增右上角机型选择器，目录按代际完整覆盖 18 款：iPhone 14、14 Plus、
14 Pro、14 Pro Max；iPhone 15、15 Plus、15 Pro、15 Pro Max；iPhone 16、16 Plus、
16 Pro、16 Pro Max、16e；iPhone 17、iPhone Air、17 Pro、17 Pro Max、17e。每个选项
都独立保存 Apple 官方技术规格中的物理像素、屏幕尺寸和产品特征；预览器显示物理像素，
并以 @3x 推导对应的逻辑画布尺寸。这个逻辑点数是实现推导值，不冒充 Apple 另外公布的
CSS viewport 数据。

切换机型会同时改变手机宽高比例、圆角、安全顶栏、刘海或灵动岛、静音拨片或操作按钮，
以及 iPhone 16/17 系列相应机型的相机控制键。iPhone 14、14 Plus、16e、17e 走刘海结构；
其余目录机型走灵动岛结构。浏览器中的外壳、状态栏和 Home indicator 仅属于桌面开发预览，
在 900px 以下和真实移动端路径中均隐藏，不会被打包成 APP 产品界面。选中机型保存在本地
浏览器偏好中，不触碰用户账号或 Supabase 数据。

实现依据为 Apple Human Interface Guidelines 的 Layout/safe-area 原则、Apple Design
Resources，以及每款机型对应的 Apple Support 技术规格页。自动测试验证 18 个唯一机型、
4/4/5/5 代际数量、像素到逻辑点的 @3x 对应、刘海/灵动岛互斥、状态栏同轴、机身居中、
选择器在手机外、侧键差异和相机控制键条件；真实产品布局另在 360×740、375×812、
390×844、393×852、402×874、420×912、428×926、430×932、440×956 九档视口复核。
本轮证据位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v118-20260907`。

功能源码 commit `1d10b9fadef8682a531deb473e23bca976a0524e` 已由同一干净、已 push
状态发布为 ChatGPT Sites v118 与 GitHub Pages v118。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_dc40f0ceb49c8191be81dddcb04e7f6d`，
deployment ID 为 `appgdep_6a9edacd2374819181a1d978b4e530a3`，状态 succeeded；Pages
镜像 commit 为 `57c2d0b023af56b9ffb2c01268ad5df5837a74e5`，在线 `source.json` 指向同一
源码 commit 与 Sites v118。

本地 `npm run verify` 31 阶段、`npm run interaction:test` 11 组、
`npm run auth:verify:production` 和 `npm run device-preview:visual` 均通过。线上两站都返回
HTTP 200，并实际加载 `index-C3nJ5ZRh.js`；产物均包含 18 款目录和选择器标记。真实浏览器
线上复核确认桌面选择器可见、切换到 iPhone 17e 后刘海结构生效、移动端选择器隐藏，且
普通未登录访问与 `?demo=1` 均停留在真实登录门，无 console error。线上截图位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v118-online`。本轮没有修改 Supabase、
认证配置、secret、migration、Edge Function 或生产用户数据。

## 41. 2026-09-08 共享安全页头、快捷入口语义与双站 v119

本轮将业务页头与桌面预览的系统安全区统一到同一套节奏：桌面模拟壳中，刘海或灵动岛
底缘到资料页、通知中心、月历、日报和首页组件编辑页单行标题的可见间距，由约 44px
收至 21.6–24.6px。18 款 iPhone 预览机型均经过几何断言，标题、左侧返回与右侧动作的
圆心误差不超过 1px；360×740、375×812、390×844、430×932 等真实移动视口继续使用
原生 safe area，而不是把桌面模拟状态栏写进产品页面。通知中心标题改为语义化单行
`h1`，资料页和共享业务页头同步受同一规则约束。

首页右上角三横线现在只负责展开或收起右侧快捷入口，不再兼任通知跳转；未读红点和
“消息通知”入口移至展开列表最后一个铃铛按钮。六个快捷入口仍保留各自真实模块图标。
单个页头动作（资料页、报告日期、通知中心更多操作及通用卡片右上角跳转）移除了可见
圆形/圆角矩形底色和阴影，同时保留至少 36px 的点击热区。交互测试断言快捷栏共有六项、
三横线可往返展开/收起、最后一项铃铛进入通知中心，避免再次混淆两个职责。

本轮 `npm run verify` 31 阶段、`npm run interaction:test` 11 组、
`npm run icons:test`、`npm run notification:visual`、`npm run device-preview:visual` 与发布前后
`npm run auth:verify:production` 均通过。35 个业务状态 × 4 个规定视口共 140 张完整视觉
证据位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-release-gate-v119-20260908`；通知专项证据
位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v119-20260908`；18 机型与九档
移动视口证据位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v119-20260908`。

只读 `npm run supabase:verify-shared` 复核 canonical project
`wxteapvwagvhhtrjrbim` 的 Auth、核心/扩展表、共享/APP Edge Functions 和 Storage 均为
READY，代码和生产契约确认这些可视化具有真实的 Supabase 读写路径；本轮没有读取私有
生产用户记录，也没有修改 migration、Edge Function、secret、认证配置或生产数据。远程
APNs/FCM/HMS 真机送达仍取决于 provider 凭据和真机验收，不能由结构检查代替。

功能源码 commit `7db7e5574f2cc9309fe28b8953b09941f8940b05` 已由同一干净、已 push
状态发布为 ChatGPT Sites v119 与 GitHub Pages v119。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_e43d0ba34e788191aa3be6c4196256e7`，
deployment ID 为 `appgdep_6a9ee712fecc8191b04b16f095f17452`，状态 succeeded；Pages
镜像 commit 为 `e10a64109e65df8dea960612c33dfd44f1457622`，在线 `source.json` 指向相同
源码 commit 与 Sites v119。两个公开 URL 均返回 HTTP 200，并实际加载同一组
`index-BpM-kRqH.js`、`App-CRNNL-qr.js` 与 `index-CQ3FbzUu.css`；在线内容探测确认新版
安全页头样式、快捷栏收起文案和消息通知入口均已生效，公开 demo 绕过继续关闭。

## 42. 2026-09-08 Apple 官方几何校准与双站 v120

本轮不再按宽度区间猜测设备顶栏，而是逐款核对 Apple Support 技术规格中的物理像素与
逻辑点画布，并从 Apple Design Resources 的 iPhone 14、15、16、17 Product Bezels
读取屏幕开孔和状态栏几何。Apple iOS 27 UI Kit 的 402×62 状态栏母版用于复核 17pt
SF Pro Semibold 时间、Cellular、Wi-Fi 与 28×13pt 电池的内部关系；iPhone 16e、17e
开孔使用 Apple Dimensional Drawings 中 64.58×139.77mm 有效显示区与
26.79×5.58mm 开孔比例映射到 390×844pt 画布。由官方素材量测或按官方工程图换算的值
在选择器中明确标记为“实测校准”，没有冒充 Apple 单独发布的 API 常量。

18 款预览现在各自保存开孔 x/y/宽/高、状态栏中轴、时间 x、蜂窝/Wi-Fi/电池 x 与宽度、
安全顶距、圆角和 Home Indicator。此前所有刘海机型共用 210pt 的错误已修正：
iPhone 14/14 Plus 为 171.333pt，iPhone 16e/17e 为按工程图换算的 161.785pt；
iPhone 17/17 Pro 的灵动岛顶距为 14.333pt，17 Pro Max 为 14.667pt，iPhone Air 为
20.333pt，因而不再把 Air 的岛和状态栏错误上提。右上角开发选择器显示上述精确值，并
新增可开关、可持久化的 1pt 校准网格（每 10pt 加粗）。网格和模拟机身只在桌面开发预览
出现，900px 以下的移动/PWA 路径仍只使用系统 safe area。

`npm run device-preview:visual` 对 18 款目录以 0.1pt 容差断言机身居中、开孔、时间、三项
状态图标及 Home Indicator，并复核 9 档移动视口、资料页、通知页、月历、日报和首页组件；
证据位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v120-20260908`。
完整 `npm run verify` 31 阶段、`npm run interaction:test` 11 组、`npm run icons:test`、
`npm run notification:visual` 与发布前后 `npm run auth:verify:production` 全部通过。通知页
四档证据仍位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v119-20260908`。

功能源码 commit `4c7f80397c0e548667f2ab32c6ae550ab7d5b2b5` 已从同一干净且已 push
状态发布为 ChatGPT Sites v120 与 GitHub Pages v120。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_ac422c46890c8191bbdb71b04e023b5f`，
deployment ID 为 `appgdep_6a9f008b09a48191a9de6376946ab688`，状态 succeeded；Pages
镜像 commit 为 `59bc44ff7f16b7d7bfd834d7e485d9294c5af9fc`，在线 `source.json` 指向相同
源码提交与 Sites v120。两站均返回 HTTP 200 并加载 `index-CqqEE0Hf.js`；线上浏览器实际
切换 iPhone Air 与 iPhone 14、开关 1pt 网格均成功，公开普通入口和 `?demo=1` 均停留在
真实登录门。本轮没有修改 Supabase、认证配置、secret、migration、Edge Function 或生产
用户数据。

## 43. 2026-09-08 首页六槽位长按拖拽

首页四张核心健康卡现在可直接长按约 440ms 进入类似 iPhone 主屏编辑的抖动态。两行三列
共 6 个固定槽位会同时显现；拖动卡片时卡片抬起、最近槽位高亮，松手可落入空位或与已有
卡片交换。点右上角“完成”或按 Escape 退出，普通轻点仍进入原健康模块；键盘可用
Shift+Enter 进入编辑并用方向键移动。`prefers-reduced-motion` 会停用抖动但保留全部功能。

位置偏好继续复用 `user_app_preferences.home_widget_ids` 的 JSON 数组，不新增 migration：
新版用 6 项数组中的 `null` 表示空槽，旧版紧凑数组会无损迁移；本地离线缓存和 Supabase
排队同步仍走原有合同。独立“编辑首页”页继续承担增删组件和显式保存流程。

实现参考 Apple 官方“长按后项目抖动、拖至同页其他位置、结束编辑”的主屏行为，以及
Apple HIG 对拖放可访问替代方式的要求；同时复核 dnd-kit 的触摸 delay/tolerance、
touch-action、最近目标和键盘坐标方案。由于这里只存在 6 个稳定槽位，最终使用现有 React
Pointer Events 实现，没有为了小网格新增拖拽依赖。

`npm run home-widgets:test` 当前 10 项通过；`npm run home-widgets:visual` 在 360×740、
375×812、390×844、430×932 四档实跑普通点击、440ms 长按、6 槽位显示、空槽拖放、刷新
持久化、Shift+Enter/方向键替代和编辑退出，证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-widget-drag-v121-20260908`。完整 interaction
11 组也已通过，首页上滑圆盘、右侧快捷栏和底部导航未回退。

双站已从同一个功能提交 `e41e6f4f3dfbde0895a11e19997118236d633034` 发布：ChatGPT
Sites v121 version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_aa8695156a0881918f20c5fce99c7306`，
deployment ID 为 `appgdep_6a9f0d5c78888191bfee1f3711ad7b4e`，状态 succeeded；GitHub
Pages 镜像 commit 为 `19b7617bbd1cfe0e04e27f3e8595686c7e3c020d`。两站均返回 HTTP
200、加载同一 `App-BUlB1LyL.js` 拖拽实现和 `index-BQXnkHT9.css` 视觉样式；Pages
`source.json` 已核验为 v121。无登录的新浏览器访问两站的 `?demo=1` 仍停留在真实登录页，
没有出现公开 demo 绕过。

## 44. 2026-09-08 全页面与加载态几何审计、双站 v122

本轮把视觉验收从“截图存在”升级为可失败的几何审计。`scripts/capture-figma-pages.mjs`
现在会在每个业务状态检查多行文本行高、文字裁切、交互控件横向越界、非预期控件重叠、
共享页头左右操作与标题中轴，以及同一纵向模块栈的重叠和异常留白；仅为首页吉祥物、引导
气泡和快捷组件之间经产品设计允许的覆盖关系保留明确豁免。最终矩阵覆盖 57 个状态 ×
360×740、375×812、390×844、430×932 四个规定视口，共 228 张截图，其中 140 张为
成型页面、88 张为加载页面；0 个几何错误，受跟踪模块栈最大间距约 16.04px。报告位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-figma-pages\report.json`。

加载态不再只用一个通用占位：六个记录详情页分别使用情绪、睡眠、运动、饮食、专注、
面部对应的真实结构骨架；首页加载态复用正式首页的背景、1+3 健康组件网格、顶部积分、
引导气泡、真实吉祥物位置和底部导航。首页组件排序页由硬垂直居中改为从安全区下方稳定
向下排布，避免矮屏顶底挤压；资料页移除了按屏高不断放大的外边距，并压缩隐私卡片内部
无效留白，退出按钮不再半截藏在固定导航后面。奖励浮层会在加载态采集前关闭，避免遮挡
目的页面骨架。

完整 `npm run verify` 31 阶段、`npm run interaction:test` 11 组、`npm run screenshots`、
`npm run device-preview:visual`、`npm run home-widgets:visual`、
`npm run notification:visual` 与发布后 `npm run auth:verify:production` 均通过。专项证据分别
位于 `Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v120-20260908`、
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-widget-drag-v121-20260908` 和
`Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v119-20260908`。

功能源码 commit `73321af4af5f831c3d0cdc0d319da41e58e90f27` 已从同一干净且已 push
状态发布为 ChatGPT Sites v122 与 GitHub Pages v122。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_f2e6af4e116c819188ffcc184ce0f16f`，
deployment ID 为 `appgdep_6a9f7a268bc881919fa3e41cfad3e431`，状态 succeeded；Pages
镜像 commit 为 `abd857e6abfe0d7c76d2b5d852d6ea16604073fb`，在线 `source.json` 已核验为
v122 并指向同一源码提交。两站均返回 HTTP 200，实际加载同一
`index-BHSX1uk6.js`、`App-B-uPe6pf.js` 和 `index-Hs5E6ZBR.css` 内容哈希；在线无登录
浏览器访问普通入口及 `?demo=1` 均显示真实登录页且无控制台错误。生产认证仍指向
canonical Supabase project `wxteapvwagvhhtrjrbim`。本轮没有修改 migration、Edge
Function、secret、认证配置或生产数据。

## 45. 2026-09-08 新用户引导与六类记录页收口、双站 v123

新用户首次画像问卷现已完整纳入桌面 iPhone 预览的机型画布和安全区，不再把内容绘制到
模拟机身之外。性别题改为三个纵向、等宽的整行选项：男、女、暂不透露，分别使用明确
区分的 Mars、Venus 与隐藏信息图标；引导流程中的装饰小猫已全部移除。单选题点选后约
320ms 自动进入下一题，多选题仍须达到可提交条件后点击下一步。两项单选题也统一采用
纵向大卡片，不再在窄屏中横向挤压。

情绪、睡眠、运动、饮食、专注、面部六类记录编辑页移除了独立日期卡。每个主卡标题均为
无底色的模块图标加标题，日期入口固定在同一标题行右端；睡眠原有三个快捷动作、饮食四个
食物快捷动作、专注与面部模式动作继续保留并为日期图标让位。对应六类加载骨架同步采用
相同的页头和字段结构。运动伤病/恢复区与保存动作重新留出稳定间距；饮食图片分析态在
矮屏中压缩预览高度，保存按钮不再被固定导航遮挡。

`npm run verify` 31 阶段、`npm run interaction:test` 11 组、
`npm run device-preview:visual`、`npm run screenshots` 和发布后的
`npm run auth:verify:production` 均通过。全页面矩阵覆盖 57 个正式/加载状态与
360×740、375×812、390×844、430×932 四档视口，共 228 张截图、0 个几何错误，证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-full-page-audit-v123c-20260908`；桌面 iPhone
新用户引导证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v123-20260908`。

功能源码 commit `398b8346c80c8e6431cb257bc12f0c0e9e50ccc8` 已由同一构建发布为
ChatGPT Sites v123 与 GitHub Pages v123。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_a019ed6741108191882c2eecbe85a671`，
deployment ID 为 `appgdep_6a9fa9b9492c8191a21b5f0efa73e3d5`，状态 succeeded；Pages
镜像 commit 为 `2346c82a93cacf3a90097636604859d443778ab5`，在线 `source.json` 已核验为
v123 并指向上述源码和 Sites 版本。两站均返回 HTTP 200，线上与本地的
`index-CMJiDAt1.js` SHA-256 完全一致；公开 demo 绕过继续关闭，canonical Supabase
project 仍为 `wxteapvwagvhhtrjrbim`。本轮没有修改 migration、Edge Function、secret、
认证配置或生产数据。

## 46. 2026-09-08 每日 AI 会话、底部安全区与双站 v124

AI 对话现在以设备本地日历日为会话边界。页面保持打开跨过午夜、从后台返回、进入 AI
页面，或在换日后首次通过文字、拍照、语音发送时，都会先把旧会话持久化到
`ai_conversation_archives`，确认成功后再按当前用户和消息 ID 从活动
`ai_conversations` 中移走旧消息；当天从空白新会话开始。用户也可在同一天多次手动创建
新会话。历史列表显示 8–10 个汉字或 3–6 个英文词的短标题、日期和独立删除键，历史打开
后为只读并可返回今日会话。只有 `ai_personalization_consent` 为 true 时才通过现有、已认证
的 `ai-chat-reply` 对最多 12 条/2,800 字符的旧会话生成标题；未同意、模型不可用或输出
不合规时使用 `9月8日 AI 对话`、`9月8日 AI 对话之二` 等日期兜底。现有归档表无需新增
migration：日期和标题作为版本化 `__navaArchive` 首项写入 JSONB，读取时剥离，并兼容
旧版纯消息数组。

首页组件长按编辑不再显示右上角“完成”；拖放后点击任意无功能的背景空白即可保存并退出，
卡片、按钮、输入和链接不会误触退出，Escape 和键盘移动替代方式仍保留。周报表头已由
`有记录日节律均值` 收敛为 `日节律均值`。AI 前端清单已逐项复核 20 个报告文案位置：
六个模块趋势洞察、六个模块概览反馈、六个记录中心紧凑摘要、一个节律总览和一个周节律
洞察；另有 AI 对话、饮食/面部视觉识别与两个专注 AI 入口的独立真实函数链路。

底部导航统一遵守 Home Indicator 安全间距。首页圆盘与普通业务页的中间 AI 圆钮，其底缘
到 Home Indicator 顶缘的空隙与 Indicator 到屏幕底边的 8pt 空隙对称；普通四个圆钮也
至少保留同等呼吸空间。此前通用 `nav-settle` 动画会在结束后覆盖位移，本轮已对普通页面
AI 圆钮停用该冲突动画。`npm run device-preview:visual` 对 18 款 iPhone 同时断言五个底栏
按钮、开孔与状态栏几何，并复核移动/PWA 不泄漏预览机壳；证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v124-20260908`。首页空白点击专项
覆盖 360×740、375×812、390×844、430×932，证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-widget-tap-finish-v124-20260908`。

发布门槛全部通过：`npm run verify` 31 阶段、`npm run interaction:test` 11 组、
`npm run screenshots`、`npm run device-preview:visual`、`npm run home-widgets:visual`、
`npm run auth:verify:production` 与只读 `npm run supabase:verify-shared`。全页面矩阵仍为
140 个正式状态加 88 个加载状态，共 228 张、4 个规定视口、0 个几何错误，最大受跟踪
模块间距 16.04px，报告位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-figma-pages\report.json`。共享项目继续为
`wxteapvwagvhhtrjrbim`，Auth、核心/扩展表、共享/APP Functions 与 Storage 均为 READY。

功能源码 commit `805a02acd4f13e68fdbfd297e0293da9844d97a1` 已从同一干净、已 push
状态发布为 ChatGPT Sites v124 与 GitHub Pages v124。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_5921fd5407948191951c95ec9eda522c`，
deployment ID 为 `appgdep_6a9fbfa673c481919f1aba94748f7098`，状态 succeeded；Pages
镜像 commit 为 `be7c4985664b5e338f70f199c4dfabfa7e6439e9`，在线 `source.json` 指向上述
源码与 Sites 版本。两个公开站均返回 HTTP 200，并加载同一 `index-Bvklywxx.js`，线上与
本地 SHA-256 均为 `07cb738b003eb64e9e9ba652defe39eecd8d5c7b7f6ef30222bf785aeb0aaa9c`；
无登录浏览器访问两站的 `?demo=1` 均停留在真实登录页且无 console error，证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-v124-online`。本轮没有修改或部署 migration、
Edge Function、secret、认证配置或生产用户数据；真实账号下的 AI 标题内容质量仍需人类
账号验收，结构与失败兜底已自动化验证。

## 47. 2026-09-08 积分商城、AI 新会话开场与全局安全区收口

积分商城已从占位入口升级为完整前端流程：商品列表按一行一件展示，商品详情支持横向滑动
多图和分页点，购物车支持数量调整与删除，售罄商品统一灰阶、水印且禁止加入购物车。
production 暂无真实商品时显示四张不可购买的“商品待上架 / 定价：待填写”运营占位，不把
假商品、假价格或假库存冒充真实数据。右侧首页快捷菜单中的购物车图标直接进入商城；抽屉
内商城入口也已启用。

canonical Supabase 已应用 migration `202609080001_reward_shop.sql`。新增商品、购物车、
订单和订单明细表，并通过 RLS、列级授权和三个 security-definer RPC 保护数据：商品真实
库存不下发到浏览器，购物车只归当前账号；结算使用用户级事务锁、按固定顺序取得商品行锁、
幂等请求 UUID，并在同一事务内核验积分/库存、扣减、写订单和清理购物车。并发争抢最后库存
时不会超卖。`export-user-data` production 已升级到 schema 1.3.0，覆盖新增的购物车、订单、
订单明细；当前账号归属 public 表总数为 45。没有 seed 生产商品，也没有用真实账号发起
积分扣款，因此自动化只证明结构、权限探针和事务合同，不冒充真实购买验收。

AI 当日新会话不再显示空白提示。首次进入、跨日归档、手动新建和清空后都会写入一条真实
assistant 问候，并在睡眠、饮食、运动、心情和今日安排间稳定轮换一个简短问题；现有历史
归档与 AI 自动命名合同继续保留。`ai-chat-reply` 的生产提示已明确：用户分享状态或回答含糊
时通常补一个容易回答的聚焦追问；已完成的事务动作和紧急安全回复不强行追问，且每次最多
一个问题。

桌面机型选择卡正面只保留机型下拉与 1 pt 校准网格；右上角纯手机图标可原位 3D 翻面，
背面按当前机型显示物理分辨率、逻辑画布、灵动岛/刘海、状态栏定位和校准依据。普通子页的
共享顶部安全区再次压缩，页头更靠近灵动岛但仍保留最小呼吸距离；共享底部导航增高并整体
上提，中间 AI 圆钮与上方分界线、下方 Home Indicator 均保留独立间距。内容滚动底部余量
同步增加，避免最后一个操作被新导航高度遮住。

验证已通过：完整 `npm run verify` 31 阶段、`npm run interaction:test` 11 组、
`npm run shop:test`、`npm run shop:visual`、`npm run device-preview:visual`、
`npm run auth:verify:production`、`npm run supabase:verify-shared`、Edge Function typecheck/
tests 与 production `supabase db lint`。商城/机型卡专项覆盖桌面及 360×740、375×812、
390×844、430×932 四个移动视口，证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-shop-v125-20260908`；共享 Supabase 探针报告位于
`artifacts/backend-review/shared-supabase.json`。`ai-chat-reply` 与 `export-user-data` 已部署
production。

功能源码 commit `40a8025c3078085753c3a59f317cc7197f5e674a` 已从同一干净、已 push
状态发布为 ChatGPT Sites v125 与 GitHub Pages v125。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_b13d3f149d508191994e8d8d775b2b94`，
deployment ID 为 `appgdep_6a9fdefc0cb481918a6ce338ed306ba5`，状态 succeeded；Pages
镜像 commit 为 `4611641a2d72e34f1a3d57c1f769545d2f88c648`，在线 `source.json` 已核验为
v125 并指向同一源码和 Sites 版本。两站均返回 HTTP 200；Sites 在线入口脚本
`index-DfiSsCDU.js` 与保存的 Sites 包 SHA-256 同为
`6cc78d368f35f0220ea61837839e5a82a61cf85c36f4d80d1ffdb420d7011d34`，Pages 在线入口脚本
`index-o2TdTvT6.js` 与本地 Pages 构建 SHA-256 同为
`a8ceeee7a3daf4427ee43db121906456e9525851005ace382efdb221822b58ca`。全新无登录浏览器访问
两站的 `?demo=1` 均显示真实登录页、未进入 App 且无 console error；截图证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-v125-online`。

## 48. 2026-09-08 首页圆盘完成动效、通知/奖励与规格卡自适应

首页展开圆盘的六个真实模块入口现已直接呈现当天 `TodaySnapshot` 完成状态。未开始保持
蓝底原模块图标；部分完成显示从 12 点方向顺时针绘制的绿色外环，例如饮食记录一餐即为
1/4；达到模块既有当天完成标准后，外环先转满，再错峰过渡为绿底白色对勾。环形动画只在
圆盘展开时播放，`prefers-reduced-motion` 仍保留终态并把动画压至 1ms。按钮的
`data-module-progress`、读屏文案和点击后“未完成进编辑 / 完成进详情”路由继续共用
`healthReportPresentation.ts`，没有另造一套前端假进度。

应用内通知横幅维持 90pt 触控高度，但图标增至 42pt、字级小幅放大，图标与应用名/时间、
标题和正文组成的内容组均按横幅中轴垂直居中，不再全部挤在上方。成长奖励去掉
“情绪记录完成”等模块名中间行；“积分”与实际 `+N` 使用相同 26px 字级。中文主标题把
感叹号移出居中宽度计算，使“做得｜漂亮”的词间中缝与卡片水平中轴重合；无障碍名称仍
保留完整感叹号文本。

桌面右上角机型规格卡不再把背面写死为 262px。组件使用当前可见正/背面的真实
`scrollHeight` 与 `ResizeObserver` 更新卡片高度，保留 3D 翻面和高度过渡；规格参数最后
一行下方只保留 13px 左右的标准内边距，换机型或文字换行时会自动重新测量。

完整 `npm run verify` 32 阶段和 `npm run interaction:test` 11 组通过。专项视觉证据：

- 通知四视口：`Q:\NAVA-Workspace\Build\TestRuns\nava-notifications-v126-20260908`
- 首页/记录进度四视口：`Q:\NAVA-Workspace\Build\TestRuns\nava-module-progress-v126-20260908`
- 机型预览、通知与奖励：`Q:\NAVA-Workspace\Build\TestRuns\nava-iphone-preview-v126-20260908`
- 规格卡与商城：`Q:\NAVA-Workspace\Build\TestRuns\nava-shop-v126-20260908`

自动门禁会量取通知内容中轴、圆环可见度/进度 offset、完成对勾终态、中文奖励主词中轴
（误差不超过 0.75px）、“积分”和 `+N` 字号一致性，以及规格卡最后一行的 12–18px
底部余量。

功能源码 commit `3a538efa0be0f41dc39c9f5ac34cef7c5c710e42` 已从同一干净、已 push
状态发布为 ChatGPT Sites v126 与 GitHub Pages v126。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_1899367ec3b88191bd91a927bd66a41c`，
deployment ID 为 `appgdep_6a9ffd43c4308191a37d8ee7ee554b76`，状态 succeeded；Pages
镜像 commit 为 `be0356800dfacf113aa319beb288ccb83dc5ed60`。两站和 Pages `source.json`
均返回 HTTP 200；Sites 在线入口 `index-VR44-nwZ.js` 与保存包内文件 SHA-256 同为
`d316aa2a5f6fbc5a5750178bbc465db304c9302a35106d33fd10badaa96468fd`，Pages 在线入口
`index-BX1F6lh3.js` 与本地构建 SHA-256 同为
`a6ec12c8737ebc7d5cfe08c1ca7796b0b7cc4086568fb4b0b2de75945a698463`，在线 CSS
`index-DPDtGXnW.css` 与本地构建 SHA-256 同为
`4ce516d0cbfbd1256e9be3ec6e4cf2097fba40974da95ff0374c7575f03f57cd`。发布后
`npm run auth:verify:production` 通过：两站仍指向 canonical Supabase
`wxteapvwagvhhtrjrbim`，公开 `?demo=1` 绕过保持关闭。本轮未修改或部署 migration、
Edge Function、secret 或生产用户数据。

## 49. 2026-09-08 六模块总览排版与真实 AI 失败链路收口、双站 v127

本轮按六类记录页共同合同处理，没有把截图只当作情绪单页修补。情绪总览标题由
“今日情绪摘要”收敛为“今日情绪”，并移除“下方强度将同步今天”的说明行；九个影响
因素改为占满内容宽度的五列方形选择卡，保留多选状态和 `aria-pressed`。日记入口不再
把正文挤进按钮：空状态显示“写下今天的情绪日志”，已有正文显示“查看 / 修改今天的
情绪日志”。

情绪、睡眠、运动、饮食、专注、面部六个完成后总览统一改为内容高度和 8–10px 模块
节奏。各模块自身卡片、真实 AI 即时反馈和两个跨模块入口都处于正常滚动流；滚到底部时
AI 卡和快捷入口均能完整停在固定底栏上方。新增
`scripts/verify-module-overviews-ui.mjs`，逐一要求六个模块的 AI 卡达到 ready 状态、文本
不裁切、无横向溢出、模块间距连续，并对情绪方格和日记状态文案做专门断言。

AI 失败根因之一是模型已返回有证据、可用的完整报告，却可能只因次级 `compactBullets`
没有精确满足七个汉字 / 2–4 个英文词而整体被丢弃。`ai-health-report` 与
`ai-diet-report` 现在从同一模型生成的紧凑标签或正常 headline 做有界格式归一，不新增
事实，原有证据核验、关联置信边界和结构校验不放宽。前端同时读取 Edge Function 的安全
错误正文，显示具体失败原因与“重新生成”，不再把登录、限流、provider 和格式错误全部
折叠成“真实 AI 暂时不可用”。两函数已部署到 canonical Supabase：
`ai-health-report` ACTIVE version 18、`ai-diet-report` ACTIVE version 15，均为
`verify_jwt=true`。生产下载源码与本地部署源码逐文件 SHA-256 一致，未认证请求均返回
401；未修改 migration、secret 或生产用户数据。真实账号首次生成、写入缓存及改数据后的
失效重算仍需持有安全登录态的人工验收，不能仅凭部署冒充通过。

验证结果：完整 `npm run verify` 32 阶段、`npm run interaction:test` 11 组、
`npm run backend:test` 16 项、`npm run supabase:verify-shared`、
`npm run auth:verify:production` 均通过。六模块专项为 6 模块 × 4 视口共 24 个顶部/底部
状态，证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-module-overviews-v127-20260908`；全页面正式态与
加载骨架仍覆盖 228 张截图，位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-figma-pages-v127-20260908`。

功能源码 commit `b8e285163e135c6a39310bc01c3acb42c57a7641` 已从同一干净、已 push
状态发布为 ChatGPT Sites v127 与 GitHub Pages v127。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_e8d685058b8c8191aa36fd985533809c`，
deployment ID 为 `appgdep_6aa0158af64c8191a441b68148267dda`，状态 succeeded；Pages
镜像 commit 为 `25055883051cbbdb3c979c8ad450b39287c47821`，在线 `source.json` 已核验为
v127 并指向同一源码和 Sites 版本。两站均返回 HTTP 200，公开 demo 绕过保持关闭，
canonical Supabase project 仍为 `wxteapvwagvhhtrjrbim`。

## 50. 2026-09-09 首页完成环、卡片文案与底栏光学对齐、双站 v128

首页六模块完成态的 SVG 圆环改为使用实际半径计算完整周长，不再因为固定周长只绘制约
四分之三圈；完成态会完整转满后再切换为绿色底、白色对勾。首页卡片的结果和值说明改用
可收缩网格和受控换行，长文案不再从卡片右侧或底部裁掉。底部五项导航改用相等边距的
flex 分布，四段中心距和左右边距保持一致，并按图形视觉重量统一五个图标的光学尺寸。

验证通过完整 `npm run verify`、`npm run interaction:test` 11 组、
`npm run device-preview:visual`、`npm run screenshots` 228 状态和
`npm run auth:verify:production`。功能源码 commit
`7581ee866a6aa65d752e4f0d47cf8abd40235a82` 已发布为 ChatGPT Sites v128 与
GitHub Pages v128。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_cf295ee9b96081918c05a92447bc0ed5`，
deployment ID 为 `appgdep_6aa0a05865f88191bf55faa570e5e9b2`，状态 succeeded；Pages
镜像 commit 为 `72915fd`。

## 51. 2026-09-09 AI 对话附件输入栏与双站 v129

AI 对话输入栏现固定为四段：左侧附件 `+`、中间文字输入、右侧麦克风与发送。点击附件
入口会显示相册照片、文件和摄像头三项；展开时 `+` 旋转为关闭符号，点击外部或按 Escape
可收起。照片入口沿用真实视觉识别和结构化确认流程；摄像头请求后置相机；文本、Markdown、
CSV 和 JSON 文件会先显示可移除的文件暂存条，可单独发送，也可与用户问题一起进入真实 AI。
文件正文不会显示在聊天气泡中，并在模型提示里明确标记为不可信参考数据而非指令。

照片限制为 JPEG、PNG、WebP 且最大 10 MiB；文本文件最大 2 MiB，送入模型的正文最多
12,000 字符。限制只在选择不合规附件时以错误状态反馈，没有把技术参数长期堆在输入栏。
语音手势同时从“上滑拍照”收敛为“上滑取消”，拍照职责只属于附件菜单。新增单元测试覆盖
格式、大小、空文件、正文边界和提示注入隔离；交互测试覆盖三项菜单、文件暂存/移除、
摄像头文件选择、照片识别及原有语音和历史会话。

验证通过完整 `npm run verify` 32 阶段、`npm run interaction:test` 11 组、附件/AI 提示
21 项、四视口全页面 `npm run screenshots` 232 状态和
`npm run auth:verify:production`。人工复核了 360×740 与 430×932 的附件菜单及文件暂存
状态，未见横向溢出、裁切或底栏挤压。依赖审计同时把间接依赖 `js-yaml` 从 4.3.1 升至
4.3.2，当前 `npm audit` 为 0 漏洞。

功能源码 commit `1b7aaf3e4687832a23be271b2b60869d7cac6787` 已从同一干净、已 push
状态发布为 ChatGPT Sites v129 与 GitHub Pages v129。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_b0bd88e8c2048191ad282645a0ed4639`，
deployment ID 为 `appgdep_6aa1404bb0fc8191ac1664771e538611`，状态 succeeded；Pages
镜像 commit 为 `9d2b72f17937599c03a3c73b7a42e52db46cd69f`。两站返回 HTTP 200，Pages 在线
`source.json` 已核验为 v129 并指向上述源码与 Sites 版本；Sites 在线制品和 Pages 在线
CSS/AI 懒加载代码均已核验包含附件入口。本轮未修改或部署 migration、Edge Function、
secret、认证配置或生产用户数据。

## 52. 2026-09-09 底部导航可见边缘等距与双站 v130

首页玻璃胶囊与普通子页底栏均从“中心点大致等分”改为按按钮圆形的可见边缘分配空隙。
普通子页使用固定 44 px 次级圆与 76 px 中央 AI 圆，通过 `space-between` 让四段圆边缘
间距一致，第二、第四项不再向中央大圆聚拢；窄屏分别使用 40 px / 66 px，并保持同一
约束。首页同时把玻璃胶囊左右边缘纳入计算，覆盖“胶囊左缘—五个圆—胶囊右缘”六段
空隙，首尾按钮不再贴住或越出圆角区域。中央选中态移除额外缩放，避免点击后破坏已校准
的圆边界。

`scripts/verify-navigation-icons.mjs` 新增首页六段边缘空隙与子页四段边缘空隙的数值断言，
在 360×740、375×812、390×844、430×932 四种视口通过；截图位于
`Q:\NAVA-Workspace\nava-app\artifacts\navigation-icons`。验证同时通过完整
`npm run verify` 32 阶段、`npm run interaction:test` 11 组、
`npm run device-preview:visual` 和 `npm run auth:verify:production`。
底栏发布后又补跑了正式页与目标态加载页的全量扫描：四视口共 232 个状态、0 个
溢出或页面错误，版本化证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-figma-pages-v130-20260909`。

功能源码 commit `1ca810a06f47874e464719dfb83afac2738816d9` 已从同一干净、已 push
状态发布为 ChatGPT Sites v130 与 GitHub Pages v130。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_78cd12b4ffbc819181fcca56e8f3f802`，
deployment ID 为 `appgdep_6aa14a9c214481919b68aa10a9741dfe`，状态 succeeded；Pages
镜像 commit 为 `c47329d456cd69f3b3b5a52788b2bdb0fb3ba43d`。两站返回 HTTP 200，Pages
在线 `source.json` 已核验为 v130 并指向上述源码与 Sites 版本，线上 CSS 已核验包含
首页边缘间距及 flex 等距规则。本轮未修改或部署 migration、Edge Function、secret、
认证配置或生产用户数据。

## 53. 2026-09-09 年度打卡、首页组件节奏与 AI 失败可见性、双站 v131

“我的日历”月历下方新增全年打卡热力图：按周一开头的一周一列呈现 1 月 1 日至
12 月 31 日，完整标出十二个月和周一至周日，支持切换年份且禁止前进到未来年份。
每个日期的 0–4 级颜色来自当前账号六类真实记录的当天覆盖数；查询按日期范围分页，
不伪造记录。360×740、375×812、390×844、430×932 四个视口均要求 365/366 个真实日期、
12 个月、7 个星期标签完整可见，且热力图不碰固定底栏。

首页六个健康组件统一了标题、主值和辅助说明的垂直节奏。标题与内容之间保留更明显层级，
主值与说明之间不再挤在一起；未记录、已记录和长文案状态共用同一套可收缩布局并通过四视口
裁切/溢出门禁。

截图所示“真实 AI 洞察暂不可用”并非前端未调用 AI，而是旧趋势卡把服务端具体失败折叠成
通用文案。六模块趋势与总览现在保留服务端安全错误正文并提供“重新生成”。
`ai-health-report` 已更新为 `deepseek-v4-flash-health-report-v7-retry-resilience` 并明确部署为
canonical Supabase ACTIVE version 19、`verify_jwt=true`：总预算 65 秒、最多三次有界尝试，
会对网络、408、429 和 5xx 短暂故障重试，结构修复继续携带上一稿和非敏感错误码；鉴权、
余额、限流和超时返回可操作但不泄密的具体原因。生产下载源码与本地 SHA-256 一致，未认证
请求由 JWT 边界返回 401；`DEEPSEEK_API_KEY` secret 名称存在。本轮仍没有安全的真实用户
登录态，因此不能把 provider 成功生成、写入缓存与缓存失效重算冒充为已验收。

验证通过完整 `npm run verify` 32 阶段、`npm run interaction:test` 11 组、
`npm run calendar:visual`、`npm run home-widgets:visual`、AI/backend 合同与
`npm run auth:verify:production`。年度日历证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-calendar-year-20260909`，首页组件证据位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-home-widgets-v128-20260908`，生产函数审计位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-ai-production-v19-20260909`。

功能源码 commit `08b140c095b5961e4a178343c2ddfeac21762e62` 已从同一干净、已 push
状态发布为 ChatGPT Sites v131 与 GitHub Pages v131。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_c6cc67ff74a48191be6e330decf26e89`，
deployment ID 为 `appgdep_6aa17214c2788191a0a452e71253bf48`，状态 succeeded；Pages
镜像 commit 为 `551f870e2b8c318c58b30fcc80ba31bec80b3bcd`。两站返回 HTTP 200，在线
`source.json` 已核验为 v131 并指向上述源码与 Sites 版本；两站线上制品均核验包含年度
热力图、首页组件节奏和 AI 具体失败/重试代码，canonical Supabase 仍为
`wxteapvwagvhhtrjrbim`，公开 demo 绕过保持关闭。

## 54. 2026-09-10 授权账号历史补齐、真实饮食视觉链路与生产 AI 验收

经用户明确授权，本轮使用安全交互式脚本登录目标账号；账号标识和凭据没有写入源码、
日志、文档或命令行参数。2026-08-28 至 2026-09-09（含）已补齐并复核情绪、睡眠、
运动、饮食、专注、面部六类基础记录，以及专注时段分布、健康指标快照、结果反馈和
每日节律分。最终只输出完整度统计的生产审计显示：除专注同日可有多次记录外，十类表均
覆盖 13/13 天；所有要求字段缺失数为 0。2026-09-10 六类基础表合计仍为 0，保留给用户
当天手动验收。

修改后的 13 天每日节律分已全部通过真实 `rhythm-score` 重算；成长奖励 RPC 对账成功。
原 `fdnb-recompute` 56 天入口曾返回计算资源不足，随后改走同一正式分析服务的
`dnb-weekly-report` 14 天分析窗口，2026-09-03 至 2026-09-09 周报生成和饮食更新后的
再次重算均成功。空的 `daily_rhythm_scores.actions` 数组表示算法没有提出纠偏动作，
不是缺失值；完整度审计已按此持久化合同判断。

三张餐食测试图由内置图像生成能力创建并保存在
`Q:\NAVA-Workspace\Build\TestRuns\nava-account-history-20260909\meal-photos`。早餐、午餐、
晚餐图片分别通过 canonical 项目的私有 `diet-photos` bucket 和真实 `diet-extract`
（`qwen3-vl-plus`）识别出 3、4、4 项餐食；结果写入 2026-09-09 的饮食记录后，
`ai-diet-report` 成功生成四条真实摘要，并重新触发节律与 FDNB。浏览器历史日期控件在
自动化操作中未把 2026-09-09 状态提交给 React，首次 APP 上传因此落到 2026-09-10 的
私有路径；该唯一且与本地午餐图字节大小完全匹配的误上传对象已删除，未写入 9 月 10 日
饮食表。

真实账号也完成了两轮六作用域 `ai-health-report` 验收。情绪、睡眠、运动、专注、面部、
周报均成功到达生产函数及模型修复循环，但每个作用域最终都返回“AI 未返回有效的结构化
健康报告”，没有写入 v7 结构化报告；现有四条 v1 旧报告也未被伪装为新成功结果。
这证明当前剩余问题是生产模型输出与严格结构化/证据合同的系统性不兼容，而不是账号记录
缺失、未登录或前端没有调用。修复需要单独修改并部署 `ai-health-report` Edge Function；
本轮没有获得生产 Edge Function 部署授权，因此没有越权发布或放宽证据与安全校验。

新增的安全工具覆盖完整度审计、缺失手工字段补齐、派生重算、真实 AI 边界验收及三餐照片
导入。它们均通过交互式 SecureString 读取账号信息，进程结束后清除环境变量，只输出数量、
成功状态和安全错误，不输出账号标识、访问令牌、密码或私密记录正文。本轮只修改这些运维
脚本与当前交接文档，没有修改 APP 前端、migration、Edge Function 或 secret，因此没有
触发 v132 双站发布。

## 55. 2026-09-10 ai-health-report v8 生产修复与六作用域真实验收

用户明确授权部署 `ai-health-report` 后，模型合同更新为
`deepseek-v4-flash-health-report-v8-derived-evidence-normalization`。修复没有放宽真实数据、
非诊断、相关不冒充因果和同账号授权边界：数字证据仍必须来自原始记录，或是后端可从这些
记录精确复算的日期跨度、样本数、均值、中位数、范围、标准差、首尾变化、有限比值、分钟/
小时换算及相关系数百分比。无法核对的数字继续被拒绝，并以只含校验位置和数字的安全问题码
进入最多三次的定向修复；过短标题只允许重用模型已生成的标题、解释和行动文案完成展示长度
归一化，不会由服务端新增健康结论。

第一版生产 version 20 已证明睡眠作用域能够成功，但其余五类仍在派生关联数字处失败；补充
可复算统计格式和具体数字修复码后，只再次部署同一个函数。最终生产状态为 ACTIVE version
21、`verify_jwt=true`，未登录 POST 返回 HTTP 401。真实账号随后强制刷新情绪、睡眠、运动、
专注、面部、周报六个作用域，6/6 均返回 provider `deepseek`、结构化四段报告和 v8
model version，并实际写入 `ai_health_reports`。完整度审计逐作用域确认六类均存在一条结构化
v8 报告；同轮现有 `diet-extract` 识别 4 项午餐、`ai-diet-report` 生成 4 条摘要也成功。

再次审计 2026-08-28 至 2026-09-09：十类业务/派生表仍覆盖 13/13 天，要求字段缺失均为
0；专注表因同日多时段为 14 行，其余各为 13 行。2026-09-10 情绪、睡眠、运动、饮食、专注、
面部六类基础表仍全部为 0，保留给用户当天手工测试。审计脚本同时修正 AI 行的时间排序并
输出所有结构化 model version，避免旧 v1 历史行被误标为“最新”。

后端验证通过 18 个 Deno 测试、17 个 Edge Function 类型检查、15 个周报合同测试、10 个
AI 摘要/入口测试、backend contract、安全扫描和 ESLint。函数源码提交为 `363e1b1`；本轮
只部署 `ai-health-report`，未部署其他函数、migration、secret，也没有前端代码变化或双站
发布。

在用户要求继续完成后，OPS-01 最后一项缓存边界也已闭环。新增安全验收器逐一检查六个
作用域：相同源数据先命中现有缓存；随后只把可再生成的 `ai_health_reports` 指纹临时标记
为过期，不修改情绪、睡眠、运动、饮食、专注、面部或画像源数据；下一次普通请求必须因
expected fingerprint 不匹配而生成新的 DeepSeek v8 报告；再下一次请求必须复用该新缓存。
六类的 `baselineReused`、`staleInvalidated`、`regeneratedCacheReused` 共 18 项均为 true，
最终 `allPassed=true`。首次演练遇到一次模型 `json_parse` 瞬时失败，恢复分支按设计还原了
原报告；验收器随后加入一次有界整请求重试。第二次演练还发现 UTC `Z` 与 `+00:00` 字符串
表示不同但时刻相同，已改为按时间戳毫秒比较后完成最终验收。安全启动器继续通过
SecureString 传入账号凭据并在进程结束清理环境变量，输出仅含作用域、布尔结果、provider
和 model version。
缓存演练后的最终完整度审计再次确认十类表仍为 13/13 天、要求字段缺失为 0，六类报告
仍各有结构化 v8 行，2026-09-10 六类基础表合计仍为 0。

## 56. 2026-09-10 首页小猫气泡时段文案与排版

首页小猫建议气泡不再长期重复单一专注提示。`buildHomeGuidance` 保留真实睡眠、ChronoState
行动、步数和专注时长的优先级，在表达层按设备本地的清晨、白天、傍晚、夜间选择文案池，
并由首页每次挂载时生成的稳定随机种子选取同一时段内的不同句子。专注完成一项即包含
4 个时段 × 3 条、共 12 条中英文表达；其他状态也有对应短句，夜间未完成专注不再鼓励
继续开新工作块，而是提示收尾和休息。随机变化只影响表达，不改动或虚构用户数据。

气泡正文改用 `ui-rounded` / `SF Pro Rounded` 优先的圆润字体栈，中文回退到系统苹方或
微软雅黑；字号由原 10.5–11.5px 提升到 13.5–15px，字重提升到 700。正文在气泡内水平、
垂直居中，仍限制为两行且保留原气泡尖角、位置和点击路由。首页专项测试新增 12 条专注
文案的时段/随机/真实分钟断言，以及字号、字重、字体族、水平居中和垂直中轴断言；
360×740、375×812、390×844、430×932 四档均需通过，无横向溢出或导航碰撞。

## 57. 2026-09-13 用户提供的小猫动画与双站 v133

用户提供的 `gif.zip` 含 22 段 GIF，逐段查看关键帧和动作含义后才接入：14 段首页
待机、伸懒腰、蝴蝶互动、思考、阅读、哈欠、打盹、翻滚、鼓脸与玩鱼等；2 段用于
加载/下拉刷新；6 段分别为情绪写日记、睡眠、运动举重、饮食、专注电脑和面部护理。
首页点击小猫优先播放当天真实 guidance 对应动作，随后轮播其他动作；六模块趋势
报告、面部结果、专注沉浸及相关空态按语义替换原静态图。原静态图仍用于用户选择
“减少动态效果”或动画加载失败时的回退，分享卡的静态导出路径没有改动。

原 ZIP 约 577 MB，不直接放进 APP；22 段均转为透明多帧 WebP，合计 19,162,224
字节，单段最大约 2.3 MB，按实际页面使用才加载。`npm run verify` 32 阶段、
`npm run interaction:test` 11 组、六模块总览四视口、首页四视口与减少动态效果回退、
`npm run auth:verify:production` 均通过；22/22 文件确认是多帧动画。关键帧审看与
转换脚本证据在 `Q:\NAVA-Workspace\Build\TestRuns\mascot-gif-review`，首页实测证据在
`Q:\NAVA-Workspace\Build\TestRuns\nava-mascot-gif-20260913`。

功能源码 `73e0b72f80ff31a0e3057bca319bd25437941d87` 已 push，并从该提交生成
Sites v133 与 GitHub Pages v133。Sites version ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_c1182c384d088191bce70b5f33e4aa58`，
deployment ID 为 `appgdep_6aa69fd7e6e48191bc77f54aa4c99005`，状态 succeeded；
Pages 镜像 commit 为 `37f71f783ea63a1472aa885bec0b6128d0e62ee1`，在线
`source.json` 指向同一源码提交。两个公开站点的真实浏览器均通过登录门、公开 demo
隔离，并对全部 22 份线上动画与本地构建逐文件核对 SHA-256 一致。
本轮没有修改 Supabase、Edge Function、migration、secret 或生产用户记录。

## 58. 2026-09-13 授权账号补齐至 09-12 与饮食四维度核验

用户明确授权继续补齐目标账号至 2026-09-12（含）。安全脚本通过交互式 SecureString
登录，不将账号凭据写入仓库、命令行或日志。2026-09-10 至 09-12 原先十类表均为空；
本轮为三日补入情绪、睡眠、运动、饮食、专注、面部，以及专注时段分布、健康指标快照、
结果反馈和正式 `rhythm-score` 派生数据，并通过正式 14 日 `dnb-weekly-report` 与奖励
RPC 重算。最终三日十类表各有三行，要求字段缺失数均为 0；2026-09-13 六类基础表仍
全部为 0，留给用户亲自测试。

九张餐食和三张同一虚构人物的面部图片是明确的**合成测试素材**，位于
`Q:\NAVA-Workspace\Build\TestRuns\nava-account-history-20260912\synthetic-images`。
每张餐食图经私有 `diet-photos` 和生产 `diet-extract` (`qwen3-vl-plus`) 识别后保存；
面部图经私有 `face-photos` 和生产 `face-analyze` (`qwen3-vl-plus`) 分析后保存，
面部记录带 `synthetic_test_image` 标识。它们不应被误认为用户本人真实照片或医学事实。

登录公开 APP 实测曾见 09-12 饮食进度 `3/4`，原因不是 Supabase 表结构错误：
一日一行 `nutrition_records` 内有早餐、午餐、晚餐、加餐四组独立条目、时间与营养信息；
当时加餐确实为空。随后在 APP 内逐日补入加餐，09-10 至 09-12 四餐均有项目、时间、
营养小结，三餐照片也齐备。新的安全完整度审计逐餐检查字段，并验证每日日总热量、蛋白质、
碳水、脂肪和饮水量等于四餐之和；三日全部通过，APP 六模块均显示完成。

六种 `ai-health-report` 作用域在三日均有 DeepSeek v8 结构化报告；改变饮食源数据后，
三日普通读取六作用域仍全部成功。`ai-diet-report` 生产 v6 曾在当前数据上三日重生成
全部返回“四条有效饮食洞察”格式错误，旧反馈不能算当前有效摘要。经用户再次明确授权，
v7 把 B1–B4/C1–C4 的主题、JSON 结构、正文 15–18 汉字和小卡七汉字逐项写入提示词，
模型输出预算提升至 500 tokens，最多三轮；失败时以每项实际字数和前一轮模型草稿定向
修复，不放宽数据来源或输出合同。生产函数第一次部署 version 16 后 09-10 和 09-12
成功、09-11 仍失败；增加只含字数问题码的安全错误后再次部署，同一代码合同最终为
ACTIVE version 17、`verify_jwt=true`。09-11 再次真实模型调用成功。

三日的普通非强制刷新均返回 DeepSeek v7、四条正文；安全审计逐日确认四条正文均为
15–18 汉字、四条小卡均为七汉字，源指纹存在，三日全部成功持久化。登录后的公开 APP
依次打开 09-10、09-11、09-12 饮食页，均看到不同的真实 AI 即时反馈；没有手写摘要
入库。`npm run verify` 全部 32 阶段、生产认证合同、17 个 Edge Function 类型检查、
18 个 Deno 后端测试及 10 个 AI 双摘要合同测试通过。本轮只部署 `ai-diet-report`，
没有数据库迁移、secret、其他 Edge Function 或 APP 前端变更；两个站点共享这一生产后端，
不需要对未变动的前端重复打包发布。相关安全脚本仅输出日期、数量、状态与无正文错误。
公开 APP 的旧浏览器会话一度显示登录提示，退出再登录后正常调用；未据此假定已证实的
前端鉴权实现缺陷，也未改变 sessionStorage 的当前标签页会话策略。

## 59. 2026-09-14 授权账号补齐至 09-13、AI 会话修复与热量估算修正

用户授权继续补齐至 2026-09-13（含）。安全脚本的最终审计从 08-28 至 09-13 共
17 日：情绪、睡眠、运动、饮食、专注、面部、专注时段、健康快照、结果反馈和节律分
十类表均覆盖 17/17 天，缺日和必填字段缺失为 0；专注因同日多时段为 18 行。饮食
17 天均具四餐、各餐时间、热量和三大营养素，每日汇总与四餐求和相符，饮食 AI
17/17 采用真实 DeepSeek v11 严格长度报告；六种健康报告作用域每个日期均至少
有一条真实 DeepSeek 结构化报告，当前新报告主要为 v9，09-01 面部保留有效 v8。
09-14 六类基础记录仍为 0，未替用户填写当天。09-13 的照片是已标识的合成测试素材，
非用户真实肖像或餐食事实。

追查公开 APP 一度出现 AI 登录错误的真实原因是账户审计/回填脚本每次调用
`auth.signOut()` 的全局退出，连浏览器中的有效会话一并撤销。所有账户安全脚本改为
`signOut({ scope: "local" })`，只结束脚本自己的会话；前端显式把当前 JWT 发送给
Edge Functions，后端 `requireUser` 使用请求 JWT 验证，失效时显示可操作的重新登录提示。
重新登录公开 APP 后，真实 AI 对话给出模型回复，09-13 六模块均显示完成，
09-07 至 09-13 的本周 AI 洞察显示实际模型报告。审计脚本运行后浏览器会话未再次
被撤销。测试期间产生了少量当日 AI 测试消息；未对用户历史对话做不可恢复删除。

用户提供的《纵向｜热量计算方法》作为产品技术参考而非操作指令。第一轮改进：
饮食识别提示词明确估算照片**实际可见**的份量，不套标准一份；对遮挡、油脂、酱汁
与不可见馅料降低置信度并询问关键不确定点。`diet-extract` 的聚合数值以项目相加为准，
项目营养来源标记 `vision_estimate`。饮食编辑器提供逐项克重与热量修正；克重改动
按比例复算该项营养，热量改动修正该项数值，随即重算餐次汇总并标记用户修正。
无数据库已核准来源时 UI 不冒充 USDA/FatSecret，现阶段也没有引入厂商授权或
数据库迁移。下一阶段若做可追溯营养库匹配，必须先验证供应商商业许可、中文复合菜
匹配和实测误差，再为成功匹配的每项保存来源 ID 与份量基准。

本轮功能源码 `8ba7372235707a9953cb91bad835eeb6a9fed68f` 已推送 GitHub，并由同一
提交构建、发布两个公开站点 v134。ChatGPT Sites 复用原项目，版本 ID 为
`appgprj_6a5de710811c8191af8ce2681358d518~appgver_faf459fc57fc81919c29a97fc41c2b3e`，
deployment ID 为 `appgdep_6aa7474b97908191a0c24cbe8cfd1252`，状态 succeeded。
GitHub Pages 镜像提交为 `b871f9385db1bc64b0741039a4af75ef7b26f5b1`，在线
`source.json` 的源码 SHA、Sites 版本与 v134 一致。两站在真实浏览器中均通过
正式 `cz91…` 账号登录并显示 09-07 至 09-13 的真实 AI 周报告；Sites 的 09-13
饮食页显示四餐、AI 即时反馈和逐项估算编辑器。浏览器只读取已生成的历史报告，
不能把这次页面浏览冒称为全部日期重新生成 AI。`npm run verify` 32 阶段与
`npm run auth:verify:production` 通过；本轮 `diet-extract` 生产函数再次使用
`qwen3-vl-plus` 成功处理一张已授权测试餐食图片。五个 Edge Functions 均为 ACTIVE
且启用 JWT：`diet-extract` v25、`ai-diet-report` v23、`ai-health-report` v23、
`ai-chat-reply` v33、`ai-extract-data` v26。没有数据库 migration 或 secret 变更。
