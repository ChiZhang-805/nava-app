# NAVA-FDNB Health 接入说明

## 定位

NAVA-FDNB Health 是面向 NAVA 六模块纵向健康记录的研究性状态转变适配器。它不直接运行 FDNB 仓库中的单细胞 `AnnData` 流程，也不把细胞×基因矩阵错误套用到用户健康数据。原始压缩包未附带可用于产品发布的许可证和真实 `h5ad` 数据，因此本仓库没有复制其源码或模型文件。

当前产品保留 NAVA ChronoState 作为每日基础节律与可靠性基线；FDNB Health 只负责 14—56 天多模块变化的研究性证据层。任何结果都必须展示：

> 研究性健康状态转变提示，不构成医疗诊断、疾病预测或因果结论。

## 数据契约

- schema：`nava.fdnb.health.v1`
- model：`nava-fdnb-health-research-v0.1-2026-08`
- 最少 14 个有效日、4 个特征、3 个模块；不足时返回 `insufficient_data`，不强行给分。
- 输入只包含日级派生特征。面部原图路径、日记正文、AI 对话正文不会进入 FDNB 特征。
- 时间窗为 7 / 14 / 21 天；包含独立循环位移空模型、经验 p 值、区块 bootstrap、多尺度一致性和端点降权。
- 证据分为 `supported`、`candidate`、`no_support`，前端不得把候选信号翻译成疾病预测。

## 数据流

1. 六模块记录保存到 Supabase。
2. 数据表触发器写入 `fdnb_recompute_jobs`。
3. App 同时调用 `fdnb-recompute` 做交互后即时刷新。
4. `_shared/fdnb-health-features.ts` 生成只含派生数值的日级特征。
5. `_shared/fdnb-health-core.ts` 计算个人多尺度 FDNB 证据。
6. 结果写入 `health_feature_snapshots`、`fdnb_health_scores` 和 `weekly_health_reports`。
7. 周报支持往期切换、研究证据说明和本地生成分享海报。

## 验证

```powershell
npm run fdnb:test
npm run backend:typecheck
npm run verify
```

算法测试覆盖数据不足门禁、确定性、分数边界、来源信息和“原始面部图片不进入特征”约束。
