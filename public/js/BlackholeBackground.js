/**
 * RedGlitch Engine - Blackhole Cinematic Background
 * A high-performance WebGL/Three.js shader background
 */
class BlackholeBackground {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.options = {
            meshCanvasId: options.meshCanvasId || null,
            progressId: options.progressId || null,
            statusId: options.statusId || null,
            coordsId: options.coordsId || null,
            onComplete: options.onComplete || null,
            ...options
        };

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        this.uniforms = {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        };

        this.fragmentShader = `
            uniform float iTime;
            uniform vec2 iResolution;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }
            float noise(vec2 p) {
                vec2 i = floor(p); vec2 f = fract(p);
                f = f*f*(3.0-2.0*f);
                return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), f.x),
                           mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
            }
            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
                float d = length(uv);
                float shadow = smoothstep(0.08, 0.085, d);
                float photon = exp(-pow(d - 0.09, 2.0) * 5000.0) * 1.5;
                float angle = atan(uv.y, uv.x);
                float disk_h = exp(-pow(uv.y, 2.0) * 200.0) * smoothstep(0.1, 0.5, d) * exp(-d * 1.5);
                float lens_r = abs(d - 0.22);
                float disk_v = exp(-pow(lens_r, 2.0) * 1000.0) * 0.5;
                float turb = noise(vec2(angle * 5.0 - iTime * 1.5, d * 20.0));
                float final_disk = (disk_h + disk_v) * (0.7 + 0.3 * turb);
                float glow = exp(-d * 6.0) * 0.15;
                vec3 col = vec3(0.0);
                vec2 star_uv = uv * (1.0 + 0.03 / (d + 0.01));
                float stars = pow(noise(star_uv * 100.0), 40.0);
                col += vec3(stars) * 0.4 * shadow;
                vec3 gold = vec3(1.0, 0.7, 0.2);
                col += gold * final_disk * 1.8 + vec3(1.0) * photon + gold * glow;
                col *= shadow;
                col = pow(col, vec3(1.1));
                gl_FragColor = vec4(col, 1.0);
            }
        `;

        this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, fragmentShader: this.fragmentShader });
        this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

        this.meshParticles = [];
        if (this.options.meshCanvasId) {
            this.meshCanvas = document.getElementById(this.options.meshCanvasId);
            if (this.meshCanvas) {
                this.mctx = this.meshCanvas.getContext('2d');
                this._initMesh();
            }
        }

        this.progress = 0;
        this.running = true;
        this._animate();
        this._startProgress();
        this._setupResize();
    }

    _initMesh() {
        this.mw = this.meshCanvas.width = window.innerWidth;
        this.mh = this.meshCanvas.height = window.innerHeight;
        this.meshParticles = [];
        class P { 
            constructor(w, h){
                this.x=Math.random()*w;
                this.y=Math.random()*h;
                this.vx=(Math.random()-0.5)*0.4;
                this.vy=(Math.random()-0.5)*0.4;
            } 
            update(w, h){
                this.x+=this.vx;
                this.y+=this.vy;
                if(this.x<0||this.x>w)this.vx*=-1;
                if(this.y<0||this.y>h)this.vy*=-1;
            }
        }
        for(let i=0;i<50;i++) this.meshParticles.push(new P(this.mw, this.mh));
    }

    _drawMesh() {
        if (!this.mctx) return;
        this.mctx.clearRect(0,0,this.mw,this.mh); 
        this.mctx.strokeStyle='rgba(64,224,208,0.1)'; 
        this.mctx.lineWidth=0.5;
        for(let i=0;i<this.meshParticles.length;i++){
            this.meshParticles[i].update(this.mw, this.mh);
            for(let j=i+1;j<this.meshParticles.length;j++){
                let dx=this.meshParticles[i].x-this.meshParticles[j].x;
                let dy=this.meshParticles[i].y-this.meshParticles[j].y;
                let dist=Math.sqrt(dx*dx+dy*dy);
                if(dist<150){
                    this.mctx.beginPath();
                    this.mctx.moveTo(this.meshParticles[i].x,this.meshParticles[i].y);
                    this.mctx.lineTo(this.meshParticles[j].x,this.meshParticles[j].y);
                    this.mctx.stroke();
                }
            }
        }
    }

    _animate(time) {
        if (!this.running) return;
        requestAnimationFrame((t) => this._animate(t));
        this.uniforms.iTime.value = (time || 0) * 0.001;
        this.renderer.render(this.scene, this.camera);
        this._drawMesh();
    }

    _startProgress() {
        const pBar = document.getElementById(this.options.progressId);
        const pText = document.getElementById(this.options.statusId);
        const steps = ["STABILIZING SINGULARITY", "CALIBRATING PHOTON SPHERE", "IGNITING FORGE", "FORGE READY"];
        
        this.progressInterval = setInterval(() => {
            this.progress += Math.random() * 2.5;
            if (this.progress >= 100) {
                this.progress = 100;
                clearInterval(this.progressInterval);
                if (this.options.onComplete) this.options.onComplete();
            }
            if (pBar) pBar.style.width = this.progress + '%';
            if (pText) pText.innerText = steps[Math.floor((this.progress/101) * steps.length)];
            
            const coords = document.getElementById(this.options.coordsId);
            if(coords) {
                const lat = (45.9206 + (Math.random()-0.5)*0.001).toFixed(4);
                const lon = (63.3422 + (Math.random()-0.5)*0.001).toFixed(4);
                coords.innerHTML = `LAT: ${lat}° N<br>LON: ${lon}° E<br>ALT: ${(408.2 + (Math.random()-0.5)*0.5).toFixed(1)} KM`;
            }
        }, 80);
    }

    _setupResize() {
        this.resizeHandler = () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
            if (this.meshCanvas) {
                this.mw = this.meshCanvas.width = window.innerWidth;
                this.mh = this.meshCanvas.height = window.innerHeight;
            }
        };
        window.addEventListener('resize', this.resizeHandler);
    }

    destroy() {
        this.running = false;
        clearInterval(this.progressInterval);
        window.removeEventListener('resize', this.resizeHandler);
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
    }
}

window.BlackholeBackground = BlackholeBackground;