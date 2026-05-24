import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useStudio } from '../hooks/useStudio';
import { 
    Zap, Play, Save, Plus, Trash2, Box, Eye, Code, 
    Settings, Sliders, RefreshCw, AlertCircle, CheckCircle2
} from 'lucide-react';
import Sidebar from './shared/Sidebar';

interface Shader {
    id: string;
    name: string;
    code: string;
    uniforms: any;
}

const ShaderEditor: React.FC = () => {
    const { isReady } = useStudio();
    const [shaders, setShaders] = useState<Shader[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorLog] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);

    const templates: Record<string, string> = {
        default: `precision mediump float;\nvarying vec2 vTexCoord;\nuniform sampler2D uTexture;\nuniform float uTime;\n\nvoid main() {\n    gl_FragColor = texture2D(uTexture, vTexCoord);\n}`,
        crt: `precision mediump float;\nvarying vec2 vTexCoord;\nuniform sampler2D uTexture;\nuniform float uTime;\nuniform float uScanlineIntensity; // [0, 1]\n\nvoid main() {\n    vec2 uv = vTexCoord;\n    vec4 color = texture2D(uTexture, uv);\n    float scanline = sin(uv.y * 800.0 + uTime * 10.0) * (uScanlineIntensity * 0.2);\n    gl_FragColor = vec4(color.rgb - scanline, 1.0);\n}`
    };

    useEffect(() => {
        if (isReady) {
            loadShaders();
            initGL();
        }
    }, [isReady]);

    useEffect(() => {
        if (shaders[currentIndex]) {
            compileShader(shaders[currentIndex].code);
        }
    }, [shaders, currentIndex]);

    const initGL = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl');
        if (!gl) return;
        glRef.current = gl;

        // Simple Full-screen Quad
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
        const texBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        const renderLoop = (time: number) => {
            if (gl && programRef.current) {
                gl.useProgram(programRef.current);
                const timeLoc = gl.getUniformLocation(programRef.current, 'uTime');
                if (timeLoc) gl.uniform1f(timeLoc, time * 0.001);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            requestAnimationFrame(renderLoop);
        };
        requestAnimationFrame(renderLoop);
    };

    const loadShaders = async () => {
        try {
            const res = await fetch('/api/shaders/list');
            if (res.ok) {
                const names = await res.json();
                if (names.length > 0) {
                    const loaded = await Promise.all(names.map(async (n: string) => {
                        const r = await fetch(`/api/data/shaders/${n}.json`);
                        return r.ok ? await r.json() : null;
                    }));
                    setShaders(loaded.filter(l => l !== null));
                } else {
                    setShaders([getDefaultShader()]);
                }
            }
        } catch (e) {
            setShaders([getDefaultShader()]);
        }
    };

    const saveToServer = async () => {
        const shader = shaders[currentIndex];
        if (!shader) return;
        setIsSaving(true);
        try {
            await fetch('/api/assets/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: `data/shaders/${shader.name}.json`,
                    content: JSON.stringify(shader, null, 2)
                })
            });
            alert("SHADER SAVED");
        } catch (e) {
            alert("SAVE ERROR");
        } finally {
            setIsSaving(false);
        }
    };

    const getDefaultShader = (): Shader => ({
        id: 'shader_' + Date.now(),
        name: 'new_shader',
        code: templates.default,
        uniforms: {}
    });

    const compileShader = (fragmentSource: string) => {
        const gl = glRef.current;
        if (!gl) return;
        setCompileStatus('compiling');

        const vertexSource = `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = vec4(aPosition, 0, 1);
                vTexCoord = aTexCoord;
            }
        `;

        try {
            const vs = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vs, vertexSource);
            gl.compileShader(vs);
            
            const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fs, fragmentSource);
            gl.compileShader(fs);
            
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(fs) || 'Fragment shader error');
            }

            const prog = gl.createProgram()!;
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(prog) || 'Link error');
            }

            // Setup attributes
            const aPos = gl.getAttribLocation(prog, 'aPosition');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            programRef.current = prog;
            setCompileStatus('success');
            setErrorLog('');
        } catch (e: any) {
            setCompileStatus('error');
            setErrorLog(e.message);
        }
    };

    const currentShader = shaders[currentIndex] || getDefaultShader();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Eye size={16} style={{ marginRight: '8px', display: 'inline' }} /> SHADER LAB v2.0
                </div>
            </div>

            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={() => compileShader(currentShader.code)} title="Compile"><Play size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={saveToServer} disabled={isSaving} title="Save"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => setShaders([...shaders, getDefaultShader()])}><Plus size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '10px' }}>
                    {compileStatus === 'success' && <div style={{ color: '#2ecc71', fontSize: '0.8rem' }}><CheckCircle2 size={14} style={{ display: 'inline', marginRight: '5px' }} /> READY</div>}
                    {compileStatus === 'error' && <div style={{ color: '#e74c3c', fontSize: '0.8rem' }}><AlertCircle size={14} style={{ display: 'inline', marginRight: '5px' }} /> SYNTAX ERROR</div>}
                    {compileStatus === 'compiling' && <div style={{ color: 'var(--accent)', fontSize: '0.8rem' }}><RefreshCw size={14} className="spin" style={{ display: 'inline', marginRight: '5px' }} /> COMPILING...</div>}
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="SHADERS" 
                    items={shaders} 
                    currentIndex={currentIndex} 
                    onSelect={setCurrentIndex}
                    renderItem={(s, active) => (
                        <div style={{ color: active ? 'var(--accent)' : '#888' }}>{s.name}</div>
                    )}
                />

                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flexGrow: 1, position: 'relative' }}>
                        <Editor
                            height="100%"
                            language="cpp"
                            theme="vs-dark"
                            value={currentShader.code}
                            onChange={(val) => {
                                const next = [...shaders];
                                next[currentIndex].code = val || '';
                                setShaders(next);
                            }}
                            options={{
                                fontSize: 14,
                                minimap: { enabled: false },
                                padding: { top: 20 }
                            }}
                        />
                    </div>
                    {compileStatus === 'error' && (
                        <div style={{ height: '100px', background: '#1a0505', borderTop: '2px solid #e74c3c', color: '#ffaaaa', padding: '10px', fontSize: '0.85rem', overflowY: 'auto', fontFamily: 'monospace' }}>
                            {errorMsg}
                        </div>
                    )}
                </div>

                <div className="panel" style={{ width: '400px', borderLeft: '1px solid #333' }}>
                    <div className="panel-header"><Box size={14} /> LIVE PREVIEW</div>
                    <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', background: '#000' }}>
                        <canvas ref={canvasRef} width={300} height={300} style={{ border: '1px solid #222', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
                    </div>
                    <div className="panel-header" style={{ borderTop: '1px solid #333' }}><Sliders size={14} /> UNIFORMS</div>
                    <div className="panel-content">
                        <div style={{ color: '#666', fontSize: '0.8rem', fontStyle: 'italic' }}>Auto-detected uniforms will appear here...</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShaderEditor;
