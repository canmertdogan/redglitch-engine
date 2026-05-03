/**
 * VORTEX Piano Roll Controller v2.0
 * Handles user interaction with the piano roll: tools, snapping, selection, and editing.
 */

class PianoRollController {
    constructor(daw) {
        this.daw = daw;
        this.gridElement = daw.dom.pianoGrid;
        
        // State
        this.tool = 'pencil'; // pencil, eraser, select
        this.snap = 0.25; // Quarter note (beat) by default
        this.snapEnabled = true;
        
        this.selection = {
            active: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0,
            selectedNotes: new Set()
        };
        
        this.clipboard = [];
        
        // DOM Elements for UI overlay
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'selection-box';
        this.selectionBox.style.display = 'none';
        this.selectionBox.style.position = 'absolute';
        
        this.initUI();
    }
    
    initUI() {
        // Append selection box to grid inner if it exists
        const gridInner = document.getElementById('pr-grid-inner');
        if (gridInner) {
            gridInner.appendChild(this.selectionBox);
        }
    }
    
    // --- Tools ---
    
    setTool(toolName) {
        this.tool = toolName;
        if (toolName !== 'select') {
            this.clearSelection();
        }
    }
    
    setSnap(value) {
        this.snap = value;
        this.snapEnabled = value > 0;
    }
    
    // --- Coordinate Helpers ---
    
    getGridCoordinates(clientX, clientY) {
        const gridInner = this.daw.dom.pianoGridInner || document.getElementById('pr-grid-inner');
        if (!gridInner) return null;
        
        const rect = gridInner.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }
    
    // --- Selection Logic ---
    
    startSelectionBox(e) {
        const coords = this.getGridCoordinates(e.clientX, e.clientY);
        if (!coords) return;
        
        this.selection.active = true;
        this.selection.startX = coords.x;
        this.selection.startY = coords.y;
        this.selection.endX = coords.x;
        this.selection.endY = coords.y;
        
        this.updateSelectionBox(coords.x, coords.y);
        this.selectionBox.style.display = 'block';
        
        // Clear previous selection if shift not held
        if (!e.shiftKey) {
            this.clearSelection();
        }
    }
    
    updateSelectionDrag(e) {
        if (!this.selection.active) return;
        
        const coords = this.getGridCoordinates(e.clientX, e.clientY);
        if (!coords) return;
        
        this.selection.endX = coords.x;
        this.selection.endY = coords.y;
        
        this.updateSelectionBox(coords.x, coords.y);
        
        // Calculate bounds
        const x1 = Math.min(this.selection.startX, coords.x);
        const y1 = Math.min(this.selection.startY, coords.y);
        const x2 = Math.max(this.selection.startX, coords.x);
        const y2 = Math.max(this.selection.startY, coords.y);
        
        // Find notes in bounds
        this.selectNotesInBounds(x1, y1, x2, y2, e.shiftKey);
    }
    
    endSelectionBox() {
        this.selection.active = false;
        this.selectionBox.style.display = 'none';
    }
    
    updateSelectionBox(currentX, currentY) {
        const x = Math.min(this.selection.startX, currentX);
        const y = Math.min(this.selection.startY, currentY);
        const w = Math.abs(currentX - this.selection.startX);
        const h = Math.abs(currentY - this.selection.startY);
        
        this.selectionBox.style.left = x + 'px';
        this.selectionBox.style.top = y + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';
    }
    
    selectNote(noteId) {
        this.selection.selectedNotes.add(noteId);
        this.renderSelectionState();
    }
    
    deselectNote(noteId) {
        this.selection.selectedNotes.delete(noteId);
        this.renderSelectionState();
    }
    
    toggleSelection(noteId) {
        if (this.selection.selectedNotes.has(noteId)) {
            this.deselectNote(noteId);
        } else {
            this.selectNote(noteId);
        }
    }
    
    clearSelection() {
        this.selection.selectedNotes.clear();
        this.renderSelectionState();
    }
    
