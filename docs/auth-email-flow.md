# APP 邮箱注册与恢复流程

## 注册

邮箱注册与网页端使用同一个 Supabase Auth 用户表，并采用同一套确认链接：

1. 用户在 APP 填写邮箱、密码和确认密码。
2. APP 调用 Supabase `signUp`，密码在发送确认邮件前完成设置。
3. 用户点击邮件中的确认按钮。
4. 用户返回 APP，使用相同邮箱和密码登录。

邮箱注册不使用六位验证码。手机号注册继续使用 `aliyun-sms-send` 和
`aliyun-sms-verify` 的六位短信验证码。

## 密码恢复

登录页的“找回密码”会发送恢复邮件。用户点击邮件按钮后，APP 显示“设置新密码”页面，
保存成功后进入已登录状态。

本地联调前，需要网页端或 Supabase 项目管理员在 Auth URL Configuration 的 Redirect URLs
中加入：

```text
http://127.0.0.1:5173/**
```

正式发布前还需要加入最终 Web 域名以及 iOS Universal Link 或自定义 URL Scheme。不要把
Supabase service role key、SMTP 密码或短信密钥提供给 APP 前端。
