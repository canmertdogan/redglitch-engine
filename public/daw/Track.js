/**
 * KETEBE Track - Individual audio track with effects chain and metering
 */

class Track {
    constructor(id, name, type, audioEngine) {
        this.id = id;
        this.name = name;
        this.type = type; // 'synth' or 'sampler'
        this.engine = audioEngine;
        this.ctx = audioEngine.ctx;
        
        // --- AUDIO CHANNEL ---
        // Use the new MixerChannel class for all audio handling
        this.mixerChannel = new MixerChannel(this.ctx, this.engine, id);
        
        // Connect to Master by default
        // If master channel exists, connect to it, otherwise connect to masterGain (fallback)
        if (this.engine.masterChannel) {
            this.mixerChannel.connect(this.engine.masterChannel.input);
        } else if (this.engine.masterCompressor) {
             // Fallback if master channel isn't ready (though it should be)
            this.mixerChannel.connect(this.engine.masterCompressor);
        }
        
        // Track state
        this.muted = false;
        this.solo = false;
        this.armed = false;
        this.volume = 0.7;
        this.pan = 0;
        
        // Initialize channel state
        this.mixerChannel.setVolume(this.volume);
        this.mixerChannel.setPan(this.pan);
        
        // Note storage
        this.clips = [];
        this.notes = [];
        this.audioClips = []; // { startBeat, buffer, durationBeats, offset }
        
        // Automation storage: { paramName: [ { beat, value } ] }
        // e.g., 'volume': [ { beat: 0, value: 0.8 }, { beat: 4, value: 0.5 } ]
        this.automation = {};
        
        // Instrument reference
        this.instrument = null;
        
        // Metering values
        this.peakLevel = 0;
        this.rmsLevel = 0;
    }
    
    addAudioClip(startBeat, buffer) {
        if (!buffer) return;
        // Calculate duration in beats based on current BPM? 
        // This is tricky if BPM changes. Usually store duration in seconds and calc beats on render.
        // For now, assume fixed BPM for calculation or store seconds.
        // Let's store seconds but convert to beats for UI.
        
        const durationSec = buffer.duration;
        const durationBeats = (this.engine.bpm / 60) * durationSec;
        
        const clip = {
            id: Date.now() + Math.random(),
            type: 'audio',
            startBeat,
            buffer,
            durationBeats,
            offset: 0 // offset into sample
        };
        this.audioClips.push(clip);
        return clip;
    }

    playAudioClip(clip, startTime, offsetSec = 0, durationSec = null) {
        const source = this.ctx.createBufferSource();
        source.buffer = clip.buffer;
        
        // Connect to mixer
        source.connect(this.mixerChannel.input);
        
        source.start(startTime, clip.offset + offsetSec, durationSec || (clip.buffer.duration - clip.offset));
    }
    
    // Automation management
    addAutomationPoint(param, beat, value) {
        if (!this.automation[param]) {
            this.automation[param] = [];
        }
        
        // Remove existing point at same time if exists
        // (Simple implementation, ideally we'd use a sorted insert/replace)
        const existingIdx = this.automation[param].findIndex(p => Math.abs(p.beat - beat) < 0.01);
        if (existingIdx !== -1) {
            this.automation[param].splice(existingIdx, 1);
        }
        
        this.automation[param].push({ beat, value });
        this.automation[param].sort((a, b) => a.beat - b.beat);
    }
    
    getAutomationValueAt(param, beat) {
        if (!this.automation[param] || this.automation[param].length === 0) return null;
        
        const points = this.automation[param];
        
        // Find points before and after
        let prev = null;
        let next = null;
        
        for (let i = 0; i < points.length; i++) {
            if (points[i].beat <= beat) {
                prev = points[i];
            } else {
                next = points[i];
                break;
            }
        }
        
        if (!prev) return next ? next.value : null; // Before first point
        if (!next) return prev.value; // After last point
        
        // Linear interpolation
        const range = next.beat - prev.beat;
        const progress = (beat - prev.beat) / range;
        return prev.value + (next.value - prev.value) * progress;
    }