    selectNotesInBounds(x1, y1, x2, y2, addToExisting) {
        const track = this.daw.tracks[this.daw.activeTrackId];
        if (!track) return;
        
        const { BEAT_WIDTH, NOTE_HEIGHT, MAX_PITCH } = DAW_CONSTANTS;
        
        // Convert screen coords to Beat/Pitch
        const startBeat = x1 / BEAT_WIDTH;
        const endBeat = x2 / BEAT_WIDTH;
        
        // Pitch is inverted (top is high pitch)
        const pitchTop = MAX_PITCH - Math.floor(y1 / NOTE_HEIGHT);
        const pitchBottom = MAX_PITCH - Math.ceil(y2 / NOTE_HEIGHT);
        
        const maxPitch = pitchTop;
        const minPitch = pitchBottom;
        
        // Check overlap
        const tempSet = new Set(addToExisting ? this.selection.selectedNotes : []);
        
        track.notes.forEach(note => {
            const noteEnd = note.startBeat + note.lengthBeats;
            
            // Check Horizontal overlap
            const hOverlap = (note.startBeat < endBeat) && (noteEnd > startBeat);
            
            // Check Vertical overlap
            const pOverlap = (note.pitch <= maxPitch && note.pitch >= minPitch);
            
            if (hOverlap && pOverlap) {
                tempSet.add(note.id);
            }
        });
        
        this.selection.selectedNotes = tempSet;
        this.renderSelectionState();
    }
    
    renderSelectionState() {
        // Find all note elements and add/remove 'selected' class
        const notes = document.querySelectorAll('.note');
        notes.forEach(el => {
            const id = parseFloat(el.dataset.noteId);
            if (this.selection.selectedNotes.has(id)) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }

    // --- Clipboard Operations ---
    
    copySelection() {
        const track = this.daw.tracks[this.daw.activeTrackId];
        if (!track || this.selection.selectedNotes.size === 0) return;
        
        this.clipboard = [];
        let minBeat = Infinity;
        
        // Find minimum beat for relative positioning
        this.selection.selectedNotes.forEach(id => {
            const note = track.notes.find(n => n.id === id);
            if (note && note.startBeat < minBeat) {
                minBeat = note.startBeat;
            }
        });
        
        // Copy notes with relative positions
        this.selection.selectedNotes.forEach(id => {
            const note = track.notes.find(n => n.id === id);
            if (note) {
                this.clipboard.push({
                    pitch: note.pitch,
                    startBeat: note.startBeat - minBeat,
                    lengthBeats: note.lengthBeats,
                    velocity: note.velocity
                });
            }
        });
        
        console.log('Copied', this.clipboard.length, 'notes');
    }
    
    paste() {
        const track = this.daw.tracks[this.daw.activeTrackId];
        if (!track || this.clipboard.length === 0) return;
        
        // Paste at current scroll position or a default position
        const pastePosition = 0; // Could be improved to use playhead position
        
        this.clearSelection();
        
        this.clipboard.forEach(noteData => {
            const note = track.addNote(
                noteData.pitch,
                noteData.startBeat + pastePosition,
                noteData.lengthBeats,
                noteData.velocity
            );
            this.selection.selectedNotes.add(note.id);
        });
        
        this.daw.renderPianoGrid();
        this.daw.renderTimeline();
        
        console.log('Pasted', this.clipboard.length, 'notes');
    }
    
    deleteSelection() {
        const track = this.daw.tracks[this.daw.activeTrackId];
        if (!track || this.selection.selectedNotes.size === 0) return;
        
        this.selection.selectedNotes.forEach(id => {
            track.removeNote(id);
        });
        
        this.clearSelection();
        this.daw.renderPianoGrid();
        this.daw.renderTimeline();
        
        console.log('Deleted selected notes');
    }

    // --- Quantize ---
    
    quantizeSelection() {
        const track = this.daw.tracks[this.daw.activeTrackId];
        if (!track) return;
        
        const snapVal = this.snap > 0 ? this.snap : 0.25;
        
        track.notes.forEach(note => {
            if (this.selection.selectedNotes.size === 0 || this.selection.selectedNotes.has(note.id)) {
                note.startBeat = Math.round(note.startBeat / snapVal) * snapVal;
            }
        });
        
        this.daw.renderPianoGrid();
        this.daw.renderTimeline();
    }
    
    // --- Mouse Handling (delegated from DAW) ---
    
    handleMouseDown(e, note = null) {
        // This method is no longer primary - DAW handles most interaction
        // Keep for compatibility if needed
        if (this.tool === 'select' && !note) {
            this.startSelectionBox(e);
        }
    }
}

// Export
window.PianoRollController = PianoRollController;
