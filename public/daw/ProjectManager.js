/**
 * REDGLITCH Project Manager - Save/Load/Export DAW projects
 */

class ProjectManager {
    constructor(daw) {
        this.daw = daw;
        this.projectName = 'Untitled Project';
        this.lastSaved = null;
        this.autoSaveEnabled = true;
        this.autoSaveInterval = 120000; // 2 minutes
        this.autoSaveTimer = null;
        
        if (this.autoSaveEnabled) {
            this.startAutoSave();
        }
    }
    
    serializeProject() {
        const project = {
            version: '1.0.0',
            name: this.projectName,
            created: this.lastSaved || new Date().toISOString(),
            modified: new Date().toISOString(),
            
            bpm: this.daw.engine.bpm,
            timeSignature: this.daw.engine.timeSignature,
            masterVolume: this.daw.engine.getMasterVolume(),
            
            tracks: this.daw.tracks.map(track => ({
                id: track.id,
                name: track.name,
                type: track.type,
                volume: track.volume,
                pan: track.pan,
                muted: track.muted,
                solo: track.solo,
                
                instrument: this.serializeInstrument(track.instrument),
                
                notes: track.notes.map(note => ({
                    pitch: note.pitch,
                    startBeat: note.startBeat,
                    lengthBeats: note.lengthBeats,
                    velocity: note.velocity
                })),
                
                clips: track.clips.map(clip => ({
                    startBeat: clip.startBeat,
                    lengthBeats: clip.lengthBeats
                }))
            }))
        };
        
        return project;
    }
    
    serializeInstrument(instrument) {
        if (!instrument) return null;
        
        const data = {
            type: null,
            params: {}
        };
        
        if (typeof Synth8Bit !== 'undefined' && instrument instanceof Synth8Bit) {
            data.type = '8bit';
        } else if (typeof Synth32Bit !== 'undefined' && instrument instanceof Synth32Bit) {
            data.type = '32bit';
        } else if (typeof SynthWavetable !== 'undefined' && instrument instanceof SynthWavetable) {
            data.type = 'wavetable';
        } else if (typeof Sampler !== 'undefined' && instrument instanceof Sampler) {
            data.type = 'sampler';
        }
        
        data.params = { ...instrument.params };
        
        return data;
    }
    
    async deserializeProject(projectData) {
        try {
            this.daw.clearAllTracks();
            
            this.projectName = projectData.name || 'Untitled Project';
            this.lastSaved = projectData.modified;
            this.daw.engine.setBPM(projectData.bpm || 120);
            this.daw.engine.setMasterVolume(projectData.masterVolume || 0.8);
            
            for (const trackData of projectData.tracks) {
                const track = this.daw.addTrack(trackData.type, trackData.name);
                
                track.setVolume(trackData.volume);
                track.setPan(trackData.pan);
                track.setMute(trackData.muted);
                track.setSolo(trackData.solo);
                
                if (trackData.instrument) {
                    const instrument = this.deserializeInstrument(trackData.instrument);
                    if (instrument) {
                        track.setInstrument(instrument);
                    }
                }
                
                track.clearNotes();
                trackData.notes.forEach(noteData => {
                    track.addNote(
                        noteData.pitch,
                        noteData.startBeat,
                        noteData.lengthBeats,
                        noteData.velocity
                    );
                });
            }
            
            return true;
        } catch (e) {
            console.error('Failed to deserialize project:', e);
            return false;
        }
    }
    
    deserializeInstrument(instrumentData) {
        if (!instrumentData || !instrumentData.type) return null;
        
        let instrument = null;
        
        if (instrumentData.type === '8bit') {
            instrument = new Synth8Bit(this.daw.engine.ctx);
        } else if (instrumentData.type === '32bit') {
            instrument = new Synth32Bit(this.daw.engine.ctx);
        } else if (instrumentData.type === 'wavetable') {
            instrument = new SynthWavetable(this.daw.engine.ctx);
        } else if (instrumentData.type === 'sampler') {
            instrument = new Sampler(this.daw.engine.ctx);
        }
        
        if (instrument && instrumentData.params) {
            Object.keys(instrumentData.params).forEach(key => {
                instrument.setParam(key, instrumentData.params[key]);
            });
        }
        
        return instrument;
    }
    
    saveProject(filename = null) {
        const projectData = this.serializeProject();
        const json = JSON.stringify(projectData, null, 2);
        
        filename = filename || this.projectName + '.kbdaw';
        
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        this.lastSaved = new Date().toISOString();
        console.log('Project saved:', filename);
    }
    
