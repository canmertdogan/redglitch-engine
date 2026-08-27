class IsoRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false; // PIXEL ART FIX
        this.tileW = 64; // Standard 2:1 isometric tile width
        this.tileH = 32; // Standard 2:1 isometric tile height
        
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.renderList = [];
    }

    project(mapX, mapY, mapZ = 0) {
        return {
            x: (mapX - mapY) * (this.tileW / 2),
            y: (mapX + mapY) * (this.tileH / 2) - (mapZ * this.tileH)
        };
    }

    unproject(screenX, screenY) {
        const sx = screenX - (this.canvas.width / 2) + this.camera.x;
        const sy = screenY - (this.canvas.height / 4) + this.camera.y;

        return {
            x: (sx / (this.tileW / 2) + sy / (this.tileH / 2)) / 2,
            y: (sy / (this.tileH / 2) - sx / (this.tileW / 2)) / 2
        };
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.renderList = [];
    }

    addToRenderList(item) {
        const pos = this.project(item.x, item.y, item.z || 0);
        item.screenX = pos.x;
        item.screenY = pos.y;
        
        // Depth sorting for 2.5D: x+y is primary, z is secondary within the tile
        item.depth = (item.x || 0) + (item.y || 0) + (item.z || 0) * 0.01; 
        
        this.renderList.push(item);
    }

    render() {
        this.renderList.sort((a, b) => a.depth - b.depth);

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2 - this.camera.x, this.canvas.height / 4 - this.camera.y);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);

        this.renderList.forEach(item => {
            if (item.type === 'tile') {
                this.drawTile(item);
            } else if (item.type === 'sprite') {
                this.drawSprite(item);
            } else if (item.type === 'shadow') {
                this.drawShadow(item);
            } else if (item.type === 'debug-grid') {
                this.drawDebugGrid(item);
            }
        });

        this.ctx.restore();
    }

    drawShadow(shadow) {
        const ctx = this.ctx;
        const w = shadow.width || (this.tileW * 0.6);
        const h = shadow.height || (this.tileH * 0.6);
        
        ctx.save();
        ctx.translate(shadow.screenX, shadow.screenY + this.tileH / 2);
        ctx.beginPath();
        ctx.scale(1, 0.5); // Isometric flattening
        ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();
        ctx.restore();
    }

    drawTile(tile) {
        if (tile.image) {
            this.drawTexturedCube(tile.screenX, tile.screenY, this.tileW, this.tileH, tile.image, tile.sx, tile.sy, tile.sw, tile.sh);
        } else {
            this.drawCube(tile.screenX, tile.screenY, this.tileW, this.tileH, tile.color || '#34495e');
        }
    }

    drawTexturedCube(x, y, w, h, img, sx, sy, sw, sh) {
        const ctx = this.ctx;
        
        // 1. Right Face
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.lineTo(x + w/2, y + h/2 + h);
        ctx.lineTo(x, y + h * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, x, y + h/2, w/2, h * 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        ctx.restore();

        // 2. Left Face
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x - w/2, y + h/2);
        ctx.lineTo(x - w/2, y + h/2 + h);
        ctx.lineTo(x, y + h * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, x - w/2, y + h/2, w/2, h * 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();
        ctx.restore();

        // 3. Top Face
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x - w/2, y + h/2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, x - w/2, y, w, h);
        ctx.restore();

        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(x, y + h * 2); ctx.lineTo(x + w/2, y + h/2 + h); ctx.lineTo(x + w/2, y + h/2);
        ctx.lineTo(x, y); ctx.lineTo(x - w/2, y + h/2); ctx.lineTo(x - w/2, y + h/2 + h);
        ctx.closePath();
        ctx.stroke();
    }

    drawCube(x, y, w, h, color) {
        const ctx = this.ctx;
        const darken = (col, amt) => {
            if (col.startsWith('#')) {
                let r = parseInt(col.slice(1,3), 16);
                let g = parseInt(col.slice(3,5), 16);
                let b = parseInt(col.slice(5,7), 16);
                r = Math.max(0, r - amt);
                g = Math.max(0, g - amt);
                b = Math.max(0, b - amt);
                return `rgb(${r},${g},${b})`;
            }
            return col;
        };

        const leftColor = darken(color, 30);
        const rightColor = darken(color, 60);

        // Right Face
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.lineTo(x + w/2, y + h/2 + h);
        ctx.lineTo(x, y + h * 2);
        ctx.closePath();
        ctx.fillStyle = rightColor;
        ctx.fill();

        // Left Face
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x - w/2, y + h/2);
        ctx.lineTo(x - w/2, y + h/2 + h);
        ctx.lineTo(x, y + h * 2);
        ctx.closePath();
        ctx.fillStyle = leftColor;
        ctx.fill();

        // Top Face
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x - w/2, y + h/2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();
    }

    drawSprite(sprite) {
        const w = sprite.width || this.tileW;
        const h = sprite.height || (this.tileH * 2);
        
        if (sprite.image) {
            this.ctx.drawImage(
                sprite.image,
                sprite.screenX - w/2,
                sprite.screenY + (this.tileH/2) - h,
                w, h
            );
        } else {
            const ctx = this.ctx;
            ctx.fillStyle = sprite.color || '#e74c3c';
            ctx.beginPath();
            const cx = sprite.screenX;
            const cy = sprite.screenY + this.tileH/2;
            ctx.fillRect(cx - 8, cy - 32, 16, 32);
            ctx.arc(cx, cy - 36, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawDebugGrid(grid) {
        this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        this.ctx.beginPath();
        for (let i = 0; i <= grid.size; i++) {
            let start = this.project(0, i);
            let end = this.project(grid.size, i);
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            
            start = this.project(i, 0);
            end = this.project(i, grid.size);
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
        }
        this.ctx.stroke();
    }
}

window.IsoRenderer = IsoRenderer;