# 2026-07-17 App 仓库审查与修复记录

本次审查确认当前仓库是新的 App 私有仓库：

- 本地：`Z:\nava-app`
- 远端：`https://github.com/ChiZhang-805/nava-app`
- 可见性：`PRIVATE`
- Web 上游：`https://github.com/Tj-jiaoao/style-muse-next.git`
- `web-upstream` push 已禁用，仅用于 fetch/diff。

## 已修复的缺口

1. `ensureProfile` 登录时会覆盖用户已编辑昵称，已改为只在缺失时插入。
2. 账号为空时仍可能进入 Supabase 请求，已增加输入校验。
3. 非邮箱/非手机号账号会被错误拼成手机号邮箱，已阻断。
4. 密码登录缺少空密码校验，已补。
5. 密码注册缺少长度校验，已补。
6. 邮箱 OTP 缺少邮箱格式校验，已补。
7. 邮箱验证码缺少 6 位校验，已补。
8. 短信验证码缺少手机号和验证码格式校验，已补。
9. 找回密码 redirect 不明确，已加 `?reset=true`。
10. Supabase env 缺失时 client 可能先崩溃，已改为安全占位并在 UI 层显示配置错误。
11. Supabase URL 未校验格式，已补。
12. 记录页不能选择 `record_date`，已补日期选择。
13. 服务层允许未来日期，已阻断。
14. 睡眠时长需要手动算，已根据入睡/醒来时间自动估算。
15. 睡眠记录缺少浅睡输入，已补。
16. 睡眠记录缺少自评，已补。
17. 睡眠记录缺少备注，已补。
18. 睡眠阶段总和可能超过总时长，已校验。
19. 运动记录缺少心率输入，已补。
20. 运动记录缺少血氧输入，已补。
21. 运动记录缺少备注，已补。
22. 运动/专注/热量等数值允许负数，已阻断。
23. `exercise_records` 后端暂无唯一约束，App 端保存后会清理同日重复记录。
24. 饮食记录不能选餐次，已补早餐/午餐/晚餐/加餐。
25. 饮食总热量会被新食物覆盖，已改为按餐次重新汇总。
26. 专注分钟允许 0，已阻断。
27. AI 抽取只兼容 camelCase，已兼容 snake_case。
28. AI 抽到空运动数据也会写全 0 记录，已阻断。
29. HealthKit 插件缺少睡眠分钟聚合，已补。
30. HealthKit 同步只写运动摘要，已补 Apple Watch 睡眠摘要保存。
31. Watch 只能接收快照，不能把动作传回 App，已加 Watch action listener。
32. Watch 专注停止协议缺少时长，已加 `durationMinutes`。
33. App 没有全局错误边界，已补。
34. App 没有网络状态提示，已补在线/离线 badge。
35. 仓库缺少统一自检入口，已补 `npm run verify`。

## 仍需真机验证

- iOS HealthKit 权限弹窗。
- Apple Watch 配对状态。
- WatchConnectivity 快照和动作往返。
- Web 注册账号登录 App 后写入记录，再在 Web 端读取。

