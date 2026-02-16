// postProcess.js - WebGL Post-Processing System

window.PostProcessSystem = class PostProcessSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        
        if (!this.gl) {
            console.error("WebGL not supported, post-processing disabled.");
            return;
        }

        this.shaders = {};
        this.activeShader = 'default';
        this.startTime = Date.now();
        
        this.init();
    }

    async init() {
        const gl = this.gl;

        // 1. Setup Quad
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 0,0, 1,1, 1,0]), gl.STATIC_DRAW);

        // 2. Setup Persistent Texture
        this.mainTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.mainTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // 3. Load Default Shader
        this.defaultFrag = `precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            uniform float uTime;
            void main() {
                gl_FragColor = texture2D(uTexture, vTexCoord);
            }`;
        
        this.vertexShaderSrc = `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = vec4(aPosition, 0, 1);
                vTexCoord = aTexCoord;
            }`;

        this.loadShader('default', this.defaultFrag);

        // 3. Load Project Shaders
        try {
            const list = await fetch('/api/shaders/list').then(r => r.json());
            for (const name of list) {
                const res = await fetch(`/api/shaders/${name}`);
                if (res.ok) {
                    const data = await res.json();
                    this.loadShader(name, data.content);
                }
            }
        } catch(e) {}
    }

    loadShader(name, fragSrc) {
        const gl = this.gl;
        const program = gl.createProgram();
        
        const vs = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSrc);
        const fs = this.createShader(gl.FRAGMENT_SHADER, fragSrc);
        
        if (!vs || !fs) return;

        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(`Shader Link Error (${name}):`, gl.getProgramInfoLog(program));
            return;
        }

        this.shaders[name] = program;
        console.log(`Shader loaded: ${name}`);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader Compile Error:", gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    setShader(name) {
        if (this.shaders[name]) this.activeShader = name;
        else console.warn(`Shader ${name} not found.`);
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    render(sourceCanvas) {
        const gl = this.gl;
        const program = this.shaders[this.activeShader] || this.shaders['default'];
        
        if (!program) return;

        gl.useProgram(program);

        // Attributes
        const posLoc = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const texLoc = gl.getAttribLocation(program, "aTexCoord");
        gl.enableVertexAttribArray(texLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

        // Uniforms
        const timeLoc = gl.getUniformLocation(program, "uTime");
        gl.uniform1f(timeLoc, (Date.now() - this.startTime) / 1000);

        // Update existing texture data
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.mainTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        
        const texUni = gl.getUniformLocation(program, "uTexture");
        gl.uniform1i(texUni, 0);

        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
};