/**
 * K-Comp
 * Dynamic Compressor
 */
class KComp extends AudioPlugin {
    constructor(ctx) {
        super(ctx, "K-Comp");

        this.threshold = -24;
        this.ratio = 12;
        this.attack = 0.003;
        this.release = 0.25;

        // Native Web Audio Compressor
        this.compNode = this.ctx.createDynamicsCompressor();
        
        // Initial values
        this.compNode.threshold.value = this.threshold;
        this.compNode.knee.value = 30;
        this.compNode.ratio.value = this.ratio;
        this.compNode.attack.value = this.attack;
        this.compNode.release.value = this.release;

        this.buildChain();
    }

    buildChain() {
        this.input.connect(this.compNode);
        this.compNode.connect(this.output);
    }

    setParam(key, value) {
        switch(key) {
            case 'threshold':
                this.threshold = value;
                this.compNode.threshold.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'ratio':
                this.ratio = value;
                this.compNode.ratio.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'attack':
                this.attack = value;
                this.compNode.attack.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'release':
                this.release = value;
                this.compNode.release.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
        }
    }

    getInterface() {
        const container = document.createElement('div');
        container.className = 'plugin-ui k-comp';
        container.style.border = '1px solid #444';
        container.style.padding = '10px';
        container.style.background = '#222';
        container.style.color = '#fff';
        container.style.width = '200px';

        const title = document.createElement('h4');
        title.innerText = "K-Comp";
        title.style.margin = "0 0 10px 0";
        container.appendChild(title);

        const createSlider = (label, param, min, max, step, val) => {
            const row = document.createElement('div');
            row.style.marginBottom = '5px';
            
            const lab = document.createElement('label');
            lab.innerText = `${label}: `;
            lab.style.fontSize = '12px';
            
            const range = document.createElement('input');
            range.type = 'range';
            range.min = min;
            range.max = max;
            range.step = step;
            range.value = val;
            range.style.width = '100%';
            
            range.oninput = (e) => {
                const v = parseFloat(e.target.value);
                this.setParam(param, v);
            };

            row.appendChild(lab);
            row.appendChild(range);
            return row;
        };

        container.appendChild(createSlider("Thresh (dB)", "threshold", -100, 0, 1, this.threshold));
        container.appendChild(createSlider("Ratio", "ratio", 1, 20, 0.5, this.ratio));
        container.appendChild(createSlider("Attack (s)", "attack", 0.001, 1.0, 0.001, this.attack));
        container.appendChild(createSlider("Release (s)", "release", 0.01, 1.0, 0.01, this.release));

        return container;
    }
}

window.KComp = KComp;
