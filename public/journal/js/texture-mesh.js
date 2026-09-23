/* Shared-vertex GPU meshes avoid the hairline seams of Canvas triangle clips.
   WebGL unavailable -> CPU pixel-buffer mesh; the same texture still deforms. */
window.TextureMesh = class {
    /**
     * 输入：images、art（已确认的源图与坐标）。
     * 输出：TextureMesh实例；不支持WebGL时抛错。
     * 功能：创建共享顶点网格、透明纹理及着色器，避免三角形裁剪接缝。
     */
    constructor(images, art) {
        this.art = art;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 786;
        this.canvas.height = 1704;
        const g = this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
        if (!g)
            throw Error('WebGL not exposed');
        /**
         * 输入：type（着色器类型）、src（GLSL文本）。
         * 输出：编译成功的着色器。
         * 功能：编译失败立即抛错，让上层采用CPU回退。
         */
        const shader = (type, src) => {
            const sh = g.createShader(type);
            g.shaderSource(sh, src);
            g.compileShader(sh);
            if (!g.getShaderParameter(sh, g.COMPILE_STATUS))
                throw Error(g.getShaderInfoLog(sh));
            return sh;
        };
        const p = this.program = g.createProgram();
        g.attachShader(p, shader(g.VERTEX_SHADER, 'attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){v=uv;gl_Position=vec4(p.x/393.0*2.0-1.0,1.0-p.y/852.0*2.0,0.0,1.0);}'));
        g.attachShader(p, shader(g.FRAGMENT_SHADER, 'precision mediump float;varying vec2 v;uniform sampler2D tex;void main(){vec4 c=texture2D(tex,v);gl_FragColor=vec4(c.rgb*c.a,c.a);}'));
        g.linkProgram(p);
        if (!g.getProgramParameter(p, g.LINK_STATUS))
            throw Error('Texture mesh link failed');
        this.pos = g.getAttribLocation(p, 'p');
        this.uv = g.getAttribLocation(p, 'uv');
        this.buf = g.createBuffer();
        this.ubuf = g.createBuffer();
        this.ibuf = g.createBuffer();
        this.textures = {};
        // 阶段二：上传已确认的透明角色图层，边缘使用线性插值。
        for (const name of ['hero', 'head']) {
            const tex = g.createTexture();
            g.bindTexture(g.TEXTURE_2D, tex);
            g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, images[name]);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
            this.textures[name] = tex;
        }
        // 阶段三：生成共享顶点与索引；每帧只更新顶点位置。
        this.nx = 26;
        this.ny = 24;
        const uv = [], idx = [];
        for (let j = 0; j <= this.ny; j++)
            for (let i = 0; i <= this.nx; i++)
                uv.push(i / this.nx, j / this.ny);
        for (let j = 0; j < this.ny; j++)
            for (let i = 0; i < this.nx; i++) {
                const k = j * (this.nx + 1) + i;
                idx.push(k, k + 1, k + this.nx + 1, k + 1, k + this.nx + 2, k + this.nx + 1);
            }
        this.uvs = new Float32Array(uv);
        this.indices = new Uint16Array(idx);
        this.verifiedTextures = new Set();
    }
    /**
     * 输入：name（图层名）、warp（逐顶点的连续变形函数）。
     * 输出：本次渲染的透明Canvas。
     * 功能：更新网格顶点后重新绘制同一张源纹理，不使用姿势帧切换。
     */
    render(name, warp) {
        const g = this.gl, b = this.art[name].box, points = [];
        if(g.isContextLost())throw Error('Texture context unavailable');
        for (let j = 0; j <= this.ny; j++)
            for (let i = 0; i <= this.nx; i++)
                points.push(...warp(b[0] + (b[2] - b[0]) * i / this.nx, b[1] + (b[3] - b[1]) * j / this.ny));
        g.viewport(0, 0, 786, 1704);
        g.clearColor(0, 0, 0, 0);
        g.clear(g.COLOR_BUFFER_BIT);
        g.useProgram(this.program);
        g.disable(g.BLEND);
        g.bindBuffer(g.ARRAY_BUFFER, this.buf);
        g.bufferData(g.ARRAY_BUFFER, new Float32Array(points), g.DYNAMIC_DRAW);
        g.enableVertexAttribArray(this.pos);
        g.vertexAttribPointer(this.pos, 2, g.FLOAT, false, 0, 0);
        g.bindBuffer(g.ARRAY_BUFFER, this.ubuf);
        g.bufferData(g.ARRAY_BUFFER, this.uvs, g.STATIC_DRAW);
        g.enableVertexAttribArray(this.uv);
        g.vertexAttribPointer(this.uv, 2, g.FLOAT, false, 0, 0);
        g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, this.ibuf);
        g.bufferData(g.ELEMENT_ARRAY_BUFFER, this.indices, g.STATIC_DRAW);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, this.textures[name]);
        g.uniform1i(g.getUniformLocation(this.program, 'tex'), 0);
        g.drawElements(g.TRIANGLES, this.indices.length, g.UNSIGNED_SHORT, 0);
        if(!this.verifiedTextures.has(name)){
            // Both approved layers are opaque at their centre. Detect a failed
            // texture upload before a device displays a headless/empty mascot.
            const [x,y]=warp((b[0]+b[2])/2,(b[1]+b[3])/2),pixel=new Uint8Array(4);
            g.readPixels(Math.round(x*2),Math.round((852-y)*2),1,1,g.RGBA,g.UNSIGNED_BYTE,pixel);
            const error=g.getError();
            if(error!==g.NO_ERROR||pixel[3]===0)throw Error(`Texture render unavailable (${error}, alpha ${pixel[3]})`);
            this.verifiedTextures.add(name);
        }
        return this.canvas;
    }
    dispose(){
        const g=this.gl;
        if(!g.isContextLost()){
            for(const texture of Object.values(this.textures))g.deleteTexture(texture);
            for(const buffer of [this.buf,this.ubuf,this.ibuf])g.deleteBuffer(buffer);
            for(const shader of g.getAttachedShaders(this.program)||[])g.deleteShader(shader);
            g.deleteProgram(this.program);
        }
        this.canvas.width=this.canvas.height=1;
    }
};
