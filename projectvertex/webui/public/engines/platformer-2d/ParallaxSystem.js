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
    clear() {
        this.layers = [];
    }

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
        const time = performance.now() / 1000;

        ctx.save();
        
        // 1. Distant Dark Red Gradient Background
        const grad = ctx.createLinearGradient(0, 0, 0, viewH);
        grad.addColorStop(0, '#050000');
        grad.addColorStop(1, '#200000');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, viewW, viewH);

        // 2. Parallax Grid (Floor/Ceiling Perspective)
        ctx.strokeStyle = 'rgba(255, 30, 39, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Vertical lines moving left/right
        const gridXScroll = (cameraX * 0.2) % 64;
        for (let x = -gridXScroll; x < viewW; x += 64) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, viewH);
        }
        
        // Horizontal lines moving up/down slightly
        const gridYScroll = (cameraY * 0.2) % 64;
        for (let y = -gridYScroll; y < viewH; y += 64) {
            ctx.moveTo(0, y);
            ctx.lineTo(viewW, y);
        }
        ctx.stroke();

        // 3. Neon Silhouettes (Midground)
        ctx.fillStyle = '#0a0000';
        ctx.strokeStyle = 'rgba(255, 30, 39, 0.5)';
        ctx.lineWidth = 2;
        
        const silhouetteScrollX = (cameraX * 0.5) % 400;
        ctx.beginPath();
        ctx.moveTo(0, viewH);
        
        // Procedural jagged city/mountain shapes
        for (let x = -silhouetteScrollX - 400; x < viewW + 400; x += 100) {
            const height = Math.abs(Math.sin(x * 0.01)) * 150 + 50;
            ctx.lineTo(x, viewH - height);
            ctx.lineTo(x + 50, viewH - height);
            ctx.lineTo(x + 80, viewH - height + 20);
        }
        ctx.lineTo(viewW, viewH);
        ctx.fill();
        ctx.stroke();
        
        // 4. Floating Particles (Stars/Data Bits)
        ctx.fillStyle = 'rgba(255, 30, 39, 0.6)';
        for (let i = 0; i < 50; i++) {
            const px = ((i * 137 + cameraX * 0.1) % viewW + viewW) % viewW;
            const py = ((i * 97 + cameraY * 0.1 + time * 10) % viewH + viewH) % viewH;
            ctx.fillRect(px, py, 2, 2);
        }

        // 5. Draw Image Layers (Fallback if map provides them)
        this.layers.forEach(layer => {
            ctx.save();
            ctx.globalAlpha = layer.opacity;

            const img = layer.image;
            if (!img || img.width === 0) {
                ctx.restore();
                return;
            }

            let offsetX = -(cameraX * layer.scrollX) % img.width;
            let offsetY = -(cameraY * layer.scrollY) % img.height;

            if (offsetX > 0) offsetX -= img.width;
            if (offsetY > 0) offsetY -= img.height;

            for (let x = offsetX; x < viewW; x += img.width) {
                for (let y = offsetY; y < viewH; y += img.height) {
                    ctx.drawImage(img, Math.floor(x), Math.floor(y));
                }
            }

            ctx.restore();
        });

        ctx.restore();
    }
}

window.ParallaxSystem = ParallaxSystem;
