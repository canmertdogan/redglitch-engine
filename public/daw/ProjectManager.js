/**
 * KETEBE Project Manager - Save/Load/Export DAW projects
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
        
        if (instrument instanceof Synth8Bit) {
            data.type = '8bit';
        } else if (instrument instanceof Synth32Bit) {
            data.type = '32bit';
        } else if (instrument instanceof Sampler) {
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
            localStorage.setItem('ketebe_daw_autosave', json);
            console.log('Auto-saved to localStorage');
        } catch (e) {
            console.warn('Auto-save failed:', e);
        }
    }
    
    loadAutoSave() {
        try {
            const json = localStorage.getItem('ketebe_daw_autosave');
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
        localStorage.removeItem('ketebe_daw_autosave');
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
    
    async exportToWAV(duration = 60, callback = null) {
        alert('Audio export feature coming soon! For now, use system audio recording.');
        if (callback) callback(null);
    }
    
    setProjectName(name) {
        this.projectName = name;
    }
}

window.ProjectManager = ProjectManager;
