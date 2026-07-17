# Apple Watch 架构

第一版 Apple Watch 不做完整独立 App，而是 iPhone companion。

## 第一版职责

- 显示今日状态。
- 快捷记录情绪。
- 快捷开始 / 结束专注。
- 显示同步状态。
- 接收 iPhone 推送的用户快照。

## 通信方式

使用 WatchConnectivity。

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
