// shaderSystem.js - WebGL Post-Processing Shaders for Iso-Pixel Engine
// Provides bloom, glow, color grading, and vignette effects

class IsoShaderSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.enabled = false;
        this.gl = null;
        this.programs = {};
        this.framebuffers = {};
        this.textures = {};
        
        // Effect toggles
        this.effects = {
            bloom: { enabled: false, threshold: 0.7, intensity: 0.5, radius: 4 },
            glow: { enabled: false, intensity: 0.3, color: [1, 0.9, 0.7] },
            colorGrade: { enabled: false, contrast: 1.0, saturation: 1.0, brightness: 1.0, tint: [1, 1, 1] },
            vignette: { enabled: false, intensity: 0.3, softness: 0.5 },
            chromaticAberration: { enabled: false, intensity: 0.003 },
            filmGrain: { enabled: false, intensity: 0.05 }
        };
        
        // Source canvas (where Canvas 2D renders)
        this.sourceCanvas = null;
        this.sourceTexture = null;
        
        this._init();
    }

    _init() {
        // Try to get WebGL context
        const options = { 
            alpha: true, 
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
            antialias: false
        };
        
        this.gl = this.canvas.getContext('webgl2', options) || 
                  this.canvas.getContext('webgl', options) ||
                  this.canvas.getContext('experimental-webgl', options);
        
        if (!this.gl) {
            console.warn('[ShaderSystem] WebGL not supported, falling back to Canvas 2D');
            this.enabled = false;
            return;
        }

        console.log('[ShaderSystem] WebGL initialized');
        this.enabled = true;
        
        const gl = this.gl;
        
        // Create fullscreen quad
        this._createQuad();
        
        // Compile shaders
        this._compileShaders();
        
        // Create framebuffers for multi-pass rendering
        this._createFramebuffers();
    }

    _createQuad() {
        const gl = this.gl;
        
        // Fullscreen triangle (more efficient than quad)
        const vertices = new Float32Array([
            -1, -1,  0, 0,
             3, -1,  2, 0,
            -1,  3,  0, 2
        ]);
        
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _createProgram(vertexSrc, fragmentSrc) {
        const gl = this.gl;
        const vs = this._compileShader(gl.VERTEX_SHADER, vertexSrc);
        const fs = this._compileShader(gl.FRAGMENT_SHADER, fragmentSrc);
        
        if (!vs || !fs) return null;
        
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        
        // Clean up shaders
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        
        return program;
    }

    _compileShaders() {
        // === VERTEX SHADER (shared) ===
        const vertexShader = `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            
            void main() {
                vTexCoord = aTexCoord;
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        // === PASSTHROUGH SHADER ===
        const passthroughFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            
            void main() {
                gl_FragColor = texture2D(uTexture, vTexCoord);
            }
        `;
        this.programs.passthrough = this._createProgram(vertexShader, passthroughFrag);

        // === BRIGHTNESS THRESHOLD (for bloom) ===
        const thresholdFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uThreshold;
            
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord);
                float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                if (brightness > uThreshold) {
                    gl_FragColor = color;
                } else {
                    gl_FragColor = vec4(0.0);
                }
            }
        `;
        this.programs.threshold = this._createProgram(vertexShader, thresholdFrag);

        // === GAUSSIAN BLUR (separable) ===
        const blurFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform vec2 uDirection;
            uniform vec2 uResolution;
            
            void main() {
                vec2 texelSize = 1.0 / uResolution;
                vec4 result = vec4(0.0);
                
                // 9-tap Gaussian blur
                float weights[5];
                weights[0] = 0.227027;
                weights[1] = 0.1945946;
                weights[2] = 0.1216216;
                weights[3] = 0.054054;
                weights[4] = 0.016216;
                
                result += texture2D(uTexture, vTexCoord) * weights[0];
                
                for (int i = 1; i < 5; i++) {
                    vec2 offset = uDirection * texelSize * float(i);
                    result += texture2D(uTexture, vTexCoord + offset) * weights[i];
                    result += texture2D(uTexture, vTexCoord - offset) * weights[i];
                }
                
                gl_FragColor = result;
            }
        `;
        this.programs.blur = this._createProgram(vertexShader, blurFrag);

        // === BLOOM COMPOSITE ===
        const bloomCompositeFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform sampler2D uBloom;
            uniform float uIntensity;
            
            void main() {
                vec4 base = texture2D(uTexture, vTexCoord);
                vec4 bloom = texture2D(uBloom, vTexCoord);
                gl_FragColor = base + bloom * uIntensity;
            }
        `;
        this.programs.bloomComposite = this._createProgram(vertexShader, bloomCompositeFrag);

        // === COLOR GRADING ===
        const colorGradeFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uContrast;
            uniform float uSaturation;
            uniform float uBrightness;
            uniform vec3 uTint;
            
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord);
                
                // Brightness
                color.rgb *= uBrightness;
                
                // Contrast
                color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
                
                // Saturation
                float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                color.rgb = mix(vec3(luminance), color.rgb, uSaturation);
                
                // Tint
                color.rgb *= uTint;
                
                gl_FragColor = color;
            }
        `;
        this.programs.colorGrade = this._createProgram(vertexShader, colorGradeFrag);

        // === VIGNETTE ===
        const vignetteFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uIntensity;
            uniform float uSoftness;
            
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord);
                
                vec2 center = vTexCoord - 0.5;
                float dist = length(center);
                float vignette = smoothstep(0.5, 0.5 - uSoftness, dist);
                vignette = mix(1.0, vignette, uIntensity);
                
                color.rgb *= vignette;
                gl_FragColor = color;
            }
        `;
        this.programs.vignette = this._createProgram(vertexShader, vignetteFrag);

        // === CHROMATIC ABERRATION ===
        const chromaticFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uIntensity;
            
            void main() {
                vec2 center = vTexCoord - 0.5;
                vec2 offset = center * uIntensity;
                
                float r = texture2D(uTexture, vTexCoord + offset).r;
                float g = texture2D(uTexture, vTexCoord).g;
                float b = texture2D(uTexture, vTexCoord - offset).b;
                float a = texture2D(uTexture, vTexCoord).a;
                
                gl_FragColor = vec4(r, g, b, a);
            }
        `;
        this.programs.chromatic = this._createProgram(vertexShader, chromaticFrag);

        // === FILM GRAIN ===
        const grainFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uIntensity;
            uniform float uTime;
            
            float random(vec2 co) {
                return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord);
                float grain = random(vTexCoord + uTime) * 2.0 - 1.0;
                color.rgb += grain * uIntensity;
                gl_FragColor = color;
            }
        `;
        this.programs.grain = this._createProgram(vertexShader, grainFrag);

        // === GLOW (soft edge glow) ===
        const glowFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform sampler2D uBlurred;
            uniform float uIntensity;
            uniform vec3 uGlowColor;
            
            void main() {
                vec4 base = texture2D(uTexture, vTexCoord);
                vec4 blur = texture2D(uBlurred, vTexCoord);
                
                // Glow is the difference between blurred and original
                vec3 glow = max(blur.rgb - base.rgb, 0.0) * uGlowColor;
                
                gl_FragColor = vec4(base.rgb + glow * uIntensity, base.a);
            }
        `;
        this.programs.glow = this._createProgram(vertexShader, glowFrag);

        // === COMBINED POST-PROCESS (for efficiency) ===
        const combinedFrag = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform sampler2D uBloom;
            
            // Effect toggles
            uniform bool uBloomEnabled;
            uniform bool uColorGradeEnabled;
            uniform bool uVignetteEnabled;
            uniform bool uChromaticEnabled;
            uniform bool uGrainEnabled;
            
            // Parameters
            uniform float uBloomIntensity;
            uniform float uContrast;
            uniform float uSaturation;
            uniform float uBrightness;
            uniform vec3 uTint;
            uniform float uVignetteIntensity;
            uniform float uVignetteSoftness;
            uniform float uChromaticIntensity;
            uniform float uGrainIntensity;
            uniform float uTime;
            
            float random(vec2 co) {
                return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            void main() {
                vec2 uv = vTexCoord;
                vec4 color;
                
                // Chromatic aberration (sample with offset)
                if (uChromaticEnabled) {
                    vec2 center = uv - 0.5;
                    vec2 offset = center * uChromaticIntensity;
                    color.r = texture2D(uTexture, uv + offset).r;
                    color.g = texture2D(uTexture, uv).g;
                    color.b = texture2D(uTexture, uv - offset).b;
                    color.a = texture2D(uTexture, uv).a;
                } else {
                    color = texture2D(uTexture, uv);
                }
                
                // Bloom
                if (uBloomEnabled) {
                    vec4 bloom = texture2D(uBloom, uv);
                    color.rgb += bloom.rgb * uBloomIntensity;
                }
                
                // Color grading
                if (uColorGradeEnabled) {
                    color.rgb *= uBrightness;
                    color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
                    float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                    color.rgb = mix(vec3(luminance), color.rgb, uSaturation);
                    color.rgb *= uTint;
                }
                
                // Vignette
                if (uVignetteEnabled) {
                    vec2 center = uv - 0.5;
                    float dist = length(center);
                    float vignette = smoothstep(0.5, 0.5 - uVignetteSoftness, dist);
                    vignette = mix(1.0, vignette, uVignetteIntensity);
                    color.rgb *= vignette;
                }
                
                // Film grain
                if (uGrainEnabled) {
                    float grain = random(uv + uTime) * 2.0 - 1.0;
                    color.rgb += grain * uGrainIntensity;
                }
                
                gl_FragColor = clamp(color, 0.0, 1.0);
            }
        `;
        this.programs.combined = this._createProgram(vertexShader, combinedFrag);
    }

    _createFramebuffers() {
        const gl = this.gl;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Helper to create framebuffer with texture
        const createFBO = (w, h) => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            
            return { fbo, texture, width: w, height: h };
        };
        
        // Main scene (full resolution)
        this.framebuffers.scene = createFBO(width, height);
        
        // Bloom buffers (half resolution for performance)
        const bloomW = Math.floor(width / 2);
        const bloomH = Math.floor(height / 2);
        this.framebuffers.bloomThreshold = createFBO(bloomW, bloomH);
        this.framebuffers.bloomBlurH = createFBO(bloomW, bloomH);
        this.framebuffers.bloomBlurV = createFBO(bloomW, bloomH);
        
        // Glow buffer
        this.framebuffers.glowBlur = createFBO(bloomW, bloomH);
    }

    resize(width, height) {
        if (!this.enabled) return;
        
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
        
        // Recreate framebuffers at new size
        this._destroyFramebuffers();
        this._createFramebuffers();
    }

    _destroyFramebuffers() {
        const gl = this.gl;
        for (const key in this.framebuffers) {
            const fb = this.framebuffers[key];
            if (fb.fbo) gl.deleteFramebuffer(fb.fbo);
            if (fb.texture) gl.deleteTexture(fb.texture);
        }
        this.framebuffers = {};
    }

    // Upload Canvas 2D content to WebGL texture
    uploadCanvas(sourceCanvas) {
        if (!this.enabled) return;
        
        const gl = this.gl;
        
        // Create source texture if needed
        if (!this.sourceTexture) {
            this.sourceTexture = gl.createTexture();
        }
        
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        this.sourceCanvas = sourceCanvas;
    }

    // Render fullscreen quad with given program
    _renderQuad(program, uniforms = {}) {
        const gl = this.gl;
        
        gl.useProgram(program);
        
        // Bind quad geometry
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        
        const posLoc = gl.getAttribLocation(program, 'aPosition');
        const texLoc = gl.getAttribLocation(program, 'aTexCoord');
        
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        
        if (texLoc >= 0) {
            gl.enableVertexAttribArray(texLoc);
            gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
        }
        
        // Set uniforms
        for (const [name, value] of Object.entries(uniforms)) {
            const loc = gl.getUniformLocation(program, name);
            if (loc === null) continue;
            
            if (typeof value === 'number') {
                gl.uniform1f(loc, value);
            } else if (typeof value === 'boolean') {
                gl.uniform1i(loc, value ? 1 : 0);
            } else if (Array.isArray(value)) {
                if (value.length === 2) gl.uniform2fv(loc, value);
                else if (value.length === 3) gl.uniform3fv(loc, value);
                else if (value.length === 4) gl.uniform4fv(loc, value);
            }
        }
        
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Bind texture to texture unit
    _bindTexture(texture, unit = 0, uniformName = 'uTexture', program = null) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (program) {
            const loc = gl.getUniformLocation(program, uniformName);
            gl.uniform1i(loc, unit);
        }
    }

    // Main render function - applies all enabled effects
    render() {
        if (!this.enabled || !this.sourceTexture) return;
        
        const gl = this.gl;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Check if any effects are enabled
        const anyEnabled = this.effects.bloom.enabled || 
                          this.effects.colorGrade.enabled ||
                          this.effects.vignette.enabled ||
                          this.effects.chromaticAberration.enabled ||
                          this.effects.filmGrain.enabled;
        
        if (!anyEnabled) {
            // Just passthrough
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, width, height);
            gl.useProgram(this.programs.passthrough);
            this._bindTexture(this.sourceTexture, 0, 'uTexture', this.programs.passthrough);
            this._renderQuad(this.programs.passthrough);
            return;
        }
        
        let currentTexture = this.sourceTexture;
        
        // === BLOOM PASS ===
        if (this.effects.bloom.enabled) {
            const bloom = this.effects.bloom;
            const bloomW = this.framebuffers.bloomThreshold.width;
            const bloomH = this.framebuffers.bloomThreshold.height;
            
            // 1. Threshold pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.bloomThreshold.fbo);
            gl.viewport(0, 0, bloomW, bloomH);
            gl.useProgram(this.programs.threshold);
            this._bindTexture(currentTexture, 0, 'uTexture', this.programs.threshold);
            this._renderQuad(this.programs.threshold, { uThreshold: bloom.threshold });
            
            // 2. Horizontal blur
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.bloomBlurH.fbo);
            gl.useProgram(this.programs.blur);
            this._bindTexture(this.framebuffers.bloomThreshold.texture, 0, 'uTexture', this.programs.blur);
            this._renderQuad(this.programs.blur, {
                uDirection: [bloom.radius, 0],
                uResolution: [bloomW, bloomH]
            });
            
            // 3. Vertical blur
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.bloomBlurV.fbo);
            this._bindTexture(this.framebuffers.bloomBlurH.texture, 0, 'uTexture', this.programs.blur);
            this._renderQuad(this.programs.blur, {
                uDirection: [0, bloom.radius],
                uResolution: [bloomW, bloomH]
            });
        }
        
        // === FINAL COMPOSITE PASS (combined shader) ===
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        
        const program = this.programs.combined;
        gl.useProgram(program);
        
        // Bind textures
        this._bindTexture(currentTexture, 0, 'uTexture', program);
        if (this.effects.bloom.enabled) {
            this._bindTexture(this.framebuffers.bloomBlurV.texture, 1, 'uBloom', program);
        }
        
        // Set all uniforms
        const cg = this.effects.colorGrade;
        const vig = this.effects.vignette;
        const chrom = this.effects.chromaticAberration;
        const grain = this.effects.filmGrain;
        
        this._renderQuad(program, {
            uBloomEnabled: this.effects.bloom.enabled,
            uBloomIntensity: this.effects.bloom.intensity,
            uColorGradeEnabled: cg.enabled,
            uContrast: cg.contrast,
            uSaturation: cg.saturation,
            uBrightness: cg.brightness,
            uTint: cg.tint,
            uVignetteEnabled: vig.enabled,
            uVignetteIntensity: vig.intensity,
            uVignetteSoftness: vig.softness,
            uChromaticEnabled: chrom.enabled,
            uChromaticIntensity: chrom.intensity,
            uGrainEnabled: grain.enabled,
            uGrainIntensity: grain.intensity,
            uTime: performance.now() * 0.001
        });
    }

    // === PUBLIC API ===

    /**
     * Enable/disable the shader system
     */
    setEnabled(enabled) {
        this.enabled = enabled && this.gl !== null;
    }

    /**
     * Check if WebGL is available
     */
    isAvailable() {
        return this.gl !== null;
    }

    /**
     * Enable bloom effect
     */
    setBloom(enabled, options = {}) {
        this.effects.bloom.enabled = enabled;
        if (options.threshold !== undefined) this.effects.bloom.threshold = options.threshold;
        if (options.intensity !== undefined) this.effects.bloom.intensity = options.intensity;
        if (options.radius !== undefined) this.effects.bloom.radius = options.radius;
    }

    /**
     * Enable color grading
     */
    setColorGrade(enabled, options = {}) {
        this.effects.colorGrade.enabled = enabled;
        if (options.contrast !== undefined) this.effects.colorGrade.contrast = options.contrast;
        if (options.saturation !== undefined) this.effects.colorGrade.saturation = options.saturation;
        if (options.brightness !== undefined) this.effects.colorGrade.brightness = options.brightness;
        if (options.tint !== undefined) this.effects.colorGrade.tint = options.tint;
    }

    /**
     * Enable vignette
     */
    setVignette(enabled, options = {}) {
        this.effects.vignette.enabled = enabled;
        if (options.intensity !== undefined) this.effects.vignette.intensity = options.intensity;
        if (options.softness !== undefined) this.effects.vignette.softness = options.softness;
    }

    /**
     * Enable chromatic aberration
     */
    setChromaticAberration(enabled, intensity = 0.003) {
        this.effects.chromaticAberration.enabled = enabled;
        this.effects.chromaticAberration.intensity = intensity;
    }

    /**
     * Enable film grain
     */
    setFilmGrain(enabled, intensity = 0.05) {
        this.effects.filmGrain.enabled = enabled;
        this.effects.filmGrain.intensity = intensity;
    }

    /**
     * Apply a preset combination of effects
     */
    applyPreset(preset) {
        switch (preset) {
            case 'none':
                this.effects.bloom.enabled = false;
                this.effects.colorGrade.enabled = false;
                this.effects.vignette.enabled = false;
                this.effects.chromaticAberration.enabled = false;
                this.effects.filmGrain.enabled = false;
                break;
                
            case 'cinematic':
                this.setBloom(true, { threshold: 0.8, intensity: 0.4, radius: 3 });
                this.setColorGrade(true, { contrast: 1.1, saturation: 0.9, brightness: 1.0 });
                this.setVignette(true, { intensity: 0.4, softness: 0.5 });
                this.setFilmGrain(true, 0.03);
                this.setChromaticAberration(false);
                break;
                
            case 'retro':
                this.setBloom(false);
                this.setColorGrade(true, { contrast: 1.2, saturation: 0.7, brightness: 0.95 });
                this.setVignette(true, { intensity: 0.5, softness: 0.4 });
                this.setFilmGrain(true, 0.08);
                this.setChromaticAberration(true, 0.004);
                break;
                
            case 'vibrant':
                this.setBloom(true, { threshold: 0.6, intensity: 0.6, radius: 5 });
                this.setColorGrade(true, { contrast: 1.05, saturation: 1.3, brightness: 1.05 });
                this.setVignette(true, { intensity: 0.2, softness: 0.6 });
                this.setFilmGrain(false);
                this.setChromaticAberration(false);
                break;
                
            case 'dark':
                this.setBloom(true, { threshold: 0.9, intensity: 0.3, radius: 2 });
                this.setColorGrade(true, { contrast: 1.2, saturation: 0.8, brightness: 0.85 });
                this.setVignette(true, { intensity: 0.6, softness: 0.4 });
                this.setFilmGrain(true, 0.04);
                this.setChromaticAberration(false);
                break;
                
            case 'dreamy':
                this.setBloom(true, { threshold: 0.5, intensity: 0.7, radius: 6 });
                this.setColorGrade(true, { contrast: 0.95, saturation: 1.1, brightness: 1.1, tint: [1.05, 1.0, 1.1] });
                this.setVignette(true, { intensity: 0.3, softness: 0.7 });
                this.setFilmGrain(false);
                this.setChromaticAberration(true, 0.002);
                break;
        }
    }

    /**
     * Get all current effect settings
     */
    getSettings() {
        return JSON.parse(JSON.stringify(this.effects));
    }
    
    /**
     * Check if WebGL shaders are supported and initialized
     */
    isSupported() {
        return this.enabled && this.gl !== null;
    }

    /**
     * Restore settings from object
     */
    setSettings(settings) {
        if (settings) {
            Object.assign(this.effects, settings);
        }
    }

    /**
     * Clean up WebGL resources
     */
    destroy() {
        if (!this.gl) return;
        
        const gl = this.gl;
        
        // Delete programs
        for (const key in this.programs) {
            if (this.programs[key]) gl.deleteProgram(this.programs[key]);
        }
        
        // Delete framebuffers and textures
        this._destroyFramebuffers();
        
        // Delete source texture
        if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
        
        // Delete quad buffer
        if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
        
        this.gl = null;
        this.enabled = false;
    }
}

// Export for use
window.IsoShaderSystem = IsoShaderSystem;
