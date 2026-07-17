# Web 上游协作契约

App 团队跟随 `Tj-jiaoao/style-muse-next`，但不直接复制桌面页面。

## App 必须跟进的变化

- `supabase/migrations` 新增或修改。
- `supabase/functions` 入参 / 出参变化。
- `src/integrations/supabase/types.ts` 变化。
- Storage bucket policy 变化。
- 新增健康模块。
- Auth 登录方式变化。

## App 可选择跟进的变化

- Web 桌面布局。
- 桌面专属视觉效果。
- 社区 UI 样式。
- 静态插画资源。

## 需要 Web 同学提供

- Supabase URL。
- Supabase anon key。
- dev / staging / prod 环境说明。
- Auth redirect URL 规则。
- Edge Functions 入参 / 出出参说明。
- Storage 权限策略。

## 不应提供给 App 端

- Supabase service role key。
- 数据库密码。
- DeepSeek / Gemini / Lovable Gateway secret。
- 阿里云短信 secret。

