# REDGLITCH AUDIO STUDIO - REVAMP MASTER PLAN

## 1. Executive Summary
The goal is to transform the current prototype DAW into a fully functional, professional-grade music production environment in the browser. The focus will be on a robust audio engine, a flexible mixer architecture, a suite of high-quality effects, and a smooth, intuitive user experience.

## 2. Core Architecture Overhaul (Phase 1)
**Objective:** Build a solid foundation for audio routing and timing.

### 2.1 Audio Engine Refactoring
- [ ] **Global Mixing Graph:** Move away from direct connections. Implement a proper graph: `Source -> Channel Strip -> Master Bus`.
- [ ] **Accurate Timing:** Ensure sample-accurate scheduling for all events (notes, automation).
- [ ] **Latency Compensation:** (Future proofing) Structure engine to handle processing latency.

### 2.2 Mixer System
- [ ] **MixerChannel Class:** Create a dedicated class for mixer channels.
    - Input Node
    - Insert FX Chain (Array of Effect nodes)
    - Send/Return Slots (Post-fader sends)
    - Pan / Stereo Width
    - Volume Fader (Logarithmic)
    - Output Node
- [ ] **Busses & Returns:** Implement "Send Tracks" (Aux tracks) for Reverb/Delay sharing.
- [ ] **Master Bus:** enhance the master chain with high-quality mastering limiter and metering.

### 2.3 Plugin Standard
- [ ] **AudioNode Wrapper:** Create a base `AudioPlugin` class.
    - `connect(dest)`
    - `disconnect()`
    - `setParam(key, value)`
    - `bypass(bool)`
    - `getInterface()` (Returns DOM element for UI)

## 3. Advanced Sequencing (Phase 2)
**Objective:** Empower the user to compose complex arrangements.

### 3.1 Piano Roll 2.0
- [ ] **Tools:**
    - **Pencil:** Draw notes.
    - **Brush:** Paint patterns.
    - **Eraser:** Remove notes.
    - **Slice:** Cut notes in half.
    - **Select:** Box selection.
- [ ] **Grid & Snap:** Robust snapping (1/1 to 1/64, Triplets).
- [ ] **Editing Functions:** Quantize, Transpose (+/- 12 semitones), Randomize Velocity.

### 3.2 Arrangement View
- [ ] **Clip System:** Abstract data into "Clips" (MIDI Clips, Audio Clips).
- [ ] **Manipulation:** Drag & drop clips, resize clips, loop clips.
- [ ] **Automation Lanes:** Draw curves for volume, pan, and synth parameters directly on the timeline.

## 4. Effect & Instrument Suite (Phase 3)
**Objective:** Provide built-in tools for creative sound design.

### 4.1 New Instruments
- [ ] **Wavetable Synth:** Simple wavetable oscillator support.
- [ ] **Drum Machine:** Dedicated step-sequencer interface for drums (16-pad layout).

### 4.2 Effect Plugins (Native)
- [ ] **K-EQ3:** 3-Band Parametric Equalizer with visual graph.
- [ ] **K-Verb:** Algorithmic Reverb with Room/Hall sizes.
- [ ] **K-Delay:** Stereo Delay with ping-pong and sync-to-bpm.
- [ ] **K-Drive:** Saturation/Distortion unit.
- [ ] **K-Comp:** Dynamic Compressor with gain reduction meter.

## 5. UI/UX Polish (Phase 4)
**Objective:** Make it look and feel like a native desktop app.

### 5.1 Visuals
- [ ] **Metering:** Real-time RMS/Peak meters for every channel.
- [ ] **Theme Engine:** Refine the CSS variables for a cohesive "Dark Mode" studio look.
- [ ] **Animations:** Smooth transitions for windows and faders.

### 5.2 Workflow
- [ ] **Browser:** Drag and drop samples from the side browser to the sampler.
- [ ] **Key Commands:** Standard shortcuts (Space to play, Ctrl+Z undo, Ctrl+C/V).
- [ ] **Undo/Redo History:** Implement a command stack.

## 6. Implementation Steps
1.  **Refactor AudioEngine & Track:** Split `Track.js` into `Track` (Data) and `MixerChannel` (Audio).
2.  **Implement Effect System:** Build `AudioPlugin` base class and one test effect (Delay).
3.  **Upgrade Mixer UI:** Reflect the new routing capabilities (Inserts area).
4.  **Enhance Piano Roll:** Add the tools and grid options.
5.  **Build the Effects Suite:** Implement the remaining effects.

## 7. Technical Stack
- **Audio:** Web Audio API (Tone.js could be considered, but currently vanilla for control).
- **UI:** Vanilla JS + CSS (Flexbox/Grid). Canvas for heavily animated elements (Meters, Piano Roll Grid).
- **Storage:** IndexedDB for large sample data, LocalStorage for settings.

