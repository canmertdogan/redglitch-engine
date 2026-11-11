/**
 * REDGLITCH Track - Individual audio track with effects chain and metering
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
            id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)),
            type: 'audio',
            startBeat,
            buffer,
            durationSec,
            durationBeats, // snapshot at insert time (see getClipDurationBeats for live BPM)
            offset: 0 // offset into sample
        };
        this.audioClips.push(clip);
        return clip;
    }

    /**
     * Duration of an audio clip in beats at the engine's current BPM.
     * `clip.durationBeats` is a snapshot; this stays correct after a BPM change.
     */
    getClipDurationBeats(clip) {
        if (!clip) return 0;
        const bpm = Number.isFinite(this.engine?.bpm) ? this.engine.bpm : 120;
        const seconds = Number.isFinite(clip.durationSec) ? clip.durationSec : (clip.buffer?.duration ?? 0);
        return (bpm / 60) * seconds;
    }

    playAudioClip(clip, startTime, offsetSec = 0, durationSec = null) {
        // FINDING-TRACK: clip offsets are stored on the clip; buffer bounds must be
        // read from clip.buffer (this.instrument.buffer does not exist) and the
        // start() arguments must all be finite or WebAudio throws.
        if (!clip || !clip.buffer || !this.ctx) return null;
        const bufferDuration = clip.buffer.duration;
        if (!Number.isFinite(bufferDuration) || bufferDuration <= 0) return null;

        const clipOffset = Number.isFinite(clip.offset) ? clip.offset : 0;
        const safeOffset = Math.max(0, Math.min(clipOffset + (Number.isFinite(offsetSec) ? offsetSec : 0), bufferDuration - 0.01));
        const remaining = Math.max(0, bufferDuration - safeOffset);
        const safeDuration = (Number.isFinite(durationSec) && durationSec > 0)
            ? Math.min(durationSec, remaining)
            : remaining;

        const source = this.ctx.createBufferSource();
        source.buffer = clip.buffer;
        
        // Connect to mixer
        source.connect(this.mixerChannel.input);
        
        source.start(startTime, safeOffset, safeDuration);
        return source;
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
        if (!(range > 0)) return next.value; // coincident points → no divide-by-zero
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
        // Delegate to MixerChannel: removes the insert at `index` and rebuilds the chain.
        if (this.mixerChannel && typeof this.mixerChannel.removeInsert === 'function') {
            this.mixerChannel.removeInsert(index);
        }
    }
    
    // Clip management
    addClip(startBeat, lengthBeats) {
        const clip = {
            id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)),
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
            id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)),
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
        // FINDING-TRACK: disconnect the previous instrument so replacing it does not
        // leave a second signal path feeding the mixer channel.
        if (this.instrument && this.instrument !== instrument && this.instrument.output) {
            try { this.instrument.output.disconnect(this.mixerChannel.input); }
            catch { /* was not connected */ }
        }

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
