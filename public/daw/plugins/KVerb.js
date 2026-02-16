/**
 * K-Verb
 * Algorithmic Reverb (using Convolver with generated Impulse Response for now)
 */
class KVerb extends AudioPlugin {
    constructor(ctx) {
        super(ctx, "K-Verb");

        this.seconds = 3.0;
        this.decay = 2.0;
        this.mix = 0.5;

        this.convolver = this.ctx.createConvolver();
        this.wetNode = this.ctx.createGain();
        this.dryNode = this.ctx.createGain();

        // Generate initial Impulse Response
        this.generateImpulse();

        this.updateMix();
        this.buildChain();
    }

    buildChain() {
        // Dry
        this.input.connect(this.dryNode);
        this.dryNode.connect(this.output);

        // Wet
        this.input.connect(this.convolver);
        this.convolver.connect(this.wetNode);
        this.wetNode.connect(this.output);
    }

    generateImpulse() {
        const rate = this.ctx.sampleRate;
        const length = rate * this.seconds;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = i; // reverse? no, standard exponential decay noise
            // Simple white noise with exponential decay
            let noise = (Math.random() * 2 - 1) * Math.pow(1 - i / length, this.decay);
            impulseL[i] = noise;
            impulseR[i] = noise; // Stereo separation could be added here
        }

        this.convolver.buffer = impulse;
    }

    setParam(key, value) {
        switch(key) {
            case 'seconds':
                this.seconds = value;
                this.generateImpulse();
                break;
            case 'decay':
                this.decay = value;
                this.generateImpulse();
                break;
            case 'mix':
                this.mix = value;
                this.updateMix();
                break;
        }
    }

    updateMix() {
        this.dryNode.gain.setTargetAtTime(1 - this.mix, this.ctx.currentTime, 0.05);
        this.wetNode.gain.setTargetAtTime(this.mix, this.ctx.currentTime, 0.05);
    }

    getInterface() {
        const container = document.createElement('div');
        container.className = 'plugin-ui k-verb';
        container.style.border = '1px solid #444';
        container.style.padding = '10px';
        container.style.background = '#222';
        container.style.color = '#fff';
        container.style.width = '200px';

        const title = document.createElement('h4');
        title.innerText = "K-Verb";
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
            
            // Re-generating IR is expensive, so use onchange instead of oninput for buffer params
            const eventType = (param === 'mix') ? 'oninput' : 'onchange';

            range[eventType] = (e) => {
                const v = parseFloat(e.target.value);
                this.setParam(param, v);
            };

            row.appendChild(lab);
            row.appendChild(range);
            return row;
        };

        container.appendChild(createSlider("Size (s)", "seconds", 0.1, 10.0, 0.1, this.seconds));
        container.appendChild(createSlider("Decay", "decay", 0.1, 5.0, 0.1, this.decay));
        container.appendChild(createSlider("Mix", "mix", 0.0, 1.0, 0.01, this.mix));

        return container;
    }
}

window.KVerb = KVerb;
