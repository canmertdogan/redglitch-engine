/**
 * K-EQ3
 * 3-Band Parametric Equalizer
 */
class KEQ3 extends AudioPlugin {
    constructor(ctx) {
        super(ctx, "K-EQ3");

        // Frequencies
        this.lowFreq = 100;
        this.midFreq = 1000;
        this.highFreq = 5000;

        // Gains (dB)
        this.lowGain = 0;
        this.midGain = 0;
        this.highGain = 0;

        // Filters
        this.lowFilter = this.ctx.createBiquadFilter();
        this.lowFilter.type = "lowshelf";
        this.lowFilter.frequency.value = this.lowFreq;

        this.midFilter = this.ctx.createBiquadFilter();
        this.midFilter.type = "peaking";
        this.midFilter.frequency.value = this.midFreq;
        this.midFilter.Q.value = 1.0;

        this.highFilter = this.ctx.createBiquadFilter();
        this.highFilter.type = "highshelf";
        this.highFilter.frequency.value = this.highFreq;

        this.buildChain();
    }

    buildChain() {
        // Chain: Input -> Low -> Mid -> High -> Output
        this.input.connect(this.lowFilter);
        this.lowFilter.connect(this.midFilter);
        this.midFilter.connect(this.highFilter);
        this.highFilter.connect(this.output);
    }

    setParam(key, value) {
        switch(key) {
            case 'lowGain':
                this.lowGain = value;
                this.lowFilter.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'midGain':
                this.midGain = value;
                this.midFilter.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'highGain':
                this.highGain = value;
                this.highFilter.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'lowFreq':
                this.lowFreq = value;
                this.lowFilter.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'midFreq':
                this.midFreq = value;
                this.midFilter.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'highFreq':
                this.highFreq = value;
                this.highFilter.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
        }
    }

    getInterface() {
        const container = document.createElement('div');
        container.className = 'plugin-ui k-eq3';
        container.style.border = '1px solid #444';
        container.style.padding = '10px';
        container.style.background = '#222';
        container.style.color = '#fff';
        container.style.width = '200px';

        const title = document.createElement('h4');
        title.innerText = "K-EQ3";
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

        // Low
        container.appendChild(createSlider("Low Gain (dB)", "lowGain", -12, 12, 0.1, this.lowGain));
        container.appendChild(createSlider("Low Freq (Hz)", "lowFreq", 20, 500, 1, this.lowFreq));
        
        // Mid
        container.appendChild(document.createElement('hr'));
        container.appendChild(createSlider("Mid Gain (dB)", "midGain", -12, 12, 0.1, this.midGain));
        container.appendChild(createSlider("Mid Freq (Hz)", "midFreq", 200, 4000, 10, this.midFreq));

        // High
        container.appendChild(document.createElement('hr'));
        container.appendChild(createSlider("High Gain (dB)", "highGain", -12, 12, 0.1, this.highGain));
        container.appendChild(createSlider("High Freq (Hz)", "highFreq", 2000, 16000, 100, this.highFreq));

        return container;
    }
}

window.KEQ3 = KEQ3;
