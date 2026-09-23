/* Reveal the exact approved title through hand-drawn stroke masks, letter by
 * letter, rather than typing characters or wiping a rectangular text box. */
window.HandTitle = class {
    /**
     * 输入：image（已确认的标题原图）、meta（标题坐标）。
     * 输出：HandTitle实例。
     * 功能：为每个字母设置独立笔画遮罩与开始时间，保留原图字形。
     */
    constructor(image, meta) {
        this.image = image;
        this.box = meta.box;
        this.mask = document.createElement('canvas');
        this.mask.width = 786;
        this.mask.height = 1704;
        this.out = this.mask.cloneNode();
        this.glyphs = [
            { box: [68, 159, 112, 217], d: .72, s: [[[104, 169], [97, 165], [86, 169], [76, 182], [75, 198], [81, 207], [92, 209], [104, 202], [106, 186], [89, 190]]] },
            { box: [115, 173, 138, 210], d: .35, s: [[[120, 180], [122, 202], [123, 188], [129, 180], [134, 179]]] },
            { box: [138, 168, 166, 207], d: .5, s: [[[145, 187], [156, 183], [157, 178], [152, 175], [146, 179], [142, 191], [148, 199], [158, 199], [162, 197]]] },
            { box: [165, 168, 195, 204], d: .54, s: [[[186, 178], [180, 175], [173, 181], [171, 190], [175, 199], [183, 194], [187, 177], [188, 194], [191, 198]]] },
            { box: [195, 149, 222, 204], d: .49, s: [[[208, 155], [205, 172], [206, 187], [208, 197], [216, 197]], [[199, 174], [217, 173]]] },
            { box: [224, 147, 252, 221], d: .67, s: [[[245, 175], [244, 192], [242, 208], [237, 214], [231, 213]], [[246, 157], [246, 156]]] },
            { box: [252, 167, 279, 204], d: .48, s: [[[266, 175], [259, 180], [258, 192], [264, 198], [271, 193], [274, 183], [270, 176], [266, 175]]] },
            { box: [280, 149, 311, 205], d: .63, s: [[[290, 155], [287, 176], [285, 196], [287, 187], [298, 179], [304, 184], [301, 194], [291, 200], [285, 196]]] },
            { box: [312, 159, 330, 210], d: .34, s: [[[325, 163], [320, 190]], [[317, 204], [317, 204.6]]] }
        ];
        let t = .42;
        for (const g of this.glyphs) {
            g.start = t;
            t += g.d + .055;
        }
        this.end = t;
    }
    /**
     * 输入：ctx、t（标题动画时间）。
     * 输出：无。
     * 功能：沿各字母笔画逐段揭露原图，不使用打字机或横向矩形擦除。
     */
    draw(ctx, t) {
        if (t >= this.end) {
            const b = this.box;
            ctx.drawImage(this.image, b[0], b[1], b[2] - b[0], b[3] - b[1]);
            return;
        }
        const out = this.out.getContext('2d'), mask = this.mask.getContext('2d');
        out.setTransform(2, 0, 0, 2, 0, 0);
        out.clearRect(0, 0, 393, 852);
        mask.setTransform(2, 0, 0, 2, 0, 0);
        mask.clearRect(0, 0, 393, 852);
        mask.fillStyle = mask.strokeStyle = '#fff';
        mask.lineCap = 'round';
        mask.lineJoin = 'round';
        mask.lineWidth = 16;
        for (const g of this.glyphs) {
            const p = M.clamp((t - g.start) / g.d);
            if (p <= 0)
                break;
            if (p >= 1) {
                mask.fillRect(g.box[0], g.box[1], g.box[2] - g.box[0], g.box[3] - g.box[1]);
                continue;
            }
            const lengths = g.s.map(st => st.slice(1).reduce((sum, v, i) => sum + Math.hypot(v[0] - st[i][0], v[1] - st[i][1]), 0));
            const total = lengths.reduce((a, b) => a + b, 0);
            let available = total * p;
            for (let i = 0; i < g.s.length; i++) {
                const st = g.s[i];
                if (available <= 0)
                    break;
                mask.beginPath();
                mask.moveTo(...st[0]);
                let used = 0;
                for (let k = 1; k < st.length; k++) {
                    const len = Math.hypot(st[k][0] - st[k - 1][0], st[k][1] - st[k - 1][1]);
                    if (used + len <= available)
                        mask.lineTo(...st[k]);
                    else {
                        mask.lineTo(...M.point(st[k - 1], st[k], (available - used) / (len || 1)));
                        break;
                    }
                    used += len;
                }
                mask.stroke();
                available -= lengths[i];
            }
        }
        const b = this.box;
        out.globalCompositeOperation = 'source-over';
        out.drawImage(this.image, b[0], b[1], b[2] - b[0], b[3] - b[1]);
        out.globalCompositeOperation = 'destination-in';
        out.drawImage(this.mask, 0, 0, 393, 852);
        out.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.out, 0, 0, 393, 852);
    }
};
