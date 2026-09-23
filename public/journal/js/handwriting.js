__fluffyModules["handwriting.js"] = (() => {
const { graphemes } = __fluffyModules["model.js"];
const CACHE = new Map();
/**
 * 输入：x（数值）。
 * 输出：限制在0到1的进度。
 * 功能：防止笔画播放时间超出合法区间。
 */
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
/**
 * 输入：points（二维路径点）。
 * 输出：各点对应的累计弧长数组。
 * 功能：用实际路程驱动笔尖与墨迹，避免短线和长线以同样时间突变。
 */
function arcLengths(points) {
    const lens = [0];
    for (let i = 1; i < points.length; i++)
        lens.push(lens.at(-1) + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    return lens;
}
/**
 * 输入：mask（二值字形），width、height（像素大小）。
 * 输出：单像素中心线的二值数组。
 * 功能：以 Zhang–Suen 细化提取任意系统字形；这不是汉字标准笔顺引擎。
 */
function thin(mask, width, height) {
    const image = mask.slice();
    for (let pass = 0; pass < 32; pass++) {
        let changed = false;
        for (let phase = 0; phase < 2; phase++) {
            const remove = [];
            for (let y = 1; y < height - 1; y++)
                for (let x = 1; x < width - 1; x++) {
                    const i = y * width + x;
                    if (!image[i])
                        continue;
                    const p = [image[i - width], image[i - width + 1], image[i + 1], image[i + width + 1], image[i + width], image[i + width - 1], image[i - 1], image[i - width - 1]];
                    const count = p.reduce((sum, value) => sum + value, 0);
                    if (count < 2 || count > 6)
                        continue;
                    let transitions = 0;
                    for (let k = 0; k < 8; k++)
                        if (!p[k] && p[(k + 1) % 8])
                            transitions++;
                    if (transitions !== 1)
                        continue;
                    const a = phase ? p[0] * p[2] * p[6] : p[0] * p[2] * p[4];
                    const b = phase ? p[0] * p[4] * p[6] : p[2] * p[4] * p[6];
                    if (!a && !b)
                        remove.push(i);
                }
            if (remove.length)
                changed = true;
            for (const i of remove)
                image[i] = 0;
        }
        if (!changed)
            break;
    }
    return image;
}
/**
 * 输入：mask（中心线像素），width、height（大小）。
 * 输出：有序折线路径数组。
 * 功能：将中心线图拆成可描写的路径，并处理闭环、交点和孤立点。
 */
function trace(mask, width, height) {
    const neighbours = new Map(), edges = new Set(), paths = [];
    /**
     * 输入：a/b（相邻像素的节点索引）。
     * 输出：与方向无关的边标识字符串。
     * 功能：标记已经走过的邻接边，防止同一笔段正反重复描绘。
     */
    const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i])
            continue;
        const x = i % width, y = Math.floor(i / width), points = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy)
                    continue;
                const nx = x + dx, ny = y + dy, n = ny * width + nx;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[n])
                    continue;
                // 对直角连接避免再添加对角捷径，否则会在同一小区域反复描写。
                if (dx && dy && (mask[y * width + nx] || mask[ny * width + x]))
                    continue;
                points.push(n);
            }
        neighbours.set(i, points);
    }
    const starts = [...neighbours.keys()].sort((a, b) => (neighbours.get(a).length === 2) - (neighbours.get(b).length === 2) || a - b);
    for (const start of starts) {
        const ns = neighbours.get(start);
        if (!ns.length)
            paths.push([[start % width, Math.floor(start / width)], [start % width + .1, Math.floor(start / width)]]);
        for (const next of ns) {
            if (edges.has(key(start, next)))
                continue;
            const path = [start];
            let previous = start, current = next;
            while (true) {
                edges.add(key(previous, current));
                path.push(current);
                const adjacent = neighbours.get(current), options = adjacent.filter(n => n !== previous && !edges.has(key(current, n)));
                if (adjacent.length !== 2 || !options.length)
                    break;
                previous = current;
                current = options[0];
            }
            if (path.length > 1)
                paths.push(path.map(i => [i % width, Math.floor(i / width)]));
        }
    }
    // 方向由上到下、由左到右启发式排列；不声称这是语言学上的正确笔顺。
    for (const p of paths)
        if (p[0][1] + p[0][0] * .35 > p.at(-1)[1] + p.at(-1)[0] * .35)
            p.reverse();
    return paths.sort((a, b) => a[0][1] + a[0][0] * .35 - b[0][1] - b[0][0] * .35);
}
/**
 * 输入：points（栅格中心线路径）。
 * 输出：降噪并轻微圆滑的点列。
 * 功能：去除像素阶梯和印刷字形的硬拐角，保留字符内容与端点。
 */
