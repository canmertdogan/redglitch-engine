/**
 * VORTEX Audio Recorder
 * Handles microphone input, recording to buffer, and creating audio clips.
 */

class AudioRecorder {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.mediaStream = null;
        this.mediaNode = null;
        this.recorder = null;
        this.chunks = [];
        this.isRecording = false;
    }

    async initInput() {
        if (this.mediaStream) return true;

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.mediaNode = this.ctx.createMediaStreamSource(this.mediaStream);
            return true;
        } catch (e) {
            console.error('AudioRecorder: Access denied or error', e);
            alert('Microphone access denied!');
            return false;
        }
    }

    startRecording() {
        if (!this.mediaStream) {
            this.initInput().then(success => {
                if (success) this.startRecording();
            });
            return;
        }

        this.chunks = [];
        // Use MediaRecorder API for simplicity in capturing
        // For higher quality/raw buffer, we might use ScriptProcessor/AudioWorklet, 
        // but MediaRecorder is standard for "recording to file".
        
        try {
            this.recorder = new MediaRecorder(this.mediaStream);
            
            this.recorder.ondataavailable = (e) => {
                this.chunks.push(e.data);
            };
            
            this.recorder.start();
            this.isRecording = true;
            console.log('Recording started...');
        } catch (e) {
            console.error('MediaRecorder error:', e);
        }
    }

    async stopRecording() {
        if (!this.isRecording || !this.recorder) return null;

        return new Promise((resolve) => {
            this.recorder.onstop = async () => {
                const blob = new Blob(this.chunks, { type: 'audio/webm' }); // or ogg/wav depending on browser
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                
                this.isRecording = false;
                console.log('Recording stopped. Buffer length:', audioBuffer.duration);
                resolve(audioBuffer);
            };
            
            this.recorder.stop();
        });
    }

    // Monitor input (route to speakers - careful of feedback!)
    enableMonitoring(enable) {
        if (!this.mediaNode) return;
        if (enable) {
            this.mediaNode.connect(this.ctx.destination);
        } else {
            try { this.mediaNode.disconnect(this.ctx.destination); } catch(e){}
        }
    }
}

window.AudioRecorder = AudioRecorder;
