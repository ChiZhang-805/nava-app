# iOS 动态背景、角色动画与原生媒体

## 积分商城全屏结算动画（2026-09-27）

购物车和商品详情“立即兑换”统一进入同一条真实结算链路。点击确认后先显示核验态，
只有 `nava_checkout_reward_cart` 返回真实订单、扣分总额和余额后，才播放积分卡贴近
刷卡机、横向打印机出票、小猫收好票据及完成礼物页；失败会退出动画并显示原错误，
不会用动画伪造兑换成功。一次尝试固定复用同一个 request key，网络重试不会创建双单。

刷卡机、纸卷、横向打印机和票据按用户提供视频的关键帧比例重画为代码内 SVG/CSS，
不是任意矩形拼装；颜色改用 NAVA 深青蓝、薄荷和暖金。票据读取真实商品、数量、已用
积分、剩余积分、订单短码及设备时间。完成页继续复用同一个已解码的小猫 WebP，避免
阶段切换时移除重载；票据和完成页都不再出现旧积分弹窗。商品图仍以运营真实目录为准，
本轮没有伪造线上商品图片、销量、库存或订单。

普通动画在 360×740、375×812、390×844、430×932 验证完整刷卡、出票、小猫和完成
时序；目录中的18款 iPhone 竖屏配置逐机验证票据和完成页，共36张截图。减少动态效果
直接呈现稳定票据/完成状态，按钮、礼物和标题不会因动画延迟而消失。证据位于
`Q:/NAVA-Workspace/Build/TestRuns/points-shop-checkout/app`。这些是本地显式测试商品与
浏览器画布，不是生产订单、真实账号或物理 iPhone 证明；未部署数据库迁移或 Edge Function。

## 九套全屏完成场景与静默积分（2026-09-27）

所有 `RewardCelebration` 奖杯/积分增量弹窗已替换；六模块记录保存后的场景使用同一套
`public/journal/js/completion-scene.js`、CSS 与素材。完成页不显示积分或奖励规则文字，
Continue 使用本地 Nunito 圆润字体（随附 SIL OFL），没有箭头；没有强制定时关闭。

| 场景 | 入口/匹配 | 原动画 |
| --- | --- | --- |
| 01 薄荷花园 | 白天通用、画像、打卡等 | home-idle |
| 02 温室书房 | 阅读/学习专注 | home-read |
| 03 微风桌面 | 电脑/编程专注、待办、AI交流 | module-focus |
| 04 薰衣草角落 | 面部 | module-face |
| 05 晴暖餐桌 | 饮食 | module-diet |
| 06 活力庭院 | 运动 | module-exercise |
| 07 草地午后 | 睡眠 | module-sleep |
| 08 暖风花径 | 情绪 | home-butterfly |
| 09 夜色星窗 | 夜间通用奖励 | home-idle |

- 01 保留经用户纠正后的花园原画；02–09 是内置 imagegen 按三张参考板生成的独立
  887×1774 水彩/彩铅场景，位于 `public/journal/assets/completion/scene-02.png` 至 09。
  完整提示词与来源保存在 `Q:/NAVA-Workspace/Build/TestRuns/celebration-scenes/assets`。
  背景没有烘焙猫、标题或按钮，不将重绘称作像素级复制。现有猫动作与参考手绘姿势并非完全一致。
- 动画源文件未改帧，仍为原 GIF 转出的透明 WebP。每个场景根据真实透明边界、地面位置、
  桌面/草垫透视放置；艺术平面与猫同步 cover，文案和按钮另按视口/安全区约束。
  没有给猫增加光晕。前景边缘、轻微叶影/日光、花瓣/浮尘/星光持续运动；
  这是一幅分层场景，不是整张画面的视频或逐帧生成背景。
- 英文标题是可访问 SVG 逐笔路径书写，最终下划线完成后停止，不重复打字。
  减少动态效果时直接展示标题并关闭环境动效。保留猫的原始连续动作。
- 仅准备当前场景的背景与一只原生动图；记录书写时预取对应资源，无九场景整批解码、
  JS 帧缓存或多浏览器并行截图。退出释放场景 DOM，保留原 Continue 的保存门槛和回顾处理器。
- 其他奖励使用轻量 `completion.html`，仅通过同源 MessageChannel 传场景、语言、安全区
  和退出动作，不传 JWT、真实记录或积分数据。背景交互 inert；关闭恢复原焦点。
