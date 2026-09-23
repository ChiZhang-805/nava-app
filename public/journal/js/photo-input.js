__fluffyModules["photo-input.js"] = (() => {
    "use strict";
    class PhotoInput {
        /**
         * 输入：callbacks（选择、错误回调）。
         * 输出：照片控制器。
         * 功能：只由用户操作打开文件或摄像头。
         */
        constructor(callbacks = {}) {
            this.callbacks = callbacks;
            this.stream = null;
            this.serial = 0;
            this.image = null;
        }
        /**
         * 输入：file（用户选择的文件）。
         * 输出：去元数据后的 JPEG。
         * 功能：限制体积/像素，重新编码后仅保存在页面内存。
         */
        async readFile(file) {
            if (!file)
                return null;
            if (file.size > 15 * 1024 * 1024)
                throw Error("图片较大，请选择 15 MB 以内的照片。");
            if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type))
                throw Error("请选择 JPEG、PNG 或 WebP 照片。");
            const serial = ++this.serial, url = URL.createObjectURL(file);
            try {
                const img = await new Promise((resolve, reject) => {
                    const im = new Image();
                    im.onload = () => resolve(im);
                    im.onerror = () => reject(Error("这张图片暂时无法读取，请换成 JPEG 或 PNG。"));
                    im.src = url;
                });
                if (serial !== this.serial)
                    return null;
                if (img.naturalWidth * img.naturalHeight > 60e6 || !img.naturalWidth)
                    throw Error("图片分辨率过高，请先缩小。");
                return this.encode(img, img.naturalWidth, img.naturalHeight, false);
            }
            finally {
                URL.revokeObjectURL(url);
            }
        }
        /**
         * 输入：source、width、height、adopt（是否设为当前照片）。
         * 输出：JPEG data URL。
         * 功能：长边限制为 1280，剥离 EXIF 与位置元数据。
         */
        encode(source, width, height, adopt = true) {
            const s = Math.min(1, 1280 / Math.max(width, height)), c = document.createElement("canvas");
            c.width = Math.round(width * s);
            c.height = Math.round(height * s);
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(source, 0, 0, c.width, c.height);
            const image = c.toDataURL("image/jpeg", .86);
            if (adopt) this.image = image;
            return image;
        }
        /**
         * 输入：video（预览元素）、selfie（是否前置）。
         * 输出：Promise<boolean>。
         * 功能：请求摄像头；切页后晚到的流立即停止。
         */
        async openCamera(video, selfie = false) {
            this.stopCamera();
            const serial = ++this.serial;
            if (!navigator.mediaDevices?.getUserMedia)
                throw Error("摄像头需要 HTTPS 和浏览器支持，也可以选择照片。");
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: selfie ? "user" : "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
            if (serial !== this.serial) {
                stream.getTracks().forEach(t => t.stop());
                return false;
            }
            this.stream = stream;
            video.srcObject = stream;
            try {
                await video.play();
                if (serial !== this.serial) {
                    stream.getTracks().forEach(t => t.stop());
                    return false;
                }
                return true;
            }
            catch (error) {
                this.stopCamera();
                throw error;
            }
        }
        /**
         * 输入：video。
         * 输出：JPEG。
         * 功能：拍摄当前预览并关闭摄像头，不在后台持续采集。
         */
        capture(video) {
            if (!video.videoWidth)
                throw Error("摄像头还没准备好。");
            const image = this.encode(video, video.videoWidth, video.videoHeight);
            this.stopCamera();
            return image;
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：释放所有视频轨道并取消迟到请求。
         */
        stopCamera() {
            ++this.serial;
            this.stream?.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        /**
         * 输入：无。
         * 输出：无。
         * 功能：用户清除或离开记录后移除照片引用。
         */
        clear() {
            this.stopCamera();
            this.image = null;
        }
    }
    return { PhotoInput };
})();
