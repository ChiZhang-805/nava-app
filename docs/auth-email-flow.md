# APP 验证码注册流程

## 统一注册

邮箱和中国大陆手机号都使用同一套注册步骤：

1. 输入邮箱或手机号并获取六位验证码。
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

## 托管邮件模板

托管 Supabase 项目必须让 Magic Link 和 Confirm signup 模板包含 `{{ .Token }}`，否则邮件仍会显示确认链接。已有自动配置脚本：

```powershell
$env:SUPABASE_PROJECT_REF="项目 ref"
$env:SUPABASE_ACCESS_TOKEN="Supabase personal access token"
powershell -ExecutionPolicy Bypass -File scripts/configure-auth-email-otp.ps1
```

`SUPABASE_ACCESS_TOKEN` 只用于部署，不得写入 APP 前端 `.env`、Git 或 iOS 包。

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

部署脚本通过系统临时目录中的一次性 `.env` 向 Supabase CLI 传递短信密钥，执行结束后立即删除，密钥不会进入仓库或 CLI 参数列表。

## 后端验证

```powershell
npm run backend:verify
npm run backend:typecheck
npm run backend:test
```

验证范围包括 10 个 Edge Function 的文件契约、前端服务角色密钥扫描、全部函数的 Deno 类型检查、OTP 随机性/HMAC 域隔离，以及阿里云 V3 签名官方固定向量。

## 重置密码

中文与英文统一显示“重置密码 / Reset password”。邮箱和手机号都使用六位验证码，页面要求填写新密码和确认密码；后端 RPC 会在更新前比较现有密码，禁止设置为当前密码。原有 Recovery Link 页面仍保留，用于兼容已发出的旧链接。
