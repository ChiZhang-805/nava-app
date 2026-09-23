/* Seam-free fallback rasterizer. Triangles write into one pixel buffer rather
 * than overlapping Canvas clipping masks. Shared edges cannot become seams.
 * Source-image alpha supplies the soft anti-aliased fur edge. */
window.CpuTextureMesh = class {
    /**
     * 输入：images、art（源图与坐标）。
     * 输出：CpuTextureMesh实例。
     * 功能：缓存图层像素和输出缓冲，为不支持WebGL的设备提供回退。
     */
    constructor(images, art) {
        this.art = art;
        this.items = {};
        this.ratio = 2;
        for (const key of ['hero', 'head']) {
            const im = images[key], src = document.createElement('canvas');
            src.width = im.naturalWidth;
            src.height = im.naturalHeight;
            src.getContext('2d').drawImage(im, 0, 0);
            const b = art[key].box, ox = Math.floor(b[0]) - 12, oy = Math.floor(b[1]) - 14;
            const out = document.createElement('canvas');
            out.width = Math.ceil(b[2] - ox + 12) * 2;
            out.height = Math.ceil(b[3] - oy + 12) * 2;
            this.items[key] = { src: src.getContext('2d').getImageData(0, 0, src.width, src.height).data, sw: src.width, sh: src.height, canvas: out, ctx: out.getContext('2d'), data: new ImageData(out.width, out.height), origin: [ox, oy], last: null, verts: null };
        }
    }
    /**
     * 输入：key（图层名）、warp（连续变形函数）。
     * 输出：含canvas和origin的渲染结果。
     * 功能：用重心坐标把每个三角形写入同一像素缓冲，避免透明毛边产生缝隙。
     */
    render(key, warp) {
        const it = this.items[key], b = this.art[key].box, nx = 18, ny = 16, verts = [];
        let change = !it.last;
        for (let j = 0; j <= ny; j++)
            for (let i = 0; i <= nx; i++) {
                const p = warp(b[0] + (b[2] - b[0]) * i / nx, b[1] + (b[3] - b[1]) * j / ny);
                const v = [(p[0] - it.origin[0]) * 2, (p[1] - it.origin[1]) * 2, it.sw * i / nx, it.sh * j / ny];
                const k = verts.length;
                if (it.last && (Math.abs(v[0] - it.last[k][0]) > .22 || Math.abs(v[1] - it.last[k][1]) > .22))
                    change = true;
                verts.push(v);
            }
        if (!change)
            return it;
        const out = it.data.data, src = it.src, W = it.canvas.width, H = it.canvas.height, SW = it.sw, SH = it.sh;
        out.fill(0);
        /**
         * 输入：a/b/c（目标三角形顶点，含源纹理坐标）。
         * 输出：无，写入共享像素缓冲。
         * 功能：在包围盒内用重心坐标采样源像素，避免裁剪接缝。
         */
        const tri = (a, b, c) => {
            const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1], det = ux * vy - uy * vx;
            if (Math.abs(det) < 1e-6)
                return;
            const ia = vy / det, ib = -vx / det, ic = -uy / det, id = ux / det;
            const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
            const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
            const ds1 = b[2] - a[2], ds2 = c[2] - a[2], dt1 = b[3] - a[3], dt2 = c[3] - a[3];
            for (let y = miny; y <= maxy; y++) {
                let w1 = ia * (minx + .5 - a[0]) + ib * (y + .5 - a[1]), w2 = ic * (minx + .5 - a[0]) + id * (y + .5 - a[1]);
                for (let x = minx; x <= maxx; x++, w1 += ia, w2 += ic) {
                    if (w1 < -.00001 || w2 < -.00001 || w1 + w2 > 1.00001)
                        continue;
                    let sx = a[2] + w1 * ds1 + w2 * ds2, sy = a[3] + w1 * dt1 + w2 * dt2;
                    sx = Math.min(SW - 1, Math.max(0, sx | 0));
                    sy = Math.min(SH - 1, Math.max(0, sy | 0));
                    const si = (sy * SW + sx) * 4, oi = (y * W + x) * 4;
                    out[oi] = src[si];
                    out[oi + 1] = src[si + 1];
                    out[oi + 2] = src[si + 2];
                    out[oi + 3] = src[si + 3];
                }
            }
        };
        for (let j = 0; j < ny; j++)
            for (let i = 0; i < nx; i++) {
                const k = j * (nx + 1) + i;
                tri(verts[k], verts[k + 1], verts[k + nx + 1]);
                tri(verts[k + 1], verts[k + nx + 2], verts[k + nx + 1]);
            }
        it.ctx.putImageData(it.data, 0, 0);
        it.last = verts;
        return it;
    }
};
