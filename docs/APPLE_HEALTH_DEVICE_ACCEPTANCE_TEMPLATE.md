# NAVA Apple Health / Apple Watch 真机验收记录

> 每台设备复制一份本模板。不得粘贴密码、验证码、JWT、Supabase secret、完整
> 用户 UUID 或私人健康原始值；数值对比截图应打码个人身份信息。

## 构建身份

- 日期：
- 测试人员：
- Source commit：
- iOS bundle ID：
- Marketing version / build number：
- Apple Developer Team 已确认：是 / 否
- Xcode 版本：
- macOS 版本：
- iPhone 型号 / iOS：
- Apple Watch 型号 / watchOS：
- TestFlight build 或本地签名 build：

## 前置检查

- [ ] iPhone 与 Apple Watch 已在系统 Watch App 中配对。
- [ ] Apple 健康中可以看到手表产生的步数、心率和睡眠来源。
- [ ] 使用与网页相同的 NAVA 测试账号登录。
- [ ] 测试账号不是生产真实用户；证据中不包含私人记录。
- [ ] 第二个测试账号已至少完成一次健康同步，并安全记录其 UUID 供 RLS 验证。
- [ ] 在点击同步前记录 UTC 时间，作为 `NAVA_EXPECT_SYNC_AFTER`。
- [ ] 记录待核验的设备本地日期，作为 `NAVA_EXPECT_HEALTH_RECORD_DATE`。

## 权限测试

- [ ] 首次进入显示 NAVA 自己的 HealthKit 权限说明。
- [ ] 只请求产品实际使用的数据类型。
- [ ] 完全授权后可读取真实记录。
- [ ] 关闭一个类型后，其页面显示缺失而不是 0。
- [ ] 全部拒绝后既有云端真实数据不被零覆盖。
- [ ] 撤销权限再进入时有真实、可恢复的提示。

## 数据闭环

- [ ] 手动同步成功。
- [ ] App 返回前台后的冷却同步成功。
- [ ] HealthKit 发生变化后，运行中的 App 或下次启动消费后台标记。
- [ ] `health_sync_jobs` 出现本次成功任务和真实完成时间。
- [ ] `health_metric_snapshots` 出现 Apple Health 来源。
- [ ] 有运动数据时 `exercise_records` 出现 `apple_health`。
- [ ] 有睡眠数据时 `sleep_records` 出现 `apple_watch`。
- [ ] 重复同步没有增加同日重复记录。
- [ ] iPhone App、GitHub Pages、ChatGPT Sites 展示一致。

完成真实同步后，在安全终端中运行：

```bash
export NAVA_HEALTH_TEST_ACCESS_TOKEN='<temporary user access token>'
export NAVA_EXPECT_SYNC_AFTER='2026-09-02T10:00:00Z'
export NAVA_EXPECT_HEALTH_RECORD_DATE='2026-09-02'
export NAVA_OTHER_HEALTH_TEST_USER_ID='<known second test user UUID>'
npm run health:verify:account
unset NAVA_HEALTH_TEST_ACCESS_TOKEN
unset NAVA_OTHER_HEALTH_TEST_USER_ID
```

脚本只读、不会打印 token、邮箱、用户 ID 或健康数值。

## 异常与隔离

- [ ] 飞行模式同步显示失败，不显示成功。
- [ ] 恢复网络后重试成功。
- [ ] Token 过期后要求恢复登录，不使用共享写入密钥。
- [ ] 用户 A 无法看到用户 B 的同步任务或健康记录。
- [ ] 跨午夜睡眠归属正确。
- [ ] 改变时区后记录保留原始时区来源。
- [ ] 不支持血氧的设备不会阻断步数、心率和睡眠。

## 证据索引

- Xcode compile/archive 日志位置：
- 权限页截图位置：
- NAVA 同步状态截图位置：
- 两个网页端截图位置：
- 只读边界脚本输出位置：
- 已知问题和复现步骤：

## 结论

- [ ] 通过：可以进入 TestFlight 下一阶段。
- [ ] 不通过：不得宣称 Apple Watch 已接入。

签字/日期：
