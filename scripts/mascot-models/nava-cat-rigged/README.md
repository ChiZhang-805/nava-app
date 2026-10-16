# NAVA 无阴影骨架小猫母版

- `nava-cat-editable.blend`：可编辑网格、UV、14骨骼、4动作，内嵌无损4K母图。
- `nava-cat-basecolor-4k.jpg`：生产用4K 4:4:4颜色图，直接装入GLB，不重复有损编码。
- `nava-accessories-editable.blend`：按同一猫坐标适配的17件饰品，保留物品ID/stack元数据。
- `export_from_blend.py`：从母版独立导出生产GLB；默认参数指向本目录资产，也可显式传入路径。

```powershell
& 'Q:/NAVA-Workspace/Tools/Blender/blender-5.2.2-windows-x64/blender.exe' --background --factory-startup --python scripts/mascot-models/nava-cat-rigged/export_from_blend.py -- --output src/assets/mascot/models/nava-wardrobe-cat.glb
```

衣橱缩略图来自相同GLB、材质和固定相机：

```powershell
node scripts/mascot-models/render_wardrobe_thumbnails.mjs
```

## 坐标与动作

Blender为Z向上、正面朝-Y，GLB为Y向上、正面朝+Z。保留Meshy原坐标；身体轴X约-.20。
运行时猫与饰品统一+0.20 X，再置于独立yaw组。不要重新居中含尾巴的包围盒。

| APP动作 | GLB clip | 时长 |
| --- | --- | --- |
| 轻碰泡泡 | bubble_touch | 2.6秒 |
| 接住星光 | star_catch | 2.8秒 |
| 闻一闻花香 | flower_sniff | 3.0秒 |
| 迎接小雪花 | snowflake | 2.8秒 |

动作只变形局部骨骼，Root/Body保持静止；臀和另一前爪落地。骨骼挂点为Anchor_Head、
Anchor_Chest、Anchor_Back、Anchor_Paw_L、Anchor_Paw_R。挂件使用关节相对rest的矩阵变化，
不能把旧世界坐标直接作为bone局部坐标。APP在动作进度0/1与取消时恢复精确rest。

## 外观与来源

用户选定无阴影。模型、饰品均使用无光照颜色材质，不加投影/AO/CSS阴影。
贴图已重新展开、转移原色并扩边，必须保留正常mipmap以避免缩小毛发噪点。
原碎UV不适合mipmap，曾导致深蓝面罩和爪尖白丝，已弃用。

输入为用户提供的Meshy GLB（原件SHA256
`ecc582e973fd29a417e83619c76e522568c0593c1597451ab979f10e3a34eacd`）。
角色身份参照原v5正面；侧背造型属于生成和后续人工调整的设计推断。
完整几何构建、UV转移与前后对照保存在
`Q:/NAVA-Workspace/Build/TestRuns/mascot-rebuild-research`。

最终生产猫为123,764三角面、87,032导出顶点、1材质、14骨、4动作，9,569,944字节。
母版独立重导已与生产GLB逐字节一致。真实手机GPU性能/功耗须在设备上单独验证。
