/**
 * REDGLITCH Instrument Presets - Pre-configured synth and sampler settings
 */

class InstrumentPresets {
    static get8BitPresets() {
        return {
            'Lead (Square)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.5,
                    attack: 0.001,
                    decay: 0.05,
                    sustain: 0.7,
                    release: 0.1,
                    volume: 0.6
                }
            },
            'Lead (Pulse 25%)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.25,
                    attack: 0.001,
                    decay: 0.08,
                    sustain: 0.6,
                    release: 0.15,
                    volume: 0.6
                }
            },
            'Lead (Pulse 12.5%)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.125,
                    attack: 0.001,
                    decay: 0.06,
                    sustain: 0.5,
                    release: 0.12,
                    volume: 0.5
                }
            },
            'Lead (Bright)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.5,
                    attack: 0.001,
                    decay: 0.02,
                    sustain: 0.9,
                    release: 0.05,
                    volume: 0.7
                }
            },
            'Bass (Triangle)': {
                type: '8bit',
                params: {
                    waveform: 'triangle',
                    attack: 0.001,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.2,
                    volume: 0.8
                }
            },
            'Bass (Deep)': {
                type: '8bit',
                params: {
                    waveform: 'triangle',
                    attack: 0.01,
                    decay: 0.15,
                    sustain: 0.9,
                    release: 0.3,
                    volume: 0.9
                }
            },
            'Bass (Punchy)': {
                type: '8bit',
                params: {
                    waveform: 'triangle',
                    attack: 0.001,
                    decay: 0.05,
                    sustain: 0.6,
                    release: 0.1,
                    volume: 0.85
                }
            },
            'Arp (Fast)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.5,
                    attack: 0.001,
                    decay: 0.02,
                    sustain: 0.3,
                    release: 0.05,
                    volume: 0.5
                }
            },
            'Arp (Staccato)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.25,
                    attack: 0.001,
                    decay: 0.01,
                    sustain: 0.1,
                    release: 0.02,
                    volume: 0.6
                }
            },
            'Kick (Noise)': {
                type: '8bit',
                params: {
                    waveform: 'noise',
                    noiseType: 'white',
                    attack: 0.001,
                    decay: 0.05,
                    sustain: 0.1,
                    release: 0.05,
                    volume: 0.9
                }
            },
            'Snare (Periodic)': {
                type: '8bit',
                params: {
                    waveform: 'noise',
                    noiseType: 'periodic',
                    attack: 0.001,
                    decay: 0.08,
                    sustain: 0.2,
                    release: 0.1,
                    volume: 0.8
                }
            },
            'Hi-Hat (Noise)': {
                type: '8bit',
                params: {
                    waveform: 'noise',
                    noiseType: 'white',
                    attack: 0.001,
                    decay: 0.02,
                    sustain: 0.05,
                    release: 0.02,
                    volume: 0.6
                }
            },
            'Crash (Noise)': {
                type: '8bit',
                params: {
                    waveform: 'noise',
                    noiseType: 'white',
                    attack: 0.001,
                    decay: 0.3,
                    sustain: 0.4,
                    release: 0.5,
                    volume: 0.7
                }
            },
            'Zap (Triangle)': {
                type: '8bit',
                params: {
                    waveform: 'triangle',
                    attack: 0.001,
                    decay: 0.15,
                    sustain: 0.1,
                    release: 0.05,
                    volume: 0.7
                }
            },
            'Blip (Pulse)': {
                type: '8bit',
                params: {
                    waveform: 'pulse',
                    pulseWidth: 0.5,
                    attack: 0.001,
                    decay: 0.01,
                    sustain: 0.05,
                    release: 0.01,
                    volume: 0.6
                }
            },
            'Explosion (Noise)': {
                type: '8bit',
                params: {
                    waveform: 'noise',
                    noiseType: 'white',
                    attack: 0.001,
                    decay: 0.5,
                    sustain: 0.2,
                    release: 0.8,
                    volume: 0.8
                }
            }
        };
    }
    
    static get32BitPresets() {
        return {
            'Analog Lead': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'square',
                    osc2Detune: 7,
                    osc2Level: 0.6,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 3000,
                    filterQ: 5,
                    filterEnv: 0.7,
                    attack: 0.01,
                    decay: 0.2,
                    sustain: 0.7,
                    release: 0.3,
                    filterAttack: 0.05,
                    filterDecay: 0.3,
                    filterSustain: 0.4,
                    filterRelease: 0.5,
                    volume: 0.6
                }
            },
            'Supersaw Lead': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: 14,
                    osc2Level: 0.8,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 4000,
                    filterQ: 3,
                    filterEnv: 0.6,
                    attack: 0.02,
                    decay: 0.25,
                    sustain: 0.7,
                    release: 0.4,
                    filterAttack: 0.08,
                    filterDecay: 0.35,
                    filterSustain: 0.5,
                    filterRelease: 0.6,
                    volume: 0.5
                }
            },
            'Square Lead': {
                type: '32bit',
                params: {
                    osc1Wave: 'square',
                    osc2Wave: 'square',
                    osc2Detune: 5,
                    osc2Level: 0.5,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 2500,
                    filterQ: 4,
                    filterEnv: 0.8,
                    attack: 0.01,
                    decay: 0.15,
                    sustain: 0.6,
                    release: 0.25,
                    filterAttack: 0.02,
                    filterDecay: 0.2,
                    filterSustain: 0.3,
                    filterRelease: 0.4,
                    volume: 0.6
                }
            },
            'Screamer Lead': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'square',
                    osc2Detune: 12,
                    osc2Level: 0.7,
                    oscMix: 0.6,
                    filterType: 'lowpass',
                    filterFreq: 5000,
                    filterQ: 8,
                    filterEnv: 0.9,
                    attack: 0.005,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.2,
                    filterAttack: 0.01,
                    filterDecay: 0.15,
                    filterSustain: 0.6,
                    filterRelease: 0.3,
                    volume: 0.65
                }
            },
            'Warm Bass': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'square',
                    osc2Detune: -12,
                    osc2Level: 0.8,
                    oscMix: 0.3,
                    filterType: 'lowpass',
                    filterFreq: 800,
                    filterQ: 2,
                    filterEnv: 0.4,
                    attack: 0.001,
                    decay: 0.1,
                    sustain: 0.9,
                    release: 0.2,
                    filterAttack: 0.01,
                    filterDecay: 0.2,
                    filterSustain: 0.3,
                    filterRelease: 0.3,
                    volume: 0.8
                }
            },
            'Sub Bass': {
                type: '32bit',
                params: {
                    osc1Wave: 'sine',
                    osc2Wave: 'triangle',
                    osc2Detune: -12,
                    osc2Level: 0.6,
                    oscMix: 0.3,
                    filterType: 'lowpass',
                    filterFreq: 500,
                    filterQ: 1,
                    filterEnv: 0.2,
                    attack: 0.001,
                    decay: 0.08,
                    sustain: 0.95,
                    release: 0.15,
                    filterAttack: 0.005,
                    filterDecay: 0.1,
                    filterSustain: 0.2,
                    filterRelease: 0.2,
                    volume: 0.9
                }
            },
            'Wobble Bass': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: -7,
                    osc2Level: 0.7,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 1200,
                    filterQ: 6,
                    filterEnv: 0.5,
                    attack: 0.001,
                    decay: 0.15,
                    sustain: 0.8,
                    release: 0.25,
                    filterAttack: 0.01,
                    filterDecay: 0.2,
                    filterSustain: 0.4,
                    filterRelease: 0.3,
                    lfoRate: 6,
                    lfoAmount: 0.7,
                    lfoTarget: 'filter',
                    volume: 0.75
                }
            },
            'Reese Bass': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: 3,
                    osc2Level: 0.9,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 600,
                    filterQ: 1.5,
                    filterEnv: 0.3,
                    attack: 0.01,
                    decay: 0.12,
                    sustain: 0.85,
                    release: 0.3,
                    filterAttack: 0.02,
                    filterDecay: 0.18,
                    filterSustain: 0.25,
                    filterRelease: 0.35,
                    volume: 0.8
                }
            },
            'Pad (Warm)': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: 12,
                    osc2Level: 0.7,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 1500,
                    filterQ: 1,
                    filterEnv: 0.3,
                    attack: 0.3,
                    decay: 0.4,
                    sustain: 0.8,
                    release: 1.0,
                    filterAttack: 0.5,
                    filterDecay: 0.5,
                    filterSustain: 0.6,
                    filterRelease: 1.2,
                    lfoRate: 3,
                    lfoAmount: 0.3,
                    lfoTarget: 'filter',
                    volume: 0.5
                }
            },
            'Pad (Bright)': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'triangle',
                    osc2Detune: 19,
                    osc2Level: 0.6,
                    oscMix: 0.6,
                    filterType: 'lowpass',
                    filterFreq: 2500,
                    filterQ: 1.5,
                    filterEnv: 0.4,
                    attack: 0.4,
                    decay: 0.5,
                    sustain: 0.75,
                    release: 1.2,
                    filterAttack: 0.6,
                    filterDecay: 0.6,
                    filterSustain: 0.5,
                    filterRelease: 1.4,
                    lfoRate: 2.5,
                    lfoAmount: 0.4,
                    lfoTarget: 'filter',
                    volume: 0.55
                }
            },
            'Pad (Dark)': {
                type: '32bit',
                params: {
                    osc1Wave: 'sine',
                    osc2Wave: 'triangle',
                    osc2Detune: 7,
                    osc2Level: 0.5,
                    oscMix: 0.4,
                    filterType: 'lowpass',
                    filterFreq: 1000,
                    filterQ: 0.8,
                    filterEnv: 0.2,
                    attack: 0.5,
                    decay: 0.6,
                    sustain: 0.85,
                    release: 1.5,
                    filterAttack: 0.7,
                    filterDecay: 0.7,
                    filterSustain: 0.7,
                    filterRelease: 1.8,
                    volume: 0.45
                }
            },
            'Pluck': {
                type: '32bit',
                params: {
                    osc1Wave: 'triangle',
                    osc2Wave: 'sine',
                    osc2Detune: 0,
                    osc2Level: 0.5,
                    oscMix: 0.4,
                    filterType: 'lowpass',
                    filterFreq: 4000,
                    filterQ: 3,
                    filterEnv: 0.8,
                    attack: 0.001,
                    decay: 0.15,
                    sustain: 0.2,
                    release: 0.2,
                    filterAttack: 0.001,
                    filterDecay: 0.1,
                    filterSustain: 0.1,
                    filterRelease: 0.2,
                    volume: 0.6
                }
            },
            'Bell': {
                type: '32bit',
                params: {
                    osc1Wave: 'sine',
                    osc2Wave: 'sine',
                    osc2Detune: 1200,
                    osc2Level: 0.4,
                    oscMix: 0.7,
                    filterType: 'lowpass',
                    filterFreq: 6000,
                    filterQ: 2,
                    filterEnv: 0.5,
                    attack: 0.001,
                    decay: 0.3,
                    sustain: 0.3,
                    release: 0.8,
                    filterAttack: 0.005,
                    filterDecay: 0.4,
                    filterSustain: 0.2,
                    filterRelease: 1.0,
                    volume: 0.55
                }
            },
            'Kalimba': {
                type: '32bit',
                params: {
                    osc1Wave: 'triangle',
                    osc2Wave: 'triangle',
                    osc2Detune: 1200,
                    osc2Level: 0.3,
                    oscMix: 0.6,
                    filterType: 'lowpass',
                    filterFreq: 3500,
                    filterQ: 2.5,
                    filterEnv: 0.6,
                    attack: 0.001,
                    decay: 0.2,
                    sustain: 0.15,
                    release: 0.3,
                    filterAttack: 0.002,
                    filterDecay: 0.25,
                    filterSustain: 0.1,
                    filterRelease: 0.4,
                    volume: 0.6
                }
            },
            'Brass': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: -7,
                    osc2Level: 0.7,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 2500,
                    filterQ: 4,
                    filterEnv: 0.5,
                    attack: 0.05,
                    decay: 0.3,
                    sustain: 0.7,
                    release: 0.4,
                    filterAttack: 0.1,
                    filterDecay: 0.4,
                    filterSustain: 0.5,
                    filterRelease: 0.5,
                    volume: 0.7
                }
            },
            'Strings': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: 8,
                    osc2Level: 0.8,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 2000,
                    filterQ: 1.5,
                    filterEnv: 0.3,
                    attack: 0.2,
                    decay: 0.3,
                    sustain: 0.85,
                    release: 0.8,
                    filterAttack: 0.3,
                    filterDecay: 0.4,
                    filterSustain: 0.6,
                    filterRelease: 1.0,
                    volume: 0.6
                }
            },
            'PWM Lead': {
                type: '32bit',
                params: {
                    osc1Wave: 'square',
                    osc2Wave: 'square',
                    osc2Detune: 0,
                    osc2Level: 1.0,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 3500,
                    filterQ: 3,
                    filterEnv: 0.6,
                    attack: 0.01,
                    decay: 0.15,
                    sustain: 0.6,
                    release: 0.25,
                    filterAttack: 0.02,
                    filterDecay: 0.2,
                    filterSustain: 0.4,
                    filterRelease: 0.4,
                    lfoRate: 5,
                    lfoAmount: 0.5,
                    lfoTarget: 'pitch',
                    volume: 0.6
                }
            },
            'Hoover': {
                type: '32bit',
                params: {
                    osc1Wave: 'sawtooth',
                    osc2Wave: 'sawtooth',
                    osc2Detune: 24,
                    osc2Level: 0.8,
                    oscMix: 0.5,
                    filterType: 'lowpass',
                    filterFreq: 1800,
                    filterQ: 5,
                    filterEnv: 0.7,
                    attack: 0.02,
                    decay: 0.2,
                    sustain: 0.75,
                    release: 0.3,
                    filterAttack: 0.05,
                    filterDecay: 0.3,
                    filterSustain: 0.5,
                    filterRelease: 0.4,
                    lfoRate: 7,
                    lfoAmount: 0.6,
                    lfoTarget: 'filter',
                    volume: 0.65
                }
            },
            'Metallic': {
                type: '32bit',
                params: {
                    osc1Wave: 'sine',
                    osc2Wave: 'sine',
                    osc2Detune: 700,
                    osc2Level: 0.6,
                    oscMix: 0.7,
                    filterType: 'bandpass',
                    filterFreq: 3000,
                    filterQ: 8,
                    filterEnv: 0.4,
                    attack: 0.001,
                    decay: 0.2,
                    sustain: 0.4,
                    release: 0.3,
                    filterAttack: 0.005,
                    filterDecay: 0.25,
                    filterSustain: 0.3,
                    filterRelease: 0.4,
                    volume: 0.6
                }
            }
        };
    }
    
    static getDrumKitMappings() {
        return {
            '808 Kit': {
                36: 'kick_808.wav',
                38: 'snare_808.wav',
                40: 'clap_808.wav',
                42: 'hat_closed_808.wav',
                46: 'hat_open_808.wav',
                49: 'crash_808.wav',
                51: 'ride_808.wav',
                45: 'tom_low_808.wav',
                47: 'tom_mid_808.wav',
                48: 'tom_hi_808.wav'
            },
            '909 Kit': {
                36: 'kick_909.wav',
                38: 'snare_909.wav',
                40: 'clap_909.wav',
                42: 'hat_closed_909.wav',
                46: 'hat_open_909.wav',
                49: 'crash_909.wav',
                51: 'ride_909.wav',
                45: 'tom_low_909.wav',
                47: 'tom_mid_909.wav',
                48: 'tom_hi_909.wav'
            }
        };
    }
    
    static getWavetablePresets() {
        return {
            'Digital Edge': {
                type: 'wavetable',
                params: {
                    wavetable: 'digital',
                    subLevel: 0.4,
                    filterFreq: 4000,
                    filterQ: 2,
                    filterEnv: 0.6,
                    attack: 0.02,
                    decay: 0.2,
                    sustain: 0.4,
                    release: 0.5,
                    volume: 0.6
                }
            },
            'Analog Warmth': {
                type: 'wavetable',
                params: {
                    wavetable: 'analog',
                    subLevel: 0.6,
                    filterFreq: 1500,
                    filterQ: 1.5,
                    filterEnv: 0.3,
                    attack: 0.1,
                    decay: 0.4,
                    sustain: 0.7,
                    release: 0.8,
                    volume: 0.7
                }
            },
            'Basic Saw': {
                type: 'wavetable',
                params: {
                    wavetable: 'basic',
                    subLevel: 0.2,
                    filterFreq: 8000,
                    filterQ: 1,
                    filterEnv: 0.5,
                    attack: 0.01,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.2,
                    volume: 0.6
                }
            }
        };
    }

    static applyPreset(instrument, presetName, category = null) {
        let preset = null;
        
        if (category === '8bit' || !category) {
            const presets8bit = this.get8BitPresets();
            if (presets8bit[presetName]) preset = presets8bit[presetName];
        }
        
        if (!preset && (category === '32bit' || !category)) {
            const presets32bit = this.get32BitPresets();
            if (presets32bit[presetName]) preset = presets32bit[presetName];
        }

        if (!preset && (category === 'wavetable' || !category)) {
            const presetsWavetable = this.getWavetablePresets();
            if (presetsWavetable[presetName]) preset = presetsWavetable[presetName];
        }
        
        if (!preset) {
            console.warn('Preset not found:', presetName);
            return false;
        }
        
        // Apply all parameters
        Object.keys(preset.params).forEach(key => {
            instrument.setParam(key, preset.params[key]);
        });
        
        // Apply specialized setters
        if (instrument instanceof Synth8Bit) {
            if (preset.params.waveform) instrument.setWaveform(preset.params.waveform);
            if (preset.params.pulseWidth) instrument.setPulseWidth(preset.params.pulseWidth);
            if (preset.params.noiseType) instrument.setNoiseType(preset.params.noiseType);
        }
        
        if (instrument instanceof Synth32Bit || instrument instanceof SynthWavetable) {
            if (preset.params.filterFreq && instrument.setFilterFreq) {
                instrument.setFilterFreq(preset.params.filterFreq);
            }
            if (preset.params.filterQ && instrument.setFilterQ) {
                instrument.setFilterQ(preset.params.filterQ);
            }
        }
        
        return true;
    }
    
    static getAllPresets() {
        return {
            '8-Bit': Object.keys(this.get8BitPresets()),
            '32-Bit': Object.keys(this.get32BitPresets()),
            'Wavetable': Object.keys(this.getWavetablePresets()),
            'Drum Kits': Object.keys(this.getDrumKitMappings())
        };
    }
}

window.InstrumentPresets = InstrumentPresets;
