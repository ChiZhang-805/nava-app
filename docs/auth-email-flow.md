# APP 验证码注册流程

## 登录前页面的键盘与固定背景

登录、注册、验证码登录、重置密码复用 `activateAuthViewport`。背景画布保持打开键盘前的
全屏尺寸；键盘只改变表单可用高度，当前字段通过 `.auth-form-region.scrollTop` 定向揭示，
不再调用会带动整个文档的 `scrollIntoView`。标题基线和紧凑键盘样式统一，关闭键盘恢复；
点击 NAVA 标题可收起键盘。低视口通过表单内部滚动访问后续字段与提交按钮。

iOS 混合版 `NavaBridgeViewController` 使用独立 UIKit 图片层承载同一张 `NavaAuthTexture`，
以根视图四边约束铺满，不跟随 WKWebView 的内容滚动。`NavaAuthViewport` 仅在认证页启用，
接收系统键盘 frame（包括工具栏占据的高度），禁止外层 WebView 平移；离开认证页恢复
原有 WebView 行为。没有增加 Keyboard 插件依赖，也未修改验证码、会话及认证服务合同。

验证入口：`node scripts/verify-auth-keyboard.mjs` 是 Chromium/WebKit 几何回归，
明确不能充当 iPhone 系统键盘证据。`scripts/test-ios-auth-keyboard.sh` 在云端 macOS
用 iPhone 15 Pro Max 与 iPhone SE 的真实 iOS 模拟器运行默认混合版，并保存 XCTest
截图；不启用未完成的 SwiftUI 功能开关。真机 TestFlight 验收仍单独记录。

## 微信与 QQ 移动应用接入准备（2026-11-13）

用户确认：微信开放平台和 QQ 互联的移动应用均尚未创建，拟采用公司／组织主体。
现有按钮、`nativeSocialAuth.ts` 和 `social-oauth` 实现的是外部浏览器 OAuth 流程；
微信使用网站 `qrconnect`，iOS 尚未集成微信或 TencentOpenAPI 原生 SDK。因此当前不能
宣称已经实现“唤起微信／QQ App 授权并返回 NAVA”。本轮只核对并整理接入准备，没有
启用 provider、修改生产密钥、部署函数或发布新的 TestFlight 包。

### 已核对的申请信息

| 字段 | 当前值及边界 |
| --- | --- |
| 应用名称 | NAVA健康节律助手，与 App Store Connect 记录一致 |
| 应用类型 | 移动应用，当前先接 iOS |
| iOS Bundle ID | `health.nava.mobile` |
| Apple Team ID | `P9N6YYZ7Y9` |
| Apple App ID | `6829876477`；这是 Apple 的应用记录编号，不是微信／QQ 的 AppID，也不证明已公开上架 |
| 应用图标 | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |
| 主体类型 | 公司／组织；真实单位名称、证件与管理员资料由用户在平台提交 |

