/* 共用手写笔记：变高字段、逐行送纸、有限阅读。坐标与 DOM 滚动都以 393×852 设计像素计算。 */
__fluffyModules["notebook-layout.js"] = (() => {
    "use strict";
    const PAPER = Object.freeze({
        originY: 470, writingOffset: -22, clipTop: 417, clipBottom: 707,
        labelOffset: -12, labelAscent: 14, fieldGap: 30, bottomPadding: 20,
        left: 42, width: 310, inkX: 56, ruleLeft: 53, ruleRight: 340,
        fontSize: 25, inkWidth: 270
    });
    /**
     * 输入：value、low、high（数值及上下限）。
     * 输出：被限制的有限数值。
     * 功能：隔离 Safari 弹性滚动的负值/超限值，不在边界露出循环副本。
     */
    function clamp(value, low = 0, high = 1) { return Math.min(high, Math.max(low, Number.isFinite(value) ? value : low)); }
    /**
     * 输入：time、start、end（当前时刻和过渡区间）。
     * 输出：0..1 五次缓动进度。
     * 功能：送纸前后速度与加速度归零，避免改用变高字段后突跳。
     */
    function progress(time, start, end) { const u = clamp((time - start) / Math.max(.001, end - start)); return u * u * u * (10 + u * (-15 + 6 * u)); }
    /**
     * 输入：lines（实测手写字段，可含任意数量视觉行）。
     * 输出：字段起点、循环总长、有限阅读高度和最大滚动量。
     * 功能：下一标题只由上一项最后一条横线定位，固定保留 30px 的字段间留白。
     */
    function createLayout(lines) {
        if (!Array.isArray(lines) || !lines.length) throw new Error("A notebook needs at least one field.");
        let top = 0;
        // 阶段一：按实际最后一条书写线逐项累积，不再假定三项或固定90px。
        const fields = lines.map((line, index) => {
            const lastRule = Number(line.ruleOffsets?.at(-1) ?? line.measuredHeight ?? line.height);
            if (!Number.isFinite(lastRule) || lastRule < 0) throw new Error("Invalid notebook field height.");
            const height = lastRule + PAPER.fieldGap - PAPER.labelOffset + PAPER.labelAscent;
            const field = { index, top, height, lastRule, titleTop: top + PAPER.labelOffset - PAPER.labelAscent };
            top += height;
            return field;
        });
        // 阶段二：阅读只含一份数据，末行线下面留20px，不加虚构的整圈尾部。
        const last = fields.at(-1), viewportHeight = PAPER.clipBottom - PAPER.clipTop;
        const contentHeight = Math.max(viewportHeight, Math.ceil(PAPER.originY - PAPER.clipTop + last.top + last.lastRule + PAPER.bottomPadding));
        return { fields, period: top, viewportHeight, contentHeight, maxScroll: Math.max(0, contentHeight - viewportHeight) };
    }
    /**
     * 输入：layout、lines（与其对应的实际字迹）。
     * 输出：segments（逐视觉行时序）、schedule（逐字段时序）、writeEnd、returnEnd。
     * 功能：长备注逐行写、行间抬笔送纸，短前爪不因文字变多而被向下拉长。
     */
    function createTimeline(layout, lines) {
        let cursor = 2.15;
        const segments = [], schedule = [];
        for (const [index, line] of lines.entries()) {
            const rows = line.visualRows?.length ? line.visualRows : [{ row: 0, offset: 0, start: 0, end: line.duration }];
            const fieldStart = cursor;
            for (const row of rows) {
                const duration = clamp((row.end - row.start) * .83, 1.15, 6.1);
                const segment = { index, row: row.row, from: row.start, to: row.end,
                    start: cursor, end: cursor + duration,
                    offset: PAPER.writingOffset - layout.fields[index].top - row.offset };
                segments.push(segment);
                cursor += duration + (row.row === rows.at(-1).row ? .95 : .78);
            }
            schedule.push({ start: fieldStart, end: segments.at(-1).end });
        }
        const writeEnd = segments.at(-1).end;
        return { segments, schedule, writeEnd, returnStart: writeEnd + .25, returnEnd: writeEnd + 2.25 };
    }
    /**
     * 输入：layout、timeline、time。
     * 输出：循环书写阶段累计纸面偏移。
     * 功能：末笔后继续向上送到下一圈第一项，终点恰好相当于有限笔记的scrollTop=0。
     */
    function paperOffset(layout, timeline, time) {
        const first = timeline.segments[0];
        if (time < first.start) return first.offset * progress(time, 1.55, first.start);
        for (let i = 0; i < timeline.segments.length; i++) {
            const segment = timeline.segments[i], next = timeline.segments[i + 1];
            if (time <= segment.end) return segment.offset;
            if (next && time < next.start) return segment.offset + (next.offset - segment.offset) * progress(time, segment.end + .12, next.start - .12);
        }
        const lastOffset = timeline.segments.at(-1).offset;
        return lastOffset + (-layout.period - lastOffset) * progress(time, timeline.returnStart, timeline.returnEnd);
    }
    /**
     * 输入：timeline、lines、index、time。
     * 输出：该逻辑字段已经走过的笔画时钟。
     * 功能：循环副本共用唯一字迹进度；换行期间不提前写下一行。
     */
    function fieldClock(timeline, lines, index, time) {
        const segments = timeline.segments.filter(segment => segment.index === index);
        for (const segment of segments) {
            if (time < segment.start) return segment.from;
            if (time <= segment.end) return segment.from + (segment.to - segment.from) * clamp((time - segment.start) / (segment.end - segment.start));
        }
        return lines[index].duration;
    }
    /**
     * 输入：layout、index、offset、reading、scrollTop。
     * 输出：可见纸段附近的各副本 {y,cycle,canonical}；阅读模式严格只有一份。
     * 功能：用真实总纸长循环，完成以后删除首尾副本，不能继续滚回最后一项。
     */
    function positions(layout, index, offset, reading = false, scrollTop = 0) {
        const origin = PAPER.originY + layout.fields[index].top;
        if (reading) return [{ y: origin - clamp(scrollTop, 0, layout.maxScroll), cycle: 0, canonical: true }];
        const y = origin + offset;
        const start = Math.floor((PAPER.clipTop - y - layout.fields[index].height) / layout.period);
        const end = Math.ceil((PAPER.clipBottom - y + 26) / layout.period);
        const result = [];
        for (let cycle = start; cycle <= end; cycle++) result.push({ y: y + cycle * layout.period, cycle, canonical: cycle === 0 });
        return result;
    }
    return { PAPER, clamp, progress, createLayout, createTimeline, paperOffset, fieldClock, positions };
})();
