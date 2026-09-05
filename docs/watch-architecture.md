# Apple Watch 架构

> 公开网页不能因为与手表处于同一 Wi-Fi 或蓝牙环境就直接读取 HealthKit
> 历史。Apple Watch 的正式路线是 Watch → iPhone/HealthKit → NAVA 原生桥 →
> Supabase；当前实现和真机门槛见
> [`APPLE_HEALTH_WATCH_DELIVERY.md`](./APPLE_HEALTH_WATCH_DELIVERY.md)。

第一版 Apple Watch 不做完整独立 App，而是 iPhone companion。

可直接加入 watchOS target 的源码位于 `native/watch/`：

- `NavaWatchApp.swift`：watchOS App 入口。
- `WatchHomeView.swift`：今日节律、情绪快捷记录、专注计时与同步页面。
- `WatchSessionManager.swift`：即时消息、离线 `transferUserInfo` 队列与快照接收。
- `en.lproj` / `zh-Hans.lproj`：中英文界面文案。

## 第一版职责

- 显示今日状态。
- 快捷记录情绪。
- 快捷开始 / 结束专注。
- 显示同步状态。
- 接收 iPhone 推送的用户快照。

## 通信方式

使用 WatchConnectivity。

每个动作必须携带唯一 `actionId`。iPhone 本地先持久化待处理队列，`watch-sync` 再通过 `watch_action_receipts` 执行服务端幂等，避免即时消息与离线重放造成重复记录。

Watch 发给 iPhone：

```ts
type WatchAction =
  | { type: "mood.quickLog"; mood: number; recordedAt: string }
  | { type: "focus.start"; taskTitle?: string; startedAt: string }
  | { type: "focus.stop"; sessionId: string; endedAt: string; durationMinutes?: number; taskTitle?: string }
  | { type: "sync.requestSnapshot" };
```

iPhone 回给 Watch：

```ts
type WatchAck =
  | { ok: true; actionId: string; syncedAt: string }
  | { ok: false; actionId: string; errorCode: string; message: string };
```

## 登录策略

第一版：

- 用户必须先在 iPhone 登录。
- iPhone 将用户状态同步到 Watch。
- Watch 不保存 Supabase service key。
- Watch 不直接使用模型 API key。

第二版：

- Watch 显示短码。
- 用户在 iPhone 或 Web 确认绑定。
- Watch 获得受限会话。

## App Store 注意事项

- HealthKit 权限说明必须清楚。
- AI 健康建议必须声明不是医学诊断。
- 用户必须可以删除账号和导出数据。