function smoothCenterline(points) {
    if (points.length < 4) return points;
    // 阶段一：移除密集的亚笔宽折点，保留起止点和主要转折。
    const anchors = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        if (Math.hypot(points[i][0] - anchors.at(-1)[0], points[i][1] - anchors.at(-1)[1]) >= 2.4) anchors.push(points[i]);
    }
    anchors.push(points.at(-1));
    // 阶段二：两轮 Chaikin 圆滑，不挪动落笔与收笔端点。
    let result = anchors;
    for (let pass = 0; pass < 2; pass++) {
        const next = [result[0]];
        for (let i = 0; i < result.length - 1; i++) {
            const a = result[i], b = result[i + 1];
            next.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
        }
        next.push(result.at(-1)); result = next;
    }
    return result;
}
/**
 * 输入：fraction（笔画时间进度）。
 * 输出：弧长进度。
 * 功能：轻微放慢起笔和收笔；笔尖与墨迹共用同一函数。
 */
function inkProgress(fraction) {
    const u = clamp(fraction), eased = u * u * u * (10 + u * (-15 + 6 * u));
    return u * .68 + eased * .32;
}
/**
 * 输入：char（一个字素）。
 * 输出：参考字形画布、中心线与宽度。
 * 功能：提取自绘字库尚未覆盖的字符中心线，最终绘制为手写墨迹而非印刷轮廓。
 */
function rasterGlyph(char) {
    if (CACHE.has(char))
        return CACHE.get(char);
    const canvas = document.createElement("canvas");
    canvas.width = 104;
    canvas.height = 96;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.font = '400 64px "Kaiti SC","STKaiti","KaiTi","楷体","AR PL KaitiM GB","Noto Serif CJK SC",serif';
    ctx.fillStyle = "#113b73";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(char, 8, 76);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height), mask = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < mask.length; i++)
        mask[i] = data.data[i * 4 + 3] > 48 ? 1 : 0;
    const skeleton = thin(mask, canvas.width, canvas.height);
    const paths = trace(skeleton, canvas.width, canvas.height);
    const value = { raster: true, canvas, width: Math.min(90, Math.max(16, ctx.measureText(char).width)), paths };
    CACHE.set(char, value);
    return value;
}
/**
 * 输入：char（字素），size（目标字号）。
 * 输出：该字素的排版宽度。
 * 功能：优先采用自绘笔画；其余字符从本机楷体提取中心线，不分发字体文件。
 */
function glyphWidth(char, size) {
    if (window.Ink.glyphs[char])
        return (window.Ink.glyphs[char].w + .1) * size;
    return (rasterGlyph(char).width / 64 + .13) * size;
}
/**
 * 输入：text（确认后的字段文字），maxWidth、maxHeight（显示区域）。
 * 输出：可绘制、可采样笔尖的 line 对象。
 * 功能：自动换行；maxHeight 为 Infinity 时保持 25px 字号，扩展实际纸面高度，不挤压长备注。
 */