    // Volume control
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        this.mixerChannel.setVolume(this.volume);
    }
    
    getVolume() {
        return this.volume;
    }
    
    // Pan control
    setPan(value) {
        this.pan = Math.max(-1, Math.min(1, value));
        this.mixerChannel.setPan(this.pan);
    }
    
    getPan() {
        return this.pan;
    }
    
    // Mute/Solo controls
    setMute(muted) {
        this.muted = muted;
        this.mixerChannel.setMute(muted);
    }
    
    setSolo(solo) {
        this.solo = solo;
        // Solo logic usually handled by engine/mixer controller, 
        // but we can store state here.
    }
    
    // Effects chain management
    addEffect(effect) {
        this.mixerChannel.addInsert(effect);
    }
    
    removeEffect(index) {
        // Todo: Implement remove in MixerChannel
    }
    
    // Clip management
    addClip(startBeat, lengthBeats) {
        const clip = {
            id: Date.now() + Math.random(),
            startBeat,
            lengthBeats,
            notes: []
        };
        this.clips.push(clip);
        return clip;
    }
    
    removeClip(clipId) {
        const index = this.clips.findIndex(c => c.id === clipId);
        if (index !== -1) {
            this.clips.splice(index, 1);
        }
    }
    
    // Note management
    addNote(pitch, startBeat, lengthBeats, velocity = 100) {
        const note = {
            id: Date.now() + Math.random(),
            pitch,
            startBeat,
            lengthBeats,
            velocity
        };
        this.notes.push(note);
        return note;
    }
    
    removeNote(noteId) {
        const index = this.notes.findIndex(n => n.id === noteId);
        if (index !== -1) {
            this.notes.splice(index, 1);
        }
    }
    
    clearNotes() {
        this.notes = [];
    }
    
    getNotesInRange(startBeat, endBeat) {
        return this.notes.filter(n => {
            const noteEnd = n.startBeat + n.lengthBeats;
            return (n.startBeat >= startBeat && n.startBeat < endBeat) ||
                   (noteEnd > startBeat && noteEnd <= endBeat) ||
                   (n.startBeat < startBeat && noteEnd > endBeat);
        });
    }
    
    // Level metering
    updateMeters() {
        this.peakLevel = this.mixerChannel.getPeakLevel();
        this.rmsLevel = this.mixerChannel.getRMSLevel();
    }
    
    getPeakLevel() {
        return this.peakLevel;
    }
    
    getRMSLevel() {
        return this.rmsLevel;
    }
    
    // Instrument connection
    setInstrument(instrument) {
        // Disconnect old instrument if it exists?
        // Note: Instrument classes usually don't have disconnect() easily exposed 
        // without digging into their internals, but we assume we are replacing it.
        
        this.instrument = instrument;
        if (instrument && instrument.output) {
            // Connect Instrument Output -> Mixer Channel Input
            instrument.output.connect(this.mixerChannel.input);
        }
    }
    
    // Play a note immediately (preview)
    playNote(pitch, velocity = 100, duration = 0.5) {
        if (this.instrument) {
            const freq = this.midiToFreq(pitch);
            this.instrument.playNote(freq, velocity / 127, duration, this.ctx.currentTime);
        }
    }
    
    // Schedule a note for playback
    scheduleNote(pitch, velocity, startTime, duration) {
        if (this.instrument) {
            const freq = this.midiToFreq(pitch);
            this.instrument.playNote(freq, velocity / 127, duration, startTime);
        }
    }
    
    // MIDI to frequency conversion
    midiToFreq(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }
    
    // Cleanup
    dispose() {
        this.mixerChannel.disconnect();
        if (this.instrument && this.instrument.dispose) {
            this.instrument.dispose();
        }
    }
}

window.Track = Track;
