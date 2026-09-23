/* All pose changes use continuous functions. No pose sprites or frame swapping. */
window.M = (() => {
    /**
     * 输入：v（待限制数值）、a/b（上下界）。
     * 输出：区间内的数值。
     * 功能：限制动画参数范围，防止外推变形。
     */
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    /**
     * 输入：a/b（端点）、t（插值比例）。
     * 输出：线性插值结果。
     * 功能：在两个标量状态之间平滑取值。
     */
    const mix = (a, b, t) => a + (b - a) * t;
    /**
     * 输入：x（进度）。
     * 输出：0到1的五次平滑进度。
     * 功能：让动作两端速度和加速度收敛到零。
     */
    const smooth = x => { x = clamp(x); return x * x * x * (10 + x * (-15 + 6 * x)); };
    /**
     * 输入：t（时间）、a/b（起止时间）。
     * 输出：平滑的局部进度。
     * 功能：将不同阶段映射到统一的0到1参数。
     */
    const range = (t, a, b) => smooth((t - a) / (b - a));
    /**
     * 输入：a/b（二维端点）、t（比例）。
     * 输出：二维坐标。
     * 功能：按相同比例插值横纵坐标。
     */
    const point = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
    /**
     * 输入：p（四个二维控制点）、t（进度）。
     * 输出：三次贝塞尔曲线上的坐标。
     * 功能：计算尾巴、前爪与粒子的连续轨迹。
     */
    const bez = (p, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
    /**
     * 输入：p（曲线控制点）、t（进度）。
     * 输出：单位切向量。
     * 功能：沿曲线构建带状轮廓的法线。
     */
    const tangent = (p, t) => { const u = 1 - t; const d = [0, 1].map(k => 3 * u * u * (p[1][k] - p[0][k]) + 6 * u * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k])); const l = Math.hypot(...d) || 1; return d.map(x => x / l); };
    /**
     * 输入：ctx、x/y/w/h/r（圆角矩形参数）。
     * 输出：无，设置当前绘制路径。
     * 功能：复用圆角路径构造，不自动填充或描边。
     */
    const round = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    /**
     * 输入：x（进度）。
     * 输出：三次缓出进度。
     * 功能：让撒花粒子由快速散开逐渐停稳。
     */
    const easeOut = x => 1 - (1 - clamp(x)) ** 3;
    return { clamp, mix, smooth, range, point, bez, tangent, round, easeOut };
})();
