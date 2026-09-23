# Web 上游协作契约

## 当前首次引导参考：Fluffy Cat v17

2026-09-23 追加接入 `ChiZhang-805/fluffy-cat-journal` 的 v17 首次使用流程，
固定来源 `3487d9ffb9785fa852ced94a818d2667bef45af8`。NAVA 只导入
`onboarding.html` 作为正式账号首次登录/个人页回看的“初见手记”子页面：
欢迎纸条、七个受控问题、最终汇总页。父 React 应用仍负责真实登录、Supabase
profile 保存、完成状态和语言同步；子页面不接收 JWT、模型 Key 或 service key，
也不生成每日记录、评分、报告或 AI 输出。

嵌入到 NAVA 正式手机预览时，v17 自带的手机外壳、状态栏、灵动岛和 home indicator
被宿主模式隐藏，只保留纸条、小猫、问答和汇总内容，避免双层手机框。iframe 消息
必须同源、匹配创建它的 `nava-first-run-*` 随机频道，并在父页再次通过白名单校验
后才写入 `profiles.onboarding_answers.firstNotesProfile`。

## 当前四页参考：Fluffy Cat v16

用户于 2026-09-23 确认 `ChiZhang-805/fluffy-cat-journal` 仅作为六模块的四个核心页面
参考，固定来源 `fb7045d611dc0eab40818b3d6d494f6dfa12a9c6`。导入内容在
`public/journal`，保留原素材许可证。NAVA 原首页、导航、账户、通知和两个发布地址
不替换为原型网站。原型首页、个人页、待办和 API Key 设置不向用户开放。

父 React 页面持有真实 Supabase 会话；单个同源 iframe 通过 MessageChannel 请求
云端记录、服务端 AI、原生照片和听写，不接收 JWT 或模型 Key。原型 localStorage
记录改为经过 RLS/CAS 的云端存储。参考仓库不是部署镜像；不要向它推送 NAVA 发布。

集成层负责全屏背景与竖屏适配：背景独立铺满视口，不继承旧底栏占位或冰蓝底图；
画布动作保持原比例，宽度/安全区决定布局，短屏或键盘遮挡时滚动，输入文字和主要
触达面积不随高度无限压缩。桌面机型预览的缩放量必须换算回逻辑像素。WebGL纹理
失败/上下文丢失时回退同一原画的CPU变形，不让角色图层空白。

验证矩阵使用18个预览配置及6个小屏/旧屏边界，按实际CSS宽高和安全区约束，而非
按型号条件分支。WebKit六模块552项页面状态检查通过，另有1449组布局规则扫描；
小屏输入/主要操作保持字号和44px触达下限，模拟键盘下可滚动访问保存。
这些是桌面引擎/几何验收，不是全部iPhone真机验收；不扩大为旧页面全部通过。

下文旧 Web 上游用于遗留功能对照，不替代上述用户确认的四页范围。

App 团队跟随 `Tj-jiaoao/style-muse-next`，但不直接复制桌面页面。

## 远端设置

```bash
git remote add web-upstream https://github.com/Tj-jiaoao/style-muse-next.git
git remote set-url --push web-upstream DISABLED
```

`web-upstream` 只用于 fetch 和 diff，不允许 App 仓库误推送到 Web 仓库。

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
