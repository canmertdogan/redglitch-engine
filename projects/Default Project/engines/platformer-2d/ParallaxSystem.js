/**
 * ParallaxSystem.js
 * Handles multiple background layers with independent scroll speeds.
 */

class ParallaxSystem {
    constructor(renderer) {
        this.renderer = renderer;
        this.layers = [];
    }

    /**
     * Add a parallax layer
     * @param {Image|Canvas} image - The image to draw
     * @param {number} scrollSpeedX - Scroll speed relative to camera (0 = static, 1 = same as foreground)
     * @param {number} scrollSpeedY - Scroll speed relative to camera
     * @param {number} opacity - Layer opacity
     */
    addLayer(image, scrollSpeedX = 0.5, scrollSpeedY = 0.5, opacity = 1.0) {
        this.layers.push({
            image,
            scrollX: scrollSpeedX,
            scrollY: scrollSpeedY,
            opacity
        });
    }

    render(cameraX, cameraY) {
        const ctx = this.renderer.ctx;
        const viewW = this.renderer.viewW;
        const viewH = this.renderer.viewH;

        this.layers.forEach(layer => {
            ctx.save();
            ctx.globalAlpha = layer.opacity;

            const img = layer.image;
            if (!img || img.width === 0) {
                ctx.restore();
                return;
            }

            // Calculate offset based on camera and scroll speed
            // Static background would have scrollSpeed = 0
            let offsetX = -(cameraX * layer.scrollX) % img.width;
            let offsetY = -(cameraY * layer.scrollY) % img.height;

            // Ensure offset is positive for simpler tiling
            if (offsetX > 0) offsetX -= img.width;
            if (offsetY > 0) offsetY -= img.height;

            // Draw tiled background
            for (let x = offsetX; x < viewW; x += img.width) {
                for (let y = offsetY; y < viewH; y += img.height) {
                    ctx.drawImage(img, Math.floor(x), Math.floor(y));
                }
            }

            ctx.restore();
        });
    }

    clear() {
        this.layers = [];
    }
}

window.ParallaxSystem = ParallaxSystem;