    async loadProject(file) {
        try {
            const text = await file.text();
            const projectData = JSON.parse(text);
            
            const success = await this.deserializeProject(projectData);
            
            if (success) {
                console.log('Project loaded:', projectData.name);
                this.daw.renderAll();
                return true;
            }
        } catch (e) {
            console.error('Failed to load project:', e);
            alert('Failed to load project. File may be corrupted.');
        }
        
        return false;
    }
    
    autoSave() {
        try {
            const projectData = this.serializeProject();
            const json = JSON.stringify(projectData);
            localStorage.setItem('redglitch_daw_autosave', json);
            console.log('Auto-saved to localStorage');
        } catch (e) {
            console.warn('Auto-save failed:', e);
        }
    }
    
    loadAutoSave() {
        try {
            const json = localStorage.getItem('redglitch_daw_autosave');
            if (json) {
                const projectData = JSON.parse(json);
                return this.deserializeProject(projectData);
            }
        } catch (e) {
            console.error('Failed to load auto-save:', e);
        }
        return false;
    }
    
    clearAutoSave() {
        localStorage.removeItem('redglitch_daw_autosave');
    }
    
    startAutoSave() {
        if (this.autoSaveTimer) return;
        
        this.autoSaveTimer = setInterval(() => {
            this.autoSave();
        }, this.autoSaveInterval);
    }
    
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
    
    async exportToWAV(duration = null, callback = null) {
        // Functional offline render: OfflineAudioContext + simple oscillator notes from all tracks.
        try {
            const bpm = this.daw?.engine?.bpm || 120;
            const beatsToSec = (beats) => (60.0 / bpm) * beats;
            // Clamp duration to content (plus tail) but cap at 120s to avoid huge buffers
            const endBeat = Math.max(4, ...this.daw.tracks.flatMap(tr => (tr.notes || []).map(n => n.startBeat + n.lengthBeats)));
            duration = Math.min(duration || beatsToSec(endBeat), 120);
            const sr = 44100;
            const off = new OfflineAudioContext(1, Math.ceil(sr * duration), sr);
            const master = off.createGain(); master.gain.value = 0.8; master.connect(off.destination);
            let anyTs = false;
            for (const tr of this.daw.tracks || []) {
                if (tr.muted) continue;
                for (const note of (tr.notes || [])) {
                    const start = beatsToSec(note.startBeat);
                    const dur = Math.max(0.05, beatsToSec(note.lengthBeats));
                    if (start >= duration) continue;
                    const osc = off.createOscillator();
                    const g = off.createGain();
                    const vol = ((note.velocity ?? 100) / 127) * (tr.volume ?? 0.8) * 0.3;
                    osc.frequency.value = 440 * Math.pow(2, ((note.pitch ?? 60) - 69) / 12);
                    osc.type = (tr.type === 'drum' ? 'square' : 'triangle');
                    osc.connect(g); g.connect(master);
                    osc.start(start); osc.stop(start + Math.min(dur, duration - start));
                    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + Math.min(dur, duration - start));
                    anyTs = true;
                }
            }
            if (!anyTs) { if (callback) callback(null); console.warn('[ProjectManager] No notes to export'); return; }
            const rendered = await off.startRendering();
            const blob = this._bufferToWavBlob(rendered);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = (this.projectName || 'project') + '.wav';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            if (callback) callback(blob);
        } catch (e) {
            console.error('[ProjectManager] exportToWAV failed', e);
            if (callback) callback(null, e);
        }
    }
    _bufferToWavBlob(buffer) {
        const numCh = buffer.numberOfChannels, sr = buffer.sampleRate;
        const interleaved = new Float32Array(buffer.length * numCh);
        for (let ch = 0; ch < numCh; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < buffer.length; i++) interleaved[i*numCh+ch] = d[i]; }
        const bytesPerSample = 2, block = numCh * bytesPerSample;
        const ab = new ArrayBuffer(44 + interleaved.length * bytesPerSample);
        const v = new DataView(ab);
        const ws = (o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
        ws(0,'RIFF'); v.setUint32(4, 36 + interleaved.length*bytesPerSample, true); ws(8,'WAVEfmt ');
        v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true); v.setUint32(24,sr,true);
        v.setUint32(28,sr*block,true); v.setUint16(32,block,true); v.setUint16(34,16,true); ws(36,'data');
        v.setUint32(40, interleaved.length*bytesPerSample, true);
        let off = 44;
        for (let i=0;i<interleaved.length;i++){ const s = Math.max(-1,Math.min(1,interleaved[i])); v.setInt16(off, s<0? s*32768 : s*32767, true); off+=2; }
        return new Blob([ab], {type:'audio/wav'});
    }
    
    setProjectName(name) {
        this.projectName = name;
    }
}

window.ProjectManager = ProjectManager;
