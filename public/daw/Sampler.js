/**
 * KETEBE Sampler - Multi-sample playback engine
 * Features: Pitch shifting, velocity layers, loop points, ADSR
 */

class Sampler extends Synthesizer {
    constructor(audioContext) {
        super(audioContext);
        
        // Sampler-specific parameters
        this.params = {
            ...this.params,
            attack: 0.001,
            decay: 0.1,
            sustain: 0.8,
            release: 0.2,
            
            // Filter
            filterEnabled: false,
            filterType: 'lowpass',
            filterFreq: 5000,
            filterQ: 1,
            
            // Playback
            loop: false,
            loopStart: 0,
            loopEnd: 1,
            
            // Pitch
            pitchBend: 0,
            fineTune: 0
        };
        
        // Sample mapping: { midiNote: { buffer, rootNote } }
        this.sampleMap = new Map();
        
        // Default sample
        this.defaultSample = null;
        this.defaultRootNote = 60;
    }
    
    async loadSample(url, midiNote = null, rootNote = 60) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            
            if (midiNote !== null) {
                this.sampleMap.set(midiNote, {
                    buffer: audioBuffer,
                    rootNote: rootNote
                });
            } else {
                this.defaultSample = audioBuffer;
                this.defaultRootNote = rootNote;
            }
            
            return audioBuffer;
        } catch (e) {
            console.error('Failed to load sample:', e);
            return null;
        }
    }
    
    async loadDrumKit(sampleUrls) {
        const promises = Object.entries(sampleUrls).map(([note, url]) => {
            return this.loadSample(url, parseInt(note), parseInt(note));
        });
        await Promise.all(promises);
    }
    
    getSampleForNote(midiNote) {
        if (this.sampleMap.has(midiNote)) {
            return this.sampleMap.get(midiNote);
        }
        
        let nearest = null;
        let minDiff = Infinity;
        
        this.sampleMap.forEach((sample, note) => {
            const diff = Math.abs(note - midiNote);
            if (diff < minDiff) {
                minDiff = diff;
                nearest = sample;
            }
        });
        
        if (nearest) return nearest;
        
        if (this.defaultSample) {
            return {
                buffer: this.defaultSample,
                rootNote: this.defaultRootNote
            };
        }
        
        return null;
    }
    
    createVoice(frequency, velocity) {
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        
        const sample = this.getSampleForNote(midiNote);
        if (!sample || !sample.buffer) return null;
        
        const source = this.ctx.createBufferSource();
        source.buffer = sample.buffer;
        source.loop = this.params.loop;
        
        if (this.params.loop) {
            source.loopStart = this.params.loopStart * sample.buffer.duration;
            source.loopEnd = this.params.loopEnd * sample.buffer.duration;
        }
        
        const pitchRatio = Math.pow(2, (midiNote - sample.rootNote) / 12);
        source.playbackRate.value = pitchRatio;
        
        let filterNode = null;
        if (this.params.filterEnabled) {
            filterNode = this.ctx.createBiquadFilter();
            filterNode.type = this.params.filterType;
            filterNode.frequency.value = this.params.filterFreq;
            filterNode.Q.value = this.params.filterQ;
        }
        
        const vca = this.ctx.createGain();
        vca.gain.value = 0;
        
        if (filterNode) {
            source.connect(filterNode);
            filterNode.connect(vca);
        } else {
            source.connect(vca);
        }
        
        vca.connect(this.output);
        source.start(this.ctx.currentTime);
        
        return {
            oscillator: source,
            source,
            filter: filterNode,
            gain: vca
        };
    }
    
    playDrumHit(midiNote, velocity = 1.0) {
        const sample = this.getSampleForNote(midiNote);
        if (!sample || !sample.buffer) return null;
        
        const source = this.ctx.createBufferSource();
        source.buffer = sample.buffer;
        
        const vca = this.ctx.createGain();
        vca.gain.value = velocity * this.params.volume;
        
        source.connect(vca);
        vca.connect(this.output);
        source.start(this.ctx.currentTime);
        
        return {
            oscillator: source,
            gain: vca
        };
    }
    
    playNote(frequency, velocity = 1.0, duration = 1.0, startTime = null) {
        const time = startTime || this.ctx.currentTime;
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        
        const sample = this.getSampleForNote(midiNote);
        if (!sample) return null;
        
        if (this.sampleMap.has(midiNote)) {
            const voice = this.playDrumHit(midiNote, velocity);
            const voiceId = Date.now() + Math.random();
            this.voices.set(voiceId, voice);
            
            setTimeout(() => {
                this.voices.delete(voiceId);
            }, sample.buffer.duration * 1000 + 100);
            
            return voiceId;
        }
        
        return super.playNote(frequency, velocity, duration, startTime);
    }
    
    clearSamples() {
        this.sampleMap.clear();
        this.defaultSample = null;
    }
    
    setFilterEnabled(enabled) {
        this.params.filterEnabled = enabled;
    }
    
    setLoop(enabled) {
        this.params.loop = enabled;
    }
    
    setLoopPoints(start, end) {
        this.params.loopStart = Math.max(0, Math.min(1, start));
        this.params.loopEnd = Math.max(0, Math.min(1, end));
    }
}

window.Sampler = Sampler;