- 积分由真实账本处理，画面和 Continue 不调用奖励接口。Journal 自己显示完成页，
  父页面只静默核对，避免两层庆祝。同一动作得到的多个奖励合并为一个场景。
  账号切换后忽略前账号迟到的奖励结果；跨本地日期重新核对登录奖励。

验证入口：
`node --experimental-strip-types scripts/verify-completion-scenes.mjs`（九场景×24组尺寸）、
`scripts/verify-celebration-garden.mjs`（六条实际记录→保存→回顾 UI 流程）、
`scripts/verify-journal-rewards.mjs`（本地 PostgreSQL 合同）及 `tests/completion-scenes.test.ts`。
WebKit 分别设置 NAVA_SCENES_ENGINE / NAVA_GARDEN_ENGINE=webkit 和
PLAYWRIGHT_BROWSERS_PATH=Q:/NAVA-Workspace/Caches/playwright。证据在上述 TestRuns 目录，
React 外壳另外检查18个机型。全部是明确的本地数据夹具，不是生产账号或物理 iPhone 实测。

**数据库门槛未完成：** `202609270001_journal_growth_rewards.sql` 已编写并在本地 PostgreSQL
通过23项检查，仍待本轮明确批准后应用。远端迁移列表确认尚无此项。发布前端使用仅在
PGRST202（缺少新 RPC）时启用的旧合同兼容分支，其他错误直接报告；不能把兼容分支
描述为已上线新六模块积分。真实设备验收和整套旧回归仍未完成；整套 verify 目前在旧
media-feedback:visual 的相机入口选择器超时，与本轮场景专项测试分开报告。

双站前端已于本轮发布为 Sites v170，源码 `82f93b7a69f1cdeeab4dd727747454bdef724baf`。
每站25项相关资源和公开认证边界核验通过；发布回执见 `CODEX_HANDOFF_CURRENT.md` §97。
数据库迁移仍未应用，前端发布不代表新积分合同已生效。

## 安装版能力交付（2026-09-20）

