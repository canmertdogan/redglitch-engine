/**
 * RedGlitch AI - Asset Synthesizer
 * Procedural Pixel Art Generator for KAI
 */

class AssetSynthesizer {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    async generate(prompt, size = 32) {
        this.canvas.width = size;
        this.canvas.height = size;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, size, size);

        const tags = prompt.toLowerCase();
        let color = '#ffffff';
        if (tags.includes('red') || tags.includes('health') || tags.includes('fire')) color = '#e74c3c';
        if (tags.includes('blue') || tags.includes('mana') || tags.includes('water')) color = '#3498db';
        if (tags.includes('green') || tags.includes('poison') || tags.includes('grass')) color = '#2ecc71';
        if (tags.includes('yellow') || tags.includes('gold') || tags.includes('coin')) color = '#f1c40f';
        if (tags.includes('purple') || tags.includes('void') || tags.includes('magic')) color = '#9b59b6';

        // Disable smoothing for pixel art
        ctx.imageSmoothingEnabled = false;

        // Base Template Logic
        if (tags.includes('potion')) {
            this.drawPotion(ctx, size, color);
        } else if (tags.includes('sword') || tags.includes('weapon')) {
            this.drawSword(ctx, size, color);
        } else if (tags.includes('coin') || tags.includes('item')) {
            this.drawCircle(ctx, size, color);
        } else {
            this.drawBox(ctx, size, color);
        }

        return this.canvas.toDataURL('image/png');
    }

    drawPotion(ctx, size, color) {
        const pad = size * 0.2;
        ctx.fillStyle = '#eee'; // Bottle rim
        ctx.fillRect(size/2 - 2, pad, 4, 4);
        ctx.fillStyle = '#aaa'; // Neck
        ctx.fillRect(size/2 - 1, pad + 4, 2, 4);
        
        ctx.fillStyle = color; // Liquid
        ctx.beginPath();
        ctx.arc(size/2, size/2 + 4, size/4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#fff'; // Shine
        ctx.lineWidth = 1;
        ctx.strokeRect(size/2 + 2, size/2, 2, 2);
    }

    drawSword(ctx, size, color) {
        ctx.save();
        ctx.translate(size/2, size/2);
        ctx.rotate(-Math.PI / 4);
        
        ctx.fillStyle = '#888'; // Blade
        ctx.fillRect(-1, -size/3, 2, size/1.5);
        ctx.fillStyle = color; // Hilt
        ctx.fillRect(-3, size/4, 6, 2);
        ctx.fillStyle = '#555'; // Handle
        ctx.fillRect(-1, size/4 + 2, 2, 4);
        
        ctx.restore();
    }

    drawCircle(ctx, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.stroke();
    }

    drawBox(ctx, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(size/4, size/4, size/2, size/2);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(size/4, size/4, size/2, size/2);
    }
}

window.AssetSynth = new AssetSynthesizer();
