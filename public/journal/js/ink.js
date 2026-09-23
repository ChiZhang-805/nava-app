/* Single-stroke lettering. A shared, arc-length sampled path drives both ink and nib. */
(() => {
    'use strict';
    const G = {
        'M': { w: 1.02, s: [[[0, 1], [.15, 0], [.45, .65], [.8, 0], [.88, 1]]] },
        'o': { w: .59, s: [[[.46, .4], [.22, .34], [.08, .6], [.12, .9], [.32, .97], [.52, .77], [.49, .5], [.35, .37]]] },
        'r': { w: .5, s: [[[.05, .95], [.13, .4], [.12, .63], [.32, .39], [.46, .43]]] },
        'n': { w: .64, s: [[[.05, 1], [.15, .4], [.12, .67], [.34, .41], [.47, .46], [.47, .83], [.53, .94], [.62, .86]]] },
        'i': { w: .32, s: [[[.1, .42], [.04, .86], [.11, .97], [.25, .9]], [[.17, .17], [.18, .14]]] },
        'g': { w: .64, s: [[[.51, .46], [.3, .39], [.11, .57], [.1, .81], [.22, .94], [.43, .85], [.51, .47], [.39, 1.2], [.22, 1.43], [.03, 1.32]]] },
        'R': { w: .83, s: [[[.01, 1], [.2, .02], [.56, .03], [.72, .18], [.62, .4], [.17, .53], [.72, 1]]] },
        'u': { w: .65, s: [[[.12, .4], [.04, .81], [.15, .96], [.35, .87], [.54, .41], [.43, .85], [.5, .97], [.63, .87]]] },
        '3': { w: .68, s: [[[.12, .15], [.31, .01], [.54, .1], [.57, .29], [.31, .48], [.56, .57], [.56, .82], [.35, 1], [.08, .94]]] },
        '0': { w: .67, s: [[[.4, .02], [.17, .14], [.05, .54], [.09, .86], [.28, .99], [.49, .87], [.61, .5], [.57, .16], [.4, .02]]] },
        'm': { w: .86, s: [[[.01, .98], [.14, .42], [.09, .74], [.31, .41], [.42, .52], [.36, .89], [.59, .41], [.73, .5], [.69, .88], [.79, .97], [.86, .88]]] },
        'F': { w: .72, s: [[[.07, 1], [.23, .07], [.69, .07]], [[.19, .48], [.55, .48]]] },
        'e': { w: .57, s: [[[.06, .69], [.42, .61], [.47, .48], [.35, .38], [.14, .48], [.04, .75], [.18, .96], [.48, .91]]] },
        'l': { w: .34, s: [[[.12, .99], [.27, .07], [.17, 0], [.1, .22], [.02, .75], [.11, .98], [.3, .89]]] },
        't': { w: .43, s: [[[.25, .13], [.11, .82], [.18, .98], [.39, .9]], [[.05, .44], [.44, .43]]] },
        'a': { w: .59, s: [[[.48, .49], [.36, .4], [.17, .46], [.05, .73], [.15, .96], [.4, .79], [.5, .42], [.42, .86], [.53, .97]]] },
        '!': { w: .31, s: [[[.2, .08], [.12, .68]], [[.07, .95], [.08, .98]]] },
        ' ': { w: .35, s: [] }
    };
    /**
     * 输入：a/b（数值）、t（比例）。
     * 输出：插值数值。
     * 功能：为原始手写路径提供线性插值。
     */
    const lerp = (a, b, t) => a + (b - a) * t;
    /**
     * 输入：points（折线路径）。
     * 输出：经采样的平滑点列。
     * 功能：用Catmull–Rom曲线连接手写字形，保持转弯连贯。
     */
    function smoothPath(points) {
        if (points.length <= 2)
            return points;
        const out = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
            for (let j = 0; j < 9; j++) {
                const t = j / 9, t2 = t * t, t3 = t2 * t;
                out.push([0, 1].map(d => .5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
            }
        }
        return out.concat([points.at(-1)]);
    }
    /**
     * 输入：text（已有字形的文本）。
     * 输出：带时序和弧长的笔画集合。
     * 功能：构造基础拉丁字形；通用Unicode交给handwriting模块。
     */
    function make(text) {
        let x = 0, strokes = [], all = [], clock = 0;
        for (const ch of text) {
            const glyph = G[ch] || G[' '];
            for (const stroke of glyph.s) {
                const pts = smoothPath(stroke).map(p => [(p[0] + x) * 25, p[1] * 25]);
                const lens = [0];
                for (let i = 1; i < pts.length; i++)
                    lens.push(lens.at(-1) + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
                const duration = Math.max(.06, lens.at(-1) / 118);
                strokes.push({ pts, lens, start: clock, duration });
                clock += duration + .095;
            }
            x += glyph.w + .10;
        }
        return { text, strokes, width: x * 25, duration: clock };
    }
    /**
     * 输入：line（笔画集合）、time（局部时间）。
     * 输出：x/y坐标及是否落笔。
     * 功能：沿弧长采样，笔画之间抬笔而不是画出连线。
     */
    function sample(line, time) {
        let prev = null;
        for (const st of line.strokes) {
            if (time < st.start) {
                const b = st.pts[0], a = prev || b, t = Math.max(0, Math.min(1, (time - (st.start - .095)) / .095)), u = t * t * (3 - 2 * t);
                return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u) - Math.sin(Math.PI * t) * 7, down: false };
            }
            const p = Math.max(0, Math.min(1, (time - st.start) / st.duration));
            if (p < 1) {
                const len = st.lens.at(-1) * p;
                let k = 1;
                while (k < st.lens.length - 1 && st.lens[k] < len)
                    k++;
                const q = (len - st.lens[k - 1]) / Math.max(.0001, st.lens[k] - st.lens[k - 1]);
                return { x: lerp(st.pts[k - 1][0], st.pts[k][0], q), y: lerp(st.pts[k - 1][1], st.pts[k][1], q), down: true };
            }
            prev = st.pts.at(-1);
        }
        const p = prev || [0, 0];
        return { x: p[0], y: p[1], down: false };
    }
    /**
     * 输入：ctx、line、time、x/y、scale、color。
     * 输出：无。
     * 功能：绘制已经经过的笔画部分，与笔尖使用相同弧长参数。
     */
    function draw(ctx, line, time, x, y, scale = 1, color = '#173f73') {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.05;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const st of line.strokes) {
            if (time < st.start)
                break;
            const fraction = Math.min(1, (time - st.start) / st.duration), limit = st.lens.at(-1) * fraction;
            ctx.beginPath();
            ctx.moveTo(...st.pts[0]);
            for (let k = 1; k < st.pts.length; k++) {
                if (st.lens[k] <= limit) {
                    ctx.lineTo(...st.pts[k]);
                }
                else {
                    const q = (limit - st.lens[k - 1]) / Math.max(.0001, st.lens[k] - st.lens[k - 1]);
                    ctx.lineTo(lerp(st.pts[k - 1][0], st.pts[k][0], q), lerp(st.pts[k - 1][1], st.pts[k][1], q));
                    break;
                }
            }
            ctx.stroke();
        }
        ctx.restore();
    }
    window.Ink = { make, sample, draw, glyphs: G };
})();
