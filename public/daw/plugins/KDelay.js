/**
 * K-Delay
 * Stereo Delay with feedback and mix control.
 */
class KDelay extends AudioPlugin {
    constructor(ctx) {
        super(ctx, "K-Delay");

        // Parameters
        this.time = 0.3; // Seconds
        this.feedback = 0.4;
        this.mix = 0.5; // 0 = Dry, 1 = Wet

        // Nodes
        this.delayNode = this.ctx.createDelay(5.0);
        this.feedbackNode = this.ctx.createGain();
        this.wetNode = this.ctx.createGain();
        this.dryNode = this.ctx.createGain();

        // Initial Values
        this.delayNode.delayTime.value = this.time;
        this.feedbackNode.gain.value = this.feedback;
        this.updateMix();

        // Routing:
        // Input -> DryNode -> Output
        // Input -> DelayNode -> FeedbackNode -> DelayNode (Loop)
        // DelayNode -> WetNode -> Output
        
        this.buildChain();
    }

    buildChain() {
        // Dry Path
        this.input.connect(this.dryNode);
        this.dryNode.connect(this.output);

        // Wet Path
        this.input.connect(this.delayNode);
        this.delayNode.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode); // Feedback Loop
        
        this.delayNode.connect(this.wetNode);
        this.wetNode.connect(this.output);
    }

    setParam(key, value) {
        switch(key) {
            case 'time':
                this.time = value;
                this.delayNode.delayTime.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'feedback':
                this.feedback = value;
                this.feedbackNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
                break;
            case 'mix':
                this.mix = value;
                this.updateMix();
                break;
        }
    }

    updateMix() {
        // Equal power crossfade could be better, but linear is fine for now
        this.dryNode.gain.setTargetAtTime(1 - this.mix, this.ctx.currentTime, 0.05);
        this.wetNode.gain.setTargetAtTime(this.mix, this.ctx.currentTime, 0.05);
    }

    getInterface() {
        const container = document.createElement('div');
        container.className = 'plugin-ui k-delay';
        container.style.border = '1px solid #444';
        container.style.padding = '10px';
        container.style.background = '#222';
        container.style.color = '#fff';
        container.style.width = '200px';

        const title = document.createElement('h4');
        title.innerText = "K-Delay";
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

        container.appendChild(createSlider("Time", "time", 0.05, 2.0, 0.01, this.time));
        container.appendChild(createSlider("Feedback", "feedback", 0.0, 0.95, 0.01, this.feedback));
        container.appendChild(createSlider("Mix", "mix", 0.0, 1.0, 0.01, this.mix));

        return container;
    }
}

window.KDelay = KDelay;
