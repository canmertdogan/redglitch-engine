/**
 * KETEBE Drum Machine - Multi-pad sample player with internal step sequencer
 * Features: 16 pads, individual pitch/pan/vol per pad, internal 16-step sequencer
 */

class DrumMachine extends Synthesizer {
    constructor(audioContext) {
        super(audioContext);
        
        this.padCount = 16;
        this.pads = [];
        this.initPads();
        
        // Sequencer state
        this.steps = 16;
        this.patterns = [this.createEmptyPattern()];
        this.activePattern = 0;
        
        // Global drum parameters
        this.params = {
            ...this.params,
            swing: 0,
            pitch: 0
        };
    }

    initPads() {
        for (let i = 0; i < this.padCount; i++) {
            this.pads.push({
                id: i,
                name: `Pad ${i + 1}`,
                buffer: null,
                volume: 0.8,
                pan: 0,
                pitch: 0,
                mute: false,
                solo: false,
                output: this.ctx.createGain()
            });
            this.pads[i].output.connect(this.output);
        }
    }

    createEmptyPattern() {
        const pattern = [];
        for (let i = 0; i < this.padCount; i++) {
            pattern.push(new Array(this.steps).fill(0)); // 0 = off, >0 = velocity
        }
        return pattern;
    }

    async loadSample(padIndex, url) {
        if (padIndex < 0 || padIndex >= this.padCount) return;
        
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.pads[padIndex].buffer = audioBuffer;
            return audioBuffer;
        } catch (e) {
            console.error(`DrumMachine: Failed to load sample for pad ${padIndex}:`, e);
            return null;
        }
    }

    triggerPad(padIndex, velocity = 1.0, time = null) {
        const pad = this.pads[padIndex];
        if (!pad || !pad.buffer || pad.mute) return;

        const startTime = time || this.ctx.currentTime;
        
        const source = this.ctx.createBufferSource();
        source.buffer = pad.buffer;
        
        // Pitch
        const playbackRate = Math.pow(2, (pad.pitch + this.params.pitch) / 12);
        source.playbackRate.value = playbackRate;
        
        // Gain & Pan
        const padGain = this.ctx.createGain();
        padGain.gain.value = pad.volume * velocity;
        
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pad.pan;

        source.connect(panner);
        panner.connect(padGain);
        padGain.connect(pad.output);

        source.start(startTime);
        
        // Cleanup
        source.onended = () => {
            source.disconnect();
            panner.disconnect();
            padGain.disconnect();
        };

        return source;
    }

    // Sequencer Methods
    setStep(padIndex, step, velocity) {
        this.patterns[this.activePattern][padIndex][step] = velocity;
    }

    toggleStep(padIndex, step) {
        const current = this.patterns[this.activePattern][padIndex][step];
        this.setStep(padIndex, step, current > 0 ? 0 : 1);
        return current > 0 ? 0 : 1;
    }

    // Integration with DAW clock
    // This would be called by the DAW's main loop if the DrumMachine has an internal sequencer active
    playStep(stepIndex, time) {
        const pattern = this.patterns[this.activePattern];
        for (let i = 0; i < this.padCount; i++) {
            const velocity = pattern[i][stepIndex];
            if (velocity > 0) {
                this.triggerPad(i, velocity, time);
            }
        }
    }

    // Override playNote to trigger pads via MIDI
    // MIDI 36 (C1) = Pad 0, 37 (C#1) = Pad 1, etc.
    playNote(frequency, velocity = 1.0, duration = 1.0, startTime = null) {
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        const padIndex = midiNote - 36;
        
        if (padIndex >= 0 && padIndex < this.padCount) {
            this.triggerPad(padIndex, velocity, startTime);
        }
        return null; // Drum hits are fire-and-forget, no voice ID needed for release
    }
}

window.DrumMachine = DrumMachine;