Windows 负责实现和源码/浏览器验证；Mac 负责 Xcode 编译、签名和真机验收。当前不能
称为“已通过 iPhone 真机测试”。Apple 要求用匹配 macOS 的 Xcode，具体版本以
[官方兼容表](https://developer.apple.com/xcode/system-requirements/)为准；Capacitor 7
[官方支持](https://capacitorjs.com/docs/v7/ios)为 iOS 14+、Xcode 16+，发行时还须满足
当时 App Store SDK 要求，不为本轮擅自升级整套原生依赖。

### 拍照、照片与文件

- 安装版使用官方 `@capacitor/camera` 7.x；系统相机和 PHPicker 选图，不以网页相机
  模拟替代。餐食、面部、AI 附件、头像全部复用 `PhotoInput` / `CameraCapture`。
- `CameraCapture` 拍摄结果仍经预览、重拍、使用照片；只有确认才交给既有分析流程。
  系统选图只处理用户选中的一张，不扫描相册、不在进入页面时提前请求权限。
- 使用 URI 而非跨桥传整张 base64；原生处理方向、等比最长边1600、JPEG质量90，
  读取后检验JPEG头及10MiB限制。HEIC/Live Photo由系统选图解码为静态JPEG；实际
  iCloud未下载照片、有限相册权限和不同iPhone拍摄方向仍须真机验证。
- 一个系统选择器；取消无错误、无上传；权限拒绝可重试；页面卸载后忽略迟到结果。
  不自动写相册。系统相机弹出时网页可能失活，不能把这误判为用户取消拍摄。
- Info.plist及中英文系统权限说明已补相机、读取/添加照片三项；Podfile加入Camera。
  macOS执行 `cap sync` 会生成原生插件注册和安装依赖，不在Windows伪造Pods编译结果。
- 文件附件继续使用WKWebView真实HTML文件选择器，只接收用户选定的TXT、MD、CSV、
  JSON（2MiB，最多12000字符），不是模拟文件。PDF/Office解析不在当前支持范围；
  iCloud Drive/“我的iPhone”选择、取消及大文件拒绝须真机验收。
- 网页保留getUserMedia取景/真实file input；FaceDetector不可用时不伪造人脸定位。

依据：[Capacitor Camera API](https://capacitorjs.com/docs/v7/apis/camera)、
[Apple PHPicker](https://developer.apple.com/documentation/photosui/phpickerviewcontroller)、
[Apple WKUIDelegate文件面板](https://developer.apple.com/documentation/webkit/wkuidelegate)。
已检查所锁定Camera包的Swift源码：`presentPhotoPicker`、`didFinishPicking`、
`processImage`、`saveTemporaryImage`；取消由系统回调拒绝，前端不把取消报告为失败。

### 提醒及其他设备能力

真实本地通知使用LocalNotifications→UNUserNotificationCenter，授权后排入系统，
启用入口共用`NavaNotificationPermission`原生桥：首次授权用苹果系统框，已拒绝时
使用原生UIAlertController引导到本APP通知设置（iOS16+精确链接，旧版APP设置），
返回重新检查并只开启指定项。页面不显示常驻权限卡；新账号八项全关，老偏好保留。
不是网页定时器。最多56个未来计划并扣除其他槽位，打开APP续排；跨时区、禁用通知、
专注模式及长时间不打开的边界见`NOTIFICATIONS_DELIVERY.md`。不能承诺系统永不延迟。
远程APNs、HealthKit、Watch、录音和常亮已有原生桥，但开发者证书、推送环境、
真实设备中断/锁屏和耗电证据未齐，不能标为产品验收完成。
参考：[Apple 本地通知](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)。

### 给Mac同学的最短交接

1. 获取本仓库当前源码，安装受支持的Node（建议22.18+）、Xcode及CocoaPods；准备
   canonical Supabase的公开URL/publishable key到本地 `.env`，不传服务端密钥。
2. `npm run ios:prepare:release`：安装依赖、跨平台源码检查/专项测试、原生构建、
   cap sync、模拟层排除、plist检查、未签名模拟器编译。已移除该脚本对PowerShell和
   Q盘截图输出的依赖。它并不代替源码工作区的完整`npm run verify`发布门槛。
3. Xcode打开`ios/App/App.xcworkspace`；选开发者Team，确认iPhone与Watch Bundle ID、
   HealthKit/Push能力及profile。设置`NAVA_ARCHIVE=1`、`NAVA_APPLE_TEAM_ID`、
   `NAVA_IOS_BUNDLE_ID`可生成archive；不会自动上传App Store或替用户签协议。
4. 必测：通知首次允许/拒绝/取消、拒绝后跳本APP通知设置、返回仅开启请求项、
   已允许时无额外弹窗、系统静音/专注/摘要设置；前后摄像头/拒绝权限/取消/重拍、HEIC和iCloud照片、文件选择、来电打断
   录音、后台暂停专注、前台常亮及手动锁屏、八项提醒锁屏到达/点开/关闭、账号隔离、
   HealthKit/Watch真实读写。用Instruments检查动画内存/掉帧/耗电。Mac验证未执行。

## 动画追加清单的实现与素材边界

来源：用户提供`动画清单-追加.md`；已对照原GIF关键帧（TestRuns/mascot-gif-review），
不根据英文文件名直接宣称符合新版动作。

| 要求 | 当前实现与未满足部分 |
| --- | --- |
| 闲置后随机一次、回初始 | 已接真实本地时间：04–12早、12–20日、20–04夜；45/75/120秒闲置阈值，日间活跃动作权重更高，避免连续相同动作。阈值是可调整产品参数，不是AI推理。 |
| 打瞌睡、哈欠、数据分析、读书、蝴蝶 | 复用已检查的drowsy/yawn/curious/read/butterfly素材，单次播放。好奇动画确有身后宇宙图案。 |
| 伸懒腰、滚入滚出 | 旧wave素材是抬爪动作，roll是原地翻滚；不能称已实现新版趴地伸腰/滚出屏幕后返回，需要新素材。 |
| 捋毛 | 三段已有素材重组为三个滑动检查点：鼓起后等待；第一次播放顺毛前半；第二次播放后半；第三次恢复。每次至少24px滑动；等待不解码帧，键盘回车也可推进。新增精确“每次少一颗毛球”仍依赖动画原稿。 |
| 摸鱼 | 进场→揉鱼循环→短点击后结束；不是三段自己全部播完。不可无限排队，后台暂停。 |
| 抬头看卡片、上指 | 现素材没有可确认的“左右两次看三卡”和上指引导成套动作，待动画师补，未假装完成。 |
| 数据积累后背身吐光球 | 缺背身提示/吐光球/恢复素材，也尚未定义“积累足够”的产品阈值；本轮不写虚构触发数据或奖励。 |
| 正午更活泼、夜间静息 | 已完成分时选择与夜间排除活跃动作；“尾巴加快/只呼吸且垂耳”需独立基础待机素材，目前不能称视觉完成。 |
| 情绪/睡眠/饮食反应 | 复用已有真实homeGuidance优先睡眠信号；已保存情绪≥75时按文档排除活跃随机动作。新旋转眼、变胖、负/正情绪表情仍缺素材；不根据一餐推断肥胖，也不伪造健康反馈。 |

用户主动点击普通动作仍可按原顺序预览。自动动作仅在可见首页闲置时发生，后台不补播；
减少动态效果使用静态备援。持续canvas保留旧帧到新帧就绪；最多三个压缩素材缓存、
一个待解码帧，不预解码全部GIF、不新增视频轮询。网页帧连续通过不代表低端iPhone耗电验收。

本轮已随Sites v164及Pages同源发布，完整回归、原生40个JS/CSS模拟层排除、四档
相机28状态、15素材逐帧连续性及React真实三次滑动/摸鱼点击测试通过；双站真实登录
和实际加载资源校验通过，不涉及新的健康写入或AI生成。真机门槛仍保持未完成。

动画师补交建议：统一画布/脚底锚点/透明底；动作的起始、循环段和结束段分离，并明确
循环接缝、时间及可交互停顿帧。当前接口支持在阶段间等待，不必改成移除再插入小猫。

## 行为

- 未移动手机时，背景继续按原有节奏自动流动。
- 手机轻微倾斜时，背景沿对应方向产生额外位移、波纹和光影变化。
- 姿态带来的额外速度最高为原动画速度的 50%，停止移动后平滑回落。
- 传感器不可用、用户拒绝授权或开启“减少动态效果”时，仅保留原有背景动画。
- 动作数据只在当前页面的内存中参与渲染，不上传、不写入本地存储。

## iOS 权限

首次进入引导页时不弹权限框；用户点击“开始体验”后，应用才请求动作与方向权限。用途文案为：

> NAVA 使用设备动作数据，让动态背景轻微响应您的手机移动。数据仅在设备本地用于视觉效果。

在 Mac 上执行以下任一命令，会自动向 `ios/App/App/Info.plist` 写入
`NSMotionUsageDescription`：

```bash
npm run cap:add:ios
npm run cap:sync
```

也可以单独执行：

```bash
npm run ios:configure-motion
```

## 真机验收

1. 使用 HTTPS 或 Capacitor iOS 应用打开 NAVA。
2. 点击“开始体验”，允许动作与方向访问。
3. 保持手机静止，确认原动画持续运行。
4. 分别向左、右、上、下轻微倾斜，确认纹理和光影沿相同方向响应。
5. 快速移动后停止，确认增强在约一秒内平滑衰减，不发生跳变。
6. 拒绝权限并重新进入，确认登录和原背景动画不受影响。
7. 开启 iOS“减少动态效果”，确认姿态联动停用。

## 录音、播放和相机中断（当前实现及验收边界）

网页桌面右侧系统事件可随时触发，只有当前可见且运行中的活动接收中断。录音中断会取消监听及
待授权请求，保留已识别文字；朗读中断清队列并拒绝迟到流片段；相机中断停止所拥有的
视频轨道。回到页面不会自动开麦、开镜头或提交记录。按钮明确是模拟，不真实拨号。

`NavaSpeechPlugin` 监听 AVAudioSession interruption、旧音频路由断开和进入后台。
请求代次隔离迟到权限及识别回调，只在前台启动；取消不依赖前端监听清理成功。
Windows 上的源码合同与外部 Chromium 模拟不等于 iPhone 录音、锁屏及常亮验收。
仍须 Mac/Xcode 编译并用真实 iPhone 测试拒绝/迟到授权、来电、耳机拔出、锁屏/解锁、
手动恢复及麦克风指示灯，填写真机记录后才能关闭设备门槛。

系统事件依据：[Apple 音频中断说明](https://developer.apple.com/documentation/AVFAudio/handling-audio-interruptions)。
