import React, { useEffect, useRef } from 'react';

interface BackgroundProps {
    enabled: boolean;
}

// Raw WebGL (no three.js: saves ~500 kB of JS parsed on every launcher open).
// The shader is expensive per-pixel, so we render at reduced resolution, cap the
// frame rate, and pause entirely while the tab is hidden.
const RENDER_SCALE = 0.5;      // 1/4 of the pixels; CSS upscales it (soft glow, no visible loss)
const FRAME_MS = 1000 / 30;    // 30 fps cap

const VERT = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
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

const STATIC_BG = 'radial-gradient(circle at 50% 40%, #1a1207 0%, #000 70%)';

function compile(gl: WebGLRenderingContext, type: number, src: string) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(log || 'shader compile failed');
    }
    return sh;
}

const Background: React.FC<BackgroundProps> = ({ enabled }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!enabled) {
            if (container) container.style.background = STATIC_BG;
            return;
        }
        if (!container) return;

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:100%;display:block;';
        const gl = (canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
            || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) {
            console.warn('[Dashboard] WebGL unavailable — using static backdrop.');
            container.style.background = STATIC_BG;
            return;
        }

        let program: WebGLProgram;
        try {
            program = gl.createProgram()!;
            gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link failed');
        } catch (err) {
            console.warn('[Dashboard] WebGL shader unavailable, using static background:', err);
            container.style.background = STATIC_BG;
            return;
        }

        gl.useProgram(program);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const uTime = gl.getUniformLocation(program, 'iTime');
        const uRes = gl.getUniformLocation(program, 'iResolution');

        container.appendChild(canvas);

        let frame = 0;
        let last = 0;

        const onContextLost = (e: Event) => {
            e.preventDefault();
            cancelAnimationFrame(frame);
            if (canvas.parentNode === container) container.removeChild(canvas);
            container.style.background = STATIC_BG;
        };
        canvas.addEventListener('webglcontextlost', onContextLost);

        const resize = () => {
            canvas.width = Math.max(1, Math.floor(window.innerWidth * RENDER_SCALE));
            canvas.height = Math.max(1, Math.floor(window.innerHeight * RENDER_SCALE));
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(uRes, canvas.width, canvas.height);
        };
        resize();
        window.addEventListener('resize', resize);

        const animate = (time: number) => {
            frame = requestAnimationFrame(animate);
            if (document.hidden || time - last < FRAME_MS) return;
            last = time;
            gl.uniform1f(uTime, time * 0.001);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        frame = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(frame);
            canvas.removeEventListener('webglcontextlost', onContextLost);
            window.removeEventListener('resize', resize);
            if (canvas.parentNode === container) container.removeChild(canvas);
            gl.deleteBuffer(buf);
            gl.deleteProgram(program);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        };
    }, [enabled]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1,
                background: '#000', overflow: 'hidden', pointerEvents: 'none'
            }}
        />
    );
};

export default Background;
