import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface BackgroundProps {
    enabled: boolean;
}

const Background: React.FC<BackgroundProps> = ({ enabled }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

    useEffect(() => {
        if (!enabled || !containerRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const uniforms = {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        };

        const fragmentShader = `
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

        const material = new THREE.ShaderMaterial({ uniforms, fragmentShader });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        let frame: number;
        const animate = (time: number) => {
            uniforms.iTime.value = time * 0.001;
            renderer.render(scene, camera);
            frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);

        const handleResize = () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', handleResize);
            if (rendererRef.current && containerRef.current) {
                containerRef.current.removeChild(rendererRef.current.domElement);
                rendererRef.current.dispose();
            }
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
