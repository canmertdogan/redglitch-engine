/**
 * VORTEX Audio Engine - Core WebAudio System
 * Handles audio context, master bus, routing, timing, and scheduling
 */

class AudioEngine {
    constructor() {
        // Create audio context
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.isRunning = false;
        
        // --- MASTER CHANNEL ---
        // We defer initialization until after the class is fully constructed 
        // because MixerChannel depends on 'window.MixerChannel' which is loaded.
        // But since we are inside the class, we assume it's available or we wait.
        
        // Create Master Channel
        // Note: We'll attach the mastering chain AFTER the master channel's fader/pan
        // so the fader controls the volume going INTO the limiter.
        
        // 1. Dynamics (Compressor -> Limiter)
        this.masterCompressor = this.ctx.createDynamicsCompressor();
        this.masterCompressor.threshold.value = -12;
        this.masterCompressor.knee.value = 30;
        this.masterCompressor.ratio.value = 2;
        this.masterCompressor.attack.value = 0.003;
        this.masterCompressor.release.value = 0.25;
        
        this.masterLimiter = this.ctx.createDynamicsCompressor();
        this.masterLimiter.threshold.value = -0.5;
        this.masterLimiter.knee.value = 0;
        this.masterLimiter.ratio.value = 20; // Limiting
        this.masterLimiter.attack.value = 0.001;
        this.masterLimiter.release.value = 0.1;

        // 2. Master Gain (The "volume knob" for the speakers)
        this.monitorGain = this.ctx.createGain();
        this.monitorGain.gain.value = 1.0;
        
        // 3. Connect Chain: [MasterChannel Output] -> Compressor -> Limiter -> Monitor -> Destination
        this.masterCompressor.connect(this.masterLimiter);
        this.masterLimiter.connect(this.monitorGain);
        this.monitorGain.connect(this.ctx.destination);
        
        // Master Channel Object (Created later or now if available)
        this.masterChannel = null;

        // Timing configuration
        this.bpm = 120;
        this.timeSignature = { numerator: 4, denominator: 4 };
        this.lookahead = 25.0; // milliseconds
        this.scheduleAheadTime = 0.1; // seconds
        this.currentBeat = 0;
        this.nextNoteTime = 0;
        this.isPlaying = false;
        this.schedulerTimer = null;
        
        // Auto-resume context on user interaction
        this.setupContextResume();
    }

    initMaster() {
        if (window.MixerChannel) {
            this.masterChannel = new MixerChannel(this.ctx, this, 'master');
            // Master channel output feeds the mastering chain
            this.masterChannel.output.connect(this.masterCompressor);
            // Default master volume
            this.masterChannel.setVolume(0.8);
        }
    }
    
    setupContextResume() {
        if (this.ctx.state === 'suspended') {
            const resume = () => {
                this.ctx.resume();
                this.isRunning = true;
                if (!this.masterChannel) this.initMaster();
                document.removeEventListener('click', resume);
                document.removeEventListener('keydown', resume);
            };
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('keydown', resume, { once: true });
        } else {
            this.isRunning = true;
            setTimeout(() => this.initMaster(), 100); // Small delay to ensure scripts loaded
        }
    }
    
    // Time conversion utilities
    beatsToSeconds(beats) {
        return (60.0 / this.bpm) * beats;
    }
    
    secondsToBeats(seconds) {
        return (this.bpm / 60.0) * seconds;
    }
    
    getCurrentTime() {
        return this.ctx.currentTime;
    }
    
    // Get smoothed beat position for UI
    getSmoothedBeat() {
        if (!this.isPlaying) return this.currentBeat;
        
        // Calculate beat based on time difference from last scheduled note
        // This is an approximation. For perfect sync, we'd need to track the exact time play() started 
        // or the time of the last scheduled beat.
        // But since we schedule ahead, currentBeat is actually "ahead" of playback.
        
        // Let's rely on: currentBeat corresponds to nextNoteTime.
        // So actual_playhead_time = ctx.currentTime
        // diff = nextNoteTime - ctx.currentTime (positive value)
        // beat_diff = secondsToBeats(diff)
        // actual_beat = currentBeat - beat_diff
        
        const timeToNextNote = this.nextNoteTime - this.ctx.currentTime;
        const beatDiff = this.secondsToBeats(timeToNextNote);
        const smoothBeat = this.currentBeat - beatDiff;
        
        return Math.max(0, smoothBeat);
    }
    
    // BPM control
    setBPM(bpm) {
        this.bpm = Math.max(20, Math.min(300, bpm));
    }
    
    getBPM() {
        return this.bpm;
    }
    
    // Transport controls
    play(startBeat = null) {
        if (this.isPlaying) return;
        
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        this.isPlaying = true;
        
        if (startBeat !== null) {
            this.currentBeat = startBeat;
        } else {
            // Recalculate next note time based on current time + lookahead
            this.nextNoteTime = this.ctx.currentTime + 0.05;
        }
        
        // Reset scheduling
        this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    
    stop() {
        this.isPlaying = false;
        this.clearScheduler();
        // Don't reset currentBeat to 0 here if we want to pause behavior
        this.currentBeat = 0;
        this.nextNoteTime = 0;
    }
    
    pause() {
        this.isPlaying = false;
        this.clearScheduler();
    }
    
    clearScheduler() {
        if (this.schedulerTimer) {
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
        }
    }
    
    // Main scheduler - called with callback from DAW
    schedule(callback) {
        if (!callback) {
            this.clearScheduler();
            return;
        }
        
        // Look ahead
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            callback(this.currentBeat, this.nextNoteTime);
            this.advanceBeat();
        }
        
        if (this.isPlaying) {
            this.schedulerTimer = setTimeout(() => this.schedule(callback), this.lookahead);
        }
    }
    
    advanceBeat() {
        const secondsPerBeat = 60.0 / this.bpm;
        const beatIncrement = 0.25; // 16th notes
        this.nextNoteTime += beatIncrement * secondsPerBeat;
        this.currentBeat += beatIncrement;
    }
    
    // Master volume control (Monitor level)
    setMasterVolume(value) {
        if (this.masterChannel) {
            this.masterChannel.setVolume(value);
        }
    }
    
    getMasterVolume() {
        return this.masterChannel ? this.masterChannel.volume : 0.8;
    }
    
    // Visualization data
    getFrequencyData() {
        if (!this.masterChannel) return new Uint8Array(1024);
        const dataArray = new Uint8Array(this.masterChannel.analyzer.frequencyBinCount);
        this.masterChannel.analyzer.getByteFrequencyData(dataArray);
        return dataArray;
    }
    
    getTimeDomainData() {
        if (!this.masterChannel) return new Uint8Array(1024);
        const dataArray = new Uint8Array(this.masterChannel.analyzer.fftSize);
        this.masterChannel.analyzer.getByteTimeDomainData(dataArray);
        return dataArray;
    }
}

window.AudioEngine = AudioEngine;