function makeHandwriting(text, maxWidth = 250, maxHeight = 54) {
    const chars = graphemes(text);
    let size = 25, placements;
    // 阶段一：有限高度调用保持兼容；笔记采用无限纸长，字号不随字数变小。
    while (size >= 10) {
        placements = [];
        let x = 0, row = 0;
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            // 显式换行保留；英文按词换行，超长单词才按字素折行。
            if (char === "\r") continue;
            if (char === "\n") { x = 0; row++; continue; }
            if (char === " " && x === 0) continue;
            if (/[A-Za-z0-9]/.test(char) && (i === 0 || /[\s]/.test(chars[i - 1]))) {
                let wordWidth = 0;
                for (let j = i; j < chars.length && /[A-Za-z0-9'’-]/.test(chars[j]); j++) wordWidth += glyphWidth(chars[j], size);
                if (wordWidth <= maxWidth && x > 0 && x + wordWidth > maxWidth) { x = 0; row++; }
            }
            const width = glyphWidth(char, size);
            if (x + width > maxWidth && x > 0) { x = 0; row++; }
            placements.push({ char, x, y: row * size * 1.45, row, width });
            x += width;
        }
        if ((row + 1) * size * 1.45 <= maxHeight || size === 10)
            break;
        size--;
    }
    const strokes = [], glyphs = [];
    let clock = 0;
    // 阶段二：将每个字的真实路径加入同一时间轴；抬笔间隔也属于时间轴。
    for (const [ordinal, item] of placements.entries()) {
        const core = window.Ink.glyphs[item.char], scale = size / (core ? 25 : 64);
        const glyph = { ...item, start: clock, strokes: [], raster: !core, scale };
        let paths;
        if (core)
            paths = window.Ink.make(item.char).strokes.map(st => st.pts);
        else {
            glyph.source = rasterGlyph(item.char);
            paths = glyph.source.paths.map(path => path.map(([x, y]) => [x - 8, y - 18]));
        }
        for (const path of paths) {
            // 同一字使用固定的微小布白变化，循环回来时不随机改变字样。
            const tilt = Math.sin(ordinal * 2.41 + item.char.codePointAt(0)) * .023;
            const sway = Math.sin(ordinal * 1.77) * size * .018;
            const softened = core ? path : smoothCenterline(path);
            const points = softened.map(([x, y]) => {
                const yy = y * scale, xx = x * scale;
                return [item.x + xx + (.035 + tilt) * (size - yy), item.y + yy + sway];
            });
            const lengths = arcLengths(points), duration = Math.max(.035, lengths.at(-1) / 115);
            const st = { points, lengths, start: clock, duration, glyph, width: 1.85 * (size / 25) ** .65, seed: strokes.length * .61 };
            strokes.push(st);
            glyph.strokes.push(st);
            clock += duration + .055;
        }
        glyph.end = clock;
        glyphs.push(glyph);
        clock += item.char === " " ? .025 : .018;
    }
    // 阶段三：横线由本行墨迹下边缘确定，而不是放在下一项标题上方。
    const rowCount = Math.max(1, ...placements.map(item => item.row + 1));
    const ruleOffsets = Array.from({ length: rowCount }, (_, row) => {
        const ink = strokes.filter(st => st.glyph.row === row).flatMap(st => st.points.map(point => point[1]));
        return (ink.length ? Math.max(...ink) : (row * 1.45 + 1) * size) + 3;
    });
    // 阶段四：记录每一视觉行的笔画时间。自动送纸只在行间抬笔时发生。
    const rowAdvance = size * 1.45;
    const visualRows = Array.from({ length: rowCount }, (_, row) => {
        const items = strokes.filter(stroke => stroke.glyph.row === row);
        const last = items.at(-1);
        return { row, offset: row * rowAdvance, start: items[0]?.start ?? 0,
            end: last ? last.start + last.duration : .1 };
    });
    const measuredHeight = Math.max(size, ruleOffsets.at(-1) + 3);
    return { text, strokes, glyphs, size, ruleOffsets, rowCount, rowAdvance, visualRows,
        duration: Math.max(clock, .1), width: maxWidth,
        height: Number.isFinite(maxHeight) ? maxHeight : measuredHeight, measuredHeight };
}
/**
 * 输入：stroke（路径），fraction（弧长比例）。
 * 输出：[x,y]。
 * 功能：沿路径插值得到真实笔尖位置，供绘制与角色共用。
 */
function strokePoint(stroke, fraction) {
    const { points, lengths } = stroke, target = lengths.at(-1) * clamp(fraction);
    let k = 1;
    while (k < lengths.length - 1 && lengths[k] < target)
        k++;
    if (!points[k])
        return points[0] || [0, 0];
    const p = (target - lengths[k - 1]) / Math.max(.00001, lengths[k] - lengths[k - 1]);
    return [points[k - 1][0] + (points[k][0] - points[k - 1][0]) * p, points[k - 1][1] + (points[k][1] - points[k - 1][1]) * p];
}
/**
 * 输入：line（手写排版），time（该排版内时间）。
 * 输出：{x,y,down}；down 表示笔尖是否落纸。
 * 功能：在两笔之间连续抬笔转移，而不是瞬移到下一笔。
 */
function sampleHandwriting(line, time) {
    let previous = line.strokes[0]?.points[0] || [0, 0], previousEnd = 0;
    for (const st of line.strokes) {
        if (time < st.start) {
            const u = clamp((time - previousEnd) / (st.start - previousEnd || 1)), p = u * u * u * (10 + u * (-15 + 6 * u)), b = st.points[0];
            return { x: previous[0] + (b[0] - previous[0]) * p, y: previous[1] + (b[1] - previous[1]) * p - Math.sin(u * Math.PI) ** 2 * 4, down: false };
        }
        if (time <= st.start + st.duration) {
            const p = strokePoint(st, inkProgress((time - st.start) / st.duration));
            return { x: p[0], y: p[1], down: true };
        }
        previous = st.points.at(-1);
        previousEnd = st.start + st.duration;
    }
    return { x: previous[0], y: previous[1], down: false };
}
/**
 * 输入：ctx（画布上下文），stroke（路径），fraction（完成比例）。
 * 输出：无，向当前画布写入路径。
 * 功能：仅描画到笔尖所在位置，而不是按文字矩形从左到右擦出。
 */
function paintStroke(ctx, stroke, fraction) {
    const p = inkProgress(fraction);
    if (p <= 0) return;
    // 阶段一：沿笔尖相同弧长取点，未经过的位置不提前出现墨迹。
    if (p >= 1 && stroke.finishedPath) { ctx.fill(stroke.finishedPath); return; }
    const total = stroke.lengths.at(-1), target = total * p, points = [], distances = [];
    for (let i = 0; i < stroke.points.length; i++) {
        if (stroke.lengths[i] >= target) break;
        points.push(stroke.points[i]); distances.push(stroke.lengths[i]);
    }
    points.push(strokePoint(stroke, p)); distances.push(target);
    if (points.length < 2) return;
    // 阶段二：连续笔路展开为有轻重的墨迹带，写完不盖回方正的字体。
    const left = [], right = [], radii = [];
    for (let i = 0; i < points.length; i++) {
        const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
        const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.hypot(dx, dy) || 1;
        const u = distances[i] / Math.max(.001, total);
        const pressure = .69 + .3 * Math.sin(Math.PI * u) + .055 * Math.sin(stroke.seed + u * 7);
        const r = stroke.width * pressure / 2; radii.push(r);
        left.push([points[i][0] - dy / length * r, points[i][1] + dx / length * r]);
        right.push([points[i][0] + dy / length * r, points[i][1] - dx / length * r]);
    }
    const shape = new Path2D(); shape.moveTo(...left[0]);
    for (let i = 1; i < left.length; i++) shape.lineTo(...left[i]);
    for (let i = right.length - 1; i >= 0; i--) shape.lineTo(...right[i]);
    shape.closePath();
    shape.moveTo(points[0][0] + radii[0], points[0][1]); shape.arc(...points[0], radii[0], 0, Math.PI * 2);
    const last = points.at(-1), radius = radii.at(-1);
    shape.moveTo(last[0] + radius, last[1]); shape.arc(...last, radius, 0, Math.PI * 2);
    ctx.fill(shape);
    if (p >= 1) stroke.finishedPath = shape;
}
/**
 * 输入：ctx、line、time、x、y（目标位置和笔画时间）。
 * 输出：无。
 * 功能：所有字符使用统一手写墨迹，循环回来时保留已写的路径。
 */
function drawHandwriting(ctx, line, time, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = "#113b73";
    for (const stroke of line.strokes) {
        if (time < stroke.start) break;
        paintStroke(ctx, stroke, (time - stroke.start) / stroke.duration);
    }
    ctx.restore();
}

return {makeHandwriting,sampleHandwriting,drawHandwriting};
})();
