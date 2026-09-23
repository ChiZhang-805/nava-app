/* The approved cat is a layered character, not a sequence of screenshots.
 * Original texture -> gentle local mesh deformation for the head/ruff.
 * Forepaws -> continuous, rounded Bezier ribbons, with attachment hidden by fur.
 * Tail -> one continuous broad ribbon, white at its root and navy at its tip.
 * Ink and pencil share the exact same nib coordinate, in design pixels.
 */
window.CatActor = class {
    /**
     * 输入：images（原画图层）、art（图层坐标）。
     * 输出：CatActor实例。
     * 功能：建立同一角色的网格渲染器，WebGL不可用时延迟建立CPU回退。
     */
    constructor(images, art) {
        this.images = images;
        this.art = art;
        this.lastArmLength = 0;
        try {
            this.mesh = new TextureMesh(images, art);
        }
        catch (e) {
            this.mesh = null;
        }
    }
    /**
     * 输入：ctx、key（图层名）、warp（连续变形函数，可空）。
     * 输出：无，绘制图层。
     * 功能：按同一来源图层绘制柔和变形，不交换不同姿势图片。
     */
    texture(ctx, key, warp = null) {
        const meta = this.art[key], img = this.images[key], b = meta.box, w = b[2] - b[0], h = b[3] - b[1];
        if (!warp) {
            ctx.drawImage(img, ...b.slice(0, 2), w, h);
            return;
        }
        if (this.mesh) {
            try {
                ctx.drawImage(this.mesh.render(key, warp), 0, 0, 393, 852);
                return;
            } catch(error) {
                this.rendererFailure=error.message;
                this.mesh.dispose();
                this.mesh=null;
            }
        }
        if (!this.cpu)
            this.cpu = new CpuTextureMesh(this.images, this.art);
        const item = this.cpu.render(key, warp);
        ctx.drawImage(item.canvas, item.origin[0], item.origin[1], item.canvas.width / 2, item.canvas.height / 2);
    }
    /**
     * 输入：ctx、pts（四个曲线控制点）、r0/r1（根部和末端半径）、colors、options。
     * 输出：无，绘制带渐变的封闭轮廓。
     * 功能：以圆润带状曲线表达短前爪和宽尾巴，避免裸露硬关节。
     */
    ribbon(ctx, pts, r0, r1, colors, options = {}) {
        const n = 40, L = [], R = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, p = M.bez(pts, t), v = M.tangent(pts, t), r = M.mix(r0, r1, M.smooth(t));
            L.push([p[0] - v[1] * r, p[1] + v[0] * r]);
            R.push([p[0] + v[1] * r, p[1] - v[0] * r]);
        }
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(...L[0]);
        for (const p of L.slice(1))
            ctx.lineTo(...p);
        const p = pts[3], v = M.tangent(pts, 1);
        ctx.bezierCurveTo(L[n][0] + v[0] * r1 * 1.34, L[n][1] + v[1] * r1 * 1.34, R[n][0] + v[0] * r1 * 1.34, R[n][1] + v[1] * r1 * 1.34, ...R[n]);
        for (let i = n - 1; i >= 0; i--)
            ctx.lineTo(...R[i]);
        ctx.closePath();
        const g = ctx.createLinearGradient(...pts[0], ...pts[3]);
        for (const [stop, color] of colors)
            g.addColorStop(stop, color);
        ctx.fillStyle = g;
        if (options.shadow) {
            ctx.shadowColor = '#122e461a';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetY = 2;
        }
        ctx.fill();
        ctx.restore();
    }
    /**
     * 输入：ctx、root（毛下连接点）、grip（前爪位置）、形状选项。
     * 输出：无，更新本帧最长臂长并绘制前爪。
     * 功能：连续弯曲前爪，同时将连接根部融合进白毛。
     */
    arm(ctx, root, grip, { width = 23, tip = 14, bend = 0, sleep = 0 } = {}) {
        const dx = grip[0] - root[0], dy = grip[1] - root[1], len = Math.hypot(dx, dy) || 1;
        this.lastArmLength = Math.max(this.lastArmLength, len);
        const pts = [root, [root[0] + dx * .12 + bend, root[1] + dy * .48], [root[0] + dx * .66 + bend * .3, root[1] + dy * .98], grip];
        this.ribbon(ctx, pts, width, tip, [[0, '#ffffff00'], [.17, '#ffffff'], [.38, '#c3d2db'], [.68, '#456779'], [.91, '#13354c'], [1, '#0a2b43']]);
    }
    /**
     * 输入：ctx、hero（庆祝脸）、sleep、look、clock。
     * 输出：无。
     * 功能：用同一套极简白色五官连续表现眨眼、视线和闭眼。
     */
    face(ctx, hero, sleep = 0, look = 0, clock = 0, talk = 0) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = hero ? 3.75 : 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const xshift = (hero ? (this.homeLook || 0) : look) * 2.8;
        const heroBlink = hero ? Math.exp(-(((clock % 7.3 - 6.1) / .12) ** 2)) : 0;
        if (hero) {
            ctx.beginPath();
            ctx.moveTo(140 + xshift, 460);
            ctx.quadraticCurveTo(152 + xshift, 452.5 + heroBlink * 5, 167 + xshift, 457);
            ctx.moveTo(199 + xshift, 458);
            ctx.quadraticCurveTo(212 + xshift, 455 + heroBlink * 5, 226 + xshift, 463);
            ctx.stroke();
            ctx.lineWidth = 3.4;
            ctx.beginPath();
            ctx.moveTo(169, 474);
            ctx.bezierCurveTo(166, 482, 175, 480, 181, 476);
            ctx.bezierCurveTo(187, 483, 195, 481, 193, 474);
            ctx.stroke();
        }
        else {
            const blink = Math.exp(-(((clock % 6.7 - 5.7) / .11) ** 2)) * (1 - sleep);
            ctx.beginPath();
            ctx.moveTo(161 + xshift, 301);
            ctx.quadraticCurveTo(176 + xshift, 296 + sleep * 12 + blink * 3, 191 + xshift, 300);
            ctx.moveTo(222 + xshift, 302);
            ctx.quadraticCurveTo(237 + xshift, 302 + sleep * 10 + blink * 3, 249 + xshift, 308);
            ctx.stroke();
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(191 + xshift, 317);
            ctx.bezierCurveTo(186 + xshift, 324 + talk * 1.5, 198 + xshift, 324 + talk * 1.5, 202 + xshift, 320 + talk * .6);
            ctx.bezierCurveTo(210 + xshift, 327 + talk * 1.5, 220 + xshift, 324 + talk * 1.5, 217 + xshift, 317);
            ctx.stroke();
        }
        ctx.restore();
    }
    /**
     * 输入：t（庆祝时间，秒）。
     * 输出：左右爪位置、抬爪量和预备动作量。
     * 功能：计算四轮撒花的连续抬爪与收爪，不让结束时姿势跳变。
     */
    heroArms(t) {
        let p = (Math.min(t, 5.8) % 1.45) / 1.45;
        if (t >= 5.8)
            p = 0;
        const lift = M.range(p, .02, .34) * (1 - M.range(p, .58, .98));
        const load = M.range(p, 0, .16) * (1 - M.range(p, .16, .32));
        return {
            left: M.point([154, 609], [92, 503], lift), right: M.point([194, 609], [286, 500], Math.max(lift, (this.companionPet || 0) * .32)), lift, load
        };
    }
    /**
     * 输入：ctx、t（连续时间）。
     * 输出：无，绘制庆祝或等待中的小猫。
     * 功能：组合呼吸、轻晃尾巴和连续撒花前爪。
     */
    hero(ctx, t) {
        const a = this.heroArms(t), b = Math.sin(t * 1.7), rest = M.range(t, 5.65, 6.25);
        ctx.save();
        ctx.globalAlpha = .14;
        ctx.fillStyle = '#276c38';
        ctx.beginPath();
        ctx.ellipse(194, 617, 159, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const tail = [[243, 605], [280, 601], [323, 592 + Math.sin(t * 1.8 - .6) * 3], [347, 592 + Math.sin(t * 1.65) * 4]];
        this.ribbon(ctx, tail, 14, 17, [[0, '#ffffff'], [.25, '#c4d4dd'], [.56, '#557688'], [.81, '#173b55'], [1, '#082b46']]);
        /**
         * 输入：x/y（源图坐标）。
         * 输出：轻微位移后的坐标。
         * 功能：按毛部位权重叠加呼吸和撒花预备动作。
         */
        const warp = (x, y) => {
            const weight = M.clamp((620 - y) / 245), head = Math.exp(-(((y - 460) / 100) ** 2));
            return [x + (x - 189) * b * .002 * weight + Math.sin(t * 1.5 - .7) * .45 * Math.exp(-(((x - 293) / 28) ** 2)), y - b * .9 * weight + a.load * 1.6 * weight - a.lift * .5 * head];
        };
        this.texture(ctx, 'hero', warp);
        this.arm(ctx, M.point([145, 560], [132, 534], a.lift), a.left, { width: 15, tip: 12, bend: -4 * a.lift });
        this.arm(ctx, M.point([205, 560], [239, 534], a.lift), a.right, { width: 15, tip: 12, bend: 4 * a.lift });
        ctx.save();
        const faceLift = warp(189, 465);
        ctx.translate(faceLift[0] - 189, faceLift[1] - 465);
        this.face(ctx, true, 0, 0, t);
        ctx.restore();
    }
    /**
     * 输入：ctx、s（趴下进度）、clock（呼吸时钟）、shift（横移量）。
     * 输出：无，绘制胸腹与后躯。
     * 功能：通过胸背曲线渐变让身体原地安顿下来，而非缩放整张猫图。
     */
    torso(ctx, s, clock, shift = 0) {
        const breath = Math.sin(clock * (1.3 + s * .18)) * (.8 + s * .4);
        ctx.save();
        ctx.translate(shift, 0);
        ctx.beginPath();
        /**
         * 输入：a/b（躯干曲线端点）。
         * 输出：按趴下进度插值的点。
         * 功能：保持整段躯干轮廓的控制点连续。
         */
        const P = (a, b) => M.point(a, b, s);
        ctx.moveTo(...P([77, 415], [85, 415]));
        ctx.bezierCurveTo(...P([55, 390], [64, 394]), ...P([72, 331], [100, 333 - breath]), ...P([127, 316], [167, 307 - breath]));
        ctx.bezierCurveTo(...P([185, 284], [221, 278 - breath]), ...P([251, 314], [288, 303 - breath]), ...P([282, 350], [317, 341]));
        ctx.bezierCurveTo(...P([300, 372], [340, 370]), ...P([297, 401], [345, 399]), ...P([280, 415], [331, 416]));
        ctx.closePath();
        const g = ctx.createLinearGradient(90, 355, 340, 342);
        g.addColorStop(0, '#fefefe');
        g.addColorStop(.52, '#ffffff');
        g.addColorStop(.79, '#dce8ef');
        g.addColorStop(1, '#93b4ce');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();
        const sh = ctx.createRadialGradient(290, 354, 8, 268, 367, 105);
        sh.addColorStop(0, '#abc9dd50');
        sh.addColorStop(1, '#fdfefc00');
        ctx.fillStyle = sh;
        ctx.fillRect(60, 280, 300, 140);
        ctx.restore();
    }
    /**
     * 输入：ctx、s（收尾进度）、clock、front（是否前景层）。
     * 输出：无。
     * 功能：以同一条宽尾巴曲线随身体收拢，安排前后遮挡关系。
     */
    recordTail(ctx, s, clock, front = false) {
        const p0 = [[127, 381], [65, 358], [8, 397], [33, 413]];
        const p1 = [[219, 410], [256, 405], [313, 395], [335, 394]];
        const pts = p0.map((p, i) => M.point(p, p1[i], M.smooth(s)));
        pts[2][1] += Math.sin(clock * 1.5 - .5) * (1 - s) * 3;
        pts[3][1] += Math.sin(clock * 1.55 - 1) * (1 - s) * 4;
        if (front) {
            if (s < .5)
                return;
            ctx.save();
            ctx.globalAlpha *= M.range(s, .5, .85);
        }
        this.ribbon(ctx, pts, M.mix(18, 12, s), M.mix(16, 22, s), [[0, '#ffffff00'], [.16, '#ffffff'], [.30, '#e4eaf0'], [.48, '#95b1c6'], [.72, '#335877'], [1, '#082e4b']], { shadow: front });
        if (front)
            ctx.restore();
    }
    /**
     * 输入：ctx、pen（笔尖坐标和角度）。
     * 输出：无，绘制铅笔。
     * 功能：以笔尖为局部原点，确保握笔与落笔位置共用坐标。
     */
    pen(ctx, pen) {
        if (!pen)
            return;
        ctx.save();
        ctx.translate(...pen.tip);
        ctx.rotate(pen.angle);
        ctx.shadowColor = '#15364823';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-5, -19);
        ctx.lineTo(5, -19);
        ctx.closePath();
        ctx.fillStyle = '#e5c9a3';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-2.4, -7);
        ctx.lineTo(2.4, -7);
        ctx.closePath();
        ctx.fillStyle = '#14344b';
        ctx.fill();
        const g = ctx.createLinearGradient(-5, 0, 5, 0);
        g.addColorStop(0, '#ed922a');
        g.addColorStop(.38, '#ffc367');
        g.addColorStop(.66, '#ffad3f');
        g.addColorStop(1, '#ef9028');
        ctx.fillStyle = g;
        ctx.fillRect(-5, -82, 10, 63);
        ctx.fillStyle = '#d6e0df';
        ctx.fillRect(-5, -88, 10, 6);
        ctx.fillStyle = '#f7f6e9';
        ctx.fillRect(-5, -88, 10, 2);
        ctx.fillStyle = '#f5a18a';
        M.round(ctx, -5, -97, 10, 11, [4, 4, 0, 0]);
        ctx.fill();
        ctx.restore();
    }
    /**
     * 输入：ctx、pose（写字、放笔、松爪、趴睡的连续参数）。
     * 输出：无，绘制记录场景里的猫。
     * 功能：按尾巴、身体、前爪、头部、笔与前景尾的顺序组合自然动作。
     */
    record(ctx, pose) {
        const { t, idle, sleep, headSleep, tailSleep, pen, grip, release } = pose;
        this.lastArmLength = 0;
        const write = 1 - M.range(t, 10.8, 13.8), look = pose.lookOverride ?? (M.clamp((grip[0] - 176) / 110, -1, 1) * write);
        const shift = look * 3 * (1 - sleep), attention = pose.attention || 0, thought = pose.thought || 0;
        ctx.save();
        ctx.globalAlpha = .08;
        ctx.fillStyle = '#5a7380';
        ctx.filter = 'blur(4px)';
        ctx.beginPath();
        ctx.ellipse(202, 416, 129, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 阶段一：先画背后的尾巴、承重身体和短前爪，固定卡片上沿的接触位置。
        this.recordTail(ctx, tailSleep, idle, false);
        this.torso(ctx, sleep, idle, shift);
        const supportRoot = M.point([237, 377], [178, 406], sleep), supportEnd = M.point([233, 405], [166, 410], sleep);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 393, M.mix(490, 414, sleep));
        ctx.clip();
        this.arm(ctx, supportRoot, supportEnd, { width: M.mix(17, 12, sleep), tip: M.mix(12, 13, sleep), bend: 3 });
        ctx.restore();
        const activeRest = M.point([177, 405], [138, 410], sleep);
        const activeEnd = M.point(grip, activeRest, release);
        // 回顾对白时，短爪以肩毛下连接点为支撑抬起；其他场景参数为0，原动作不变。
        const paw = pose.chatMotion ? (pose.pawLift || 0) : 0;
        activeEnd[0] += paw * (7 + Math.sin(idle * 2.1) * 4);
        activeEnd[1] -= paw * 22;
        const rootStart = [M.clamp(grip[0] - 24, 85, M.mix(218, 270, M.range(t, 10.8, 13))), 374];
        const activeRoot = M.point(rootStart, M.point([165, 374], [125, 406], sleep), release);
        const armOptions = { width: M.mix(23, 18, release) * (1 - sleep * .27), tip: M.mix(15, 13, sleep), bend: -9 * (1 - release) };
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, 393, M.mix(490, 414, sleep));
        ctx.clip();
        this.arm(ctx, activeRoot, activeEnd, armOptions);
        ctx.restore();
        // 阶段二：同一头部原画连续转动并局部变形，不切换到另一张睡姿图。
        ctx.save();
        const tx = -48 * headSleep + shift, ty = 46 * headSleep + Math.sin(idle * 1.4) * .55;
        ctx.translate(191 + tx, 342 + ty);
        ctx.rotate(-.27 * headSleep + look * .035 + (pose.pet || 0) * .022 + (pose.headTilt || 0) + attention * Math.sin(idle * 1.4) * .006);
        ctx.scale(1 - .12 * headSleep, 1 - .10 * headSleep);
        ctx.translate(-191, -342);
        this.texture(ctx, 'head', (x, y) => {
            const ear = Math.exp(-(((x - 250) / 28) ** 2 + ((y - 214) / 33) ** 2)), cheek = Math.exp(-(((x - 65) / 45) ** 2 + ((y - 339) / 58) ** 2)), right = Math.exp(-(((x - 296) / 30) ** 2 + ((y - 335) / 45) ** 2));
            return [x + Math.sin(idle * 1.8 - .4) * .45 * right + 10 * headSleep * ear + (pose.pet || 0) * ear * 2 + attention * ear * (2 + Math.sin(idle * 1.8)) + 26 * headSleep * cheek - 10 * headSleep * right, y + Math.sin(idle * 1.45) * .45 * M.clamp((380 - y) / 185) - 8 * headSleep * ear - attention * ear * 3 - thought * Math.sin(idle * 1.3) * .6 - 23 * headSleep * cheek - 16 * headSleep * M.clamp((y - 343) / 40)];
        });
        this.face(ctx, false, headSleep, look, idle, pose.mouthTalk || 0);
        ctx.restore();
        // 阶段三：笔尖保持真实落点，再覆盖握笔爪和收拢后的前景尾巴。
        ctx.save();
        ctx.globalAlpha *= pose.penOpacity ?? 1;
        this.pen(ctx, pen);
        ctx.restore();
        if (release < 1) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(activeEnd[0], activeEnd[1], 17, 17, 0, 0, Math.PI * 2);
            ctx.clip();
            this.arm(ctx, activeRoot, activeEnd, armOptions);
            ctx.restore();
        }
        if (pose.chatMotion && paw > .01) {
            // 举爪在脸颊前缘自然露出，根部仍藏在胸毛里，不拉出细长手臂。
            this.arm(ctx, [145, 397], activeEnd, { width: 13, tip: 12, bend: paw * 2 });
        }
        this.recordTail(ctx, tailSleep, idle, true);
        if (headSleep > .88) {
            const a = M.range(headSleep, .88, 1);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = '#66bd64';
            ctx.textAlign = 'center';
            [[276, 257, 17], [301, 242, 21], [329, 222, 26]].forEach(([x, y, z], i) => {
                ctx.font = `700 ${z}px "Trebuchet MS",sans-serif`;
                ctx.globalAlpha = a * (.68 + .27 * Math.sin(idle * .85 - i * .55));
                ctx.fillText('z', x, y - Math.sin(idle * .85 - i * .5) * 2.5);
            });
            ctx.restore();
        }
    }
};
