/**
 * K-Drive
 * Saturation / Distortion using WaveShaper
 */
class KDrive extends AudioPlugin {
    constructor(ctx) {
        super(ctx, "K-Drive");

        this.drive = 0.0; // 0 to 100
        this.mix = 0.5;

        this.shaper = this.ctx.createWaveShaper();
        this.shaper.oversample = '4x';
        
        this.wetNode = this.ctx.createGain();
        this.dryNode = this.ctx.createGain();

        this.updateCurve();
        this.updateMix();
        this.buildChain();
    }

    buildChain() {
        // Dry
        this.input.connect(this.dryNode);
        this.dryNode.connect(this.output);

        // Wet
        this.input.connect(this.shaper);
        this.shaper.connect(this.wetNode);
        this.wetNode.connect(this.output);
    }

    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            // Classic sigmoid distortion curve
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    setParam(key, value) {
        switch(key) {
            case 'drive':
                this.drive = value;
                this.updateCurve();
                break;
            case 'mix':
                this.mix = value;
                this.updateMix();
                break;
        }
    }

    updateCurve() {
        // Map 0-100 UI to useful curve constant
        this.shaper.curve = this.makeDistortionCurve(this.drive * 5); 
    }

    updateMix() {
        this.dryNode.gain.setTargetAtTime(1 - this.mix, this.ctx.currentTime, 0.05);
        this.wetNode.gain.setTargetAtTime(this.mix, this.ctx.currentTime, 0.05);
    }

    getInterface() {
        const container = document.createElement('div');
        container.className = 'plugin-ui k-drive';
        container.style.border = '1px solid #444';
        container.style.padding = '10px';
        container.style.background = '#222';
        container.style.color = '#fff';
        container.style.width = '200px';

        const title = document.createElement('h4');
        title.innerText = "K-Drive";
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

        container.appendChild(createSlider("Drive", "drive", 0, 100, 1, this.drive));
        container.appendChild(createSlider("Mix", "mix", 0.0, 1.0, 0.01, this.mix));

        return container;
    }
}

window.KDrive = KDrive;
