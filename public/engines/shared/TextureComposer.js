export class TextureComposer {
    constructor() {
        this.cache = new Map();
        this.imageCache = new Map();
    }

    _hashLayers(layers, width, height) {
        return `${width}x${height}_${JSON.stringify(layers)}`;
    }

    _loadImage(path) {
        if (this.imageCache.has(path)) {
            return Promise.resolve(this.imageCache.get(path));
        }
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                this.imageCache.set(path, img);
                resolve(img);
            };
            img.onerror = (e) => reject(e);
            img.src = path;
        });
    }

    async compose(layers, width = 512, height = 512) {
        if (!layers || layers.length === 0) return null;

        const hash = this._hashLayers(layers, width, height);
        if (this.cache.has(hash)) {
            return this.cache.get(hash);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw layers from bottom to top
        for (const layer of layers) {
            ctx.globalCompositeOperation = layer.blendMode || 'source-over';
            ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;

            if (layer.type === 'color') {
                ctx.fillStyle = layer.value || '#000000';
                ctx.fillRect(0, 0, width, height);
            } else if (layer.type === 'image') {
                if (layer.value) {
                    try {
                        const img = await this._loadImage(layer.value);
                        ctx.drawImage(img, 0, 0, width, height);
                    } catch (e) {
                        console.warn('TextureComposer failed to load image:', layer.value);
                    }
                }
            }
        }

        const dataUrl = canvas.toDataURL('image/png');
        this.cache.set(hash, dataUrl);
        return dataUrl;
    }
}