申请入口：[微信开放平台](https://open.weixin.qq.com/)；
[QQ 互联](https://connect.qq.com/)。QQ 官方说明的流程是开发者注册、创建应用、
审核并取得接口权限；公司账号应由公司长期管理，避免使用临时员工账号。
依据：[成为开发者](https://wiki.connect.qq.com/成为开发者/)、
[创建应用](https://wiki.connect.qq.com/__trashed-2/)。微信官方文档在本轮网络检索中
无法打开，因此认证材料、费用及审核条件以用户登录后的官方页面为准，不套用公众号、
网站应用或小程序的申请条件。

### 后续接入顺序与待补信息

1. 用户用公司／组织主体注册两个开放平台，创建 NAVA 移动应用，记录各自 AppID 和
   微信登录／QQ 登录权限状态。AppSecret、AppKey 只进入服务端密钥配置，不在聊天、
   前端、仓库或日志中传递。
2. 确认由公司控制的 HTTPS Universal Link 域名与路径，部署 AASA，并配置 iOS
   Associated Domains。现有 Supabase OAuth callback 不能直接充当 Universal Link。
   QQ 要求见 [Universal Links 适配 FAQ](https://wiki.connect.qq.com/universal-links适配faq/)。
3. 将官方 iOS SDK、URL 回调及 Universal Link 回调接入当前 Capacitor 原生桥；服务端
   验证授权结果属于本应用后再建立 Supabase 会话，保留取消、失败和未安装客户端处理。
   不把网站 AppID 与移动应用 AppID 混用，不只因昵称、邮箱相同就合并账号。
4. 补齐隐私政策中的真实运营主体和联系渠道，按实际接入列出 SDK 与授权用途；现有
   隐私页面只有项目维护者渠道，不能视作申请材料已完备。
5. 在取得所需配置、完成后端部署授权及真机授权回跳验收后，再构建并上传 TestFlight。
   仅创建应用、按钮存在或编译成功，都不代表真实登录验收通过。

## 统一注册

邮箱和中国大陆手机号都使用同一套注册步骤：

1. 输入邮箱或手机号并获取验证码；邮箱验证码为 8 位，手机短信验证码为 6 位。
2. 输入验证码、密码和确认密码。
3. 验证码通过后设置密码，并进入同一个 Supabase Auth 账号。
4. 此账号可供 Web、iPhone 和 Apple Watch 共用。

邮箱使用 Supabase `signInWithOtp`、`verifyOtp(type: "email")` 和 `updateUser(password)`。手机号使用 APP 专属的 `aliyun-sms-send`、`aliyun-sms-verify` Edge Functions，验证成功后生成 Supabase 一次性令牌，因此仍然进入同一个账号体系。

### Web / iPhone / Watch 互通约束

- APP 的规范后端项目为 `wxteapvwagvhhtrjrbim`。
- 三端必须连接同一个 Supabase 项目，不能各建一套 Auth 用户库。
- Web 端手机号注册与重置必须复用 `aliyun-sms-send`、`aliyun-sms-verify`，手机号密码登录必须沿用 `手机号@phone.nava.app` 的内部映射。
- 内部映射不得展示给用户；资料页仍显示原手机号。
- Web 端若改用另一种手机号建号规则，会生成第二个账号，历史健康数据无法自动合并。

### 会话存储边界

- GitHub Pages、ChatGPT Sites 和普通浏览器继续使用当前标签页的
  `sessionStorage`。关闭标签页后不保留公开网页登录，不得静默改成
  `localStorage`。
- Capacitor iOS 原生包使用 `NavaSecureStoragePlugin` 将 Supabase 会话保存到
  当前 App 隔离的 iOS Keychain；退出登录时 Supabase 会通过同一适配器删除
  会话。
- Keychain 项使用 `AfterFirstUnlockThisDeviceOnly`，不会通过 iCloud Keychain
  同步到其他设备。这样 HealthKit 后台变化在用户首次解锁后可以安全恢复当前
  会话，同时不会把 token 写入 Web 存储、日志或源码。
- Android 后续需要独立的 Keystore-backed 适配器；在它完成前不得把 iOS
  Keychain 合同假定为跨平台实现。

## 托管邮件与验证码模板

生产邮件必须先配置自定义 SMTP；Supabase 默认邮件服务只用于开发，而且免费层在未配置自定义 SMTP 时会拒绝修改邮件模板。推荐为认证邮件使用独立域名和发件地址，例如 `no-reply@auth.example.com`。准备好 SMTP 凭据后：

```powershell
$env:SUPABASE_PROJECT_REF="wxteapvwagvhhtrjrbim"
$env:SUPABASE_ACCESS_TOKEN="Supabase personal access token"
$env:NAVA_SMTP_HOST="SMTP host"
$env:NAVA_SMTP_PORT="587"
$env:NAVA_SMTP_USER="SMTP user"
$env:NAVA_SMTP_PASSWORD="SMTP password"
$env:NAVA_SMTP_FROM_EMAIL="no-reply@auth.example.com"
$env:NAVA_SMTP_SENDER_NAME="NAVA"
powershell -ExecutionPolicy Bypass -File scripts/configure-auth-smtp.ps1
```

然后让 Magic Link 和 Confirm signup 模板包含 `{{ .Token }}`，否则邮件仍会显示确认链接：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-auth-email-otp.ps1
```

也可以一次执行 `scripts/deploy-backend.ps1 -ConfigureAuthSmtp -ConfigureAuthEmailOtp`，部署脚本会保证先配置 SMTP、再更新验证码模板。SMTP 密码和 Supabase access token 只通过进程环境传入，不写入仓库。发件域名必须同时配置 SPF、DKIM 和 DMARC。

## 手机短信后端

短信验证码只在 Edge Function 内生成。数据库仅保存手机号、IP 和验证码的 HMAC 摘要，并执行以下限制：

- 同一手机号同一用途 60 秒冷却。
- 同一手机号每小时最多 5 次，同一 IP 每小时最多 20 次。
- 验证码 10 分钟过期，最多错误 5 次，成功后立即消费。
- 阿里云 AccessKey、短信签名、模板和 HMAC 密钥只放 Supabase Secrets，不进入前端或 Git。

部署前需要准备已审核通过的阿里云短信签名与验证码模板，模板变量默认名为 `code`。在本地终端设置以下环境变量后执行：

```powershell
npm install
$env:SUPABASE_PROJECT_REF="项目 ref"
$env:ALIYUN_SMS_ACCESS_KEY_ID="RAM 用户 AccessKey ID"
$env:ALIYUN_SMS_ACCESS_KEY_SECRET="RAM 用户 AccessKey Secret"
$env:ALIYUN_SMS_SIGN_NAME="已审核短信签名"
$env:ALIYUN_SMS_TEMPLATE_CODE="SMS_..."
$env:ALIYUN_SMS_TEMPLATE_PARAM_KEY="code"
powershell -ExecutionPolicy Bypass -File scripts/deploy-backend.ps1 -ConfigureSmsSecrets -ConfigureAuthEmailOtp
```

`NAVA_OTP_HMAC_SECRET` 可以由部署脚本安全生成，也可以由运维通过环境变量提供稳定的 32 位以上随机值。

兼容旧部署时，短信函数也可读取 `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET`；新部署仍应使用权限更小的专用 RAM 用户和 `ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET`。

`aliyun-sms-send` 按阿里云 `SendSms` 自签名示例把业务参数放入排序后的 canonical query，
使用空请求体计算 ACS3-HMAC-SHA256 签名。阿里云返回业务错误时，服务端会把错误码、
消息和 `RequestId` 写入 challenge 的 `provider_error`，但不会把 AccessKey、验证码或手机号
明文写入日志或前端。看到 `isv.SMS_SIGNATURE_ILLEGAL` 时应优先核对签名是否属于当前
AccessKey 所在阿里云账号、签名文本是否完全一致且处于“可用-正常”；权限不足、余额不足
和出站 IP 限制分别会返回不同的错误码，不能都归为“验证码服务暂不可用”。

2026-09-06 已将上述 query 传输修复部署为 canonical production 的
`aliyun-sms-send` version 17（ACTIVE，`verify_jwt=false`）。无效手机号线上请求已验证能命中
新函数并返回参数校验错误；这项无副作用验证不等于真实短信已送达，仍须由用户用自己的
中国大陆手机号完成一次发送和输入验证码验收。

## 备用安全联系方式

“账号与安全”中的备用邮箱与备用手机号不是主登录身份，但写入前同样必须证明用户能够接收验证码：

- 备用邮箱使用8位邮件验证码，备用手机号使用6位阿里云短信验证码。
- 客户端不能直接调用`auth.updateUser`写入这两个字段；只能调用`security-contact-otp`的`send`与
  `verify`动作，且函数必须校验当前登录JWT。
- 数据库`nava_security_contact_otp_challenges`只保存用户、目标、验证码和IP的摘要；验证码10分钟
  过期、60秒冷却、最多错误5次，并按用户、目标和IP限流。
- 验证成功后函数只更新当前用户的`backup_email`或`backup_phone`，不会替换主登录邮箱/手机号。

2026-10-09经用户明确授权，`202610090001_security_contact_otp.sql`已选择性应用，现有NAVA Auth
SMTP配置已安全复用为Edge secrets，`security-contact-otp`已部署为ACTIVE v1并启用JWT验证；旧的
`202609270001`没有被连带应用。未登录调用实测返回401。真实邮件与短信送达仍需用户使用自己可接收的
地址各完成一次端到端验收，不能因界面模拟测试或函数ACTIVE就声称实际送达成功。

## 公开部署

`.env.review` 只包含可公开的 Supabase URL 和 publishable key，且必须保持 `VITE_ENABLE_REVIEW_DEMO=false`。GitHub Pages 与 Sites 都执行真实认证；`?demo=1` 仅在 Vite 开发模式生效，不能绕过线上登录。

部署脚本通过系统临时目录中的一次性 `.env` 向 Supabase CLI 传递短信密钥，执行结束后立即删除，密钥不会进入仓库或 CLI 参数列表。

## 后端验证

```powershell
npm run backend:verify
npm run backend:typecheck
npm run backend:test
```

验证范围包括 Edge Function 文件契约、前端服务角色密钥扫描、全部函数的 Deno 类型检查、
OTP 随机性/HMAC 域隔离、阿里云 V3 签名官方固定向量，以及 `SendSms` canonical query
编码合同。

## 重置密码

中文与英文统一显示“重置密码 / Reset password”。邮箱使用 8 位验证码，手机号使用 6 位短信验证码；页面要求填写新密码和确认密码，后端 RPC 会在更新前比较现有密码，禁止设置为当前密码。原有 Recovery Link 页面仍保留，用于兼容已发出的旧链接。
