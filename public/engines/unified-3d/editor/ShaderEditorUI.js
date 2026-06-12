/**
 * ShaderEditorUI.js
 * Manages the Monaco Editor instance for the Shader Registry.
 */

import { ShaderRegistry } from '/engines/shared/ShaderRegistry.js';

export class ShaderEditorUI {
    constructor(editor3dCore) {
        this.core = editor3dCore;
        this.modal = document.getElementById('shader-editor-modal');
        this.container = document.getElementById('shader-monaco-container');
        this.title = document.getElementById('shader-editor-title');
        this.uniformsPanel = document.getElementById('shader-uniforms-panel');
        this.outputPanel = document.getElementById('shader-output-panel');
        this.btnCompile = document.getElementById('shader-btn-compile');
        this.btnClose = document.getElementById('shader-btn-close');

        this.monacoEditor = null;
        this.activeShaderId = null;
        this.activeMaterialId = null;

        this._initEvents();
        this._initDrag();
    }

    _initEvents() {
        this.btnClose.addEventListener('click', () => this.close());
        this.btnCompile.addEventListener('click', () => this.compile());
    }

    _initDrag() {
        const header = document.getElementById('shader-editor-header');
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
            isDragging = true;
            offsetX = e.clientX - this.modal.getBoundingClientRect().left;
            offsetY = e.clientY - this.modal.getBoundingClientRect().top;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.modal.style.left = `${e.clientX - offsetX}px`;
            this.modal.style.top = `${e.clientY - offsetY}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    async open(shaderId, materialId) {
        this.activeShaderId = shaderId;
        this.activeMaterialId = materialId;

        const def = ShaderRegistry.shaders[shaderId];
        if (!def) {
            this.logError(`Shader '${shaderId}' not found in registry.`);
            return;
        }

        this.title.textContent = def.name || shaderId;
        this.modal.style.display = 'flex';

        // Load Monaco if not already loaded
        if (!this.monacoEditor) {
            await this._initMonaco();
        }

        const source = def.fragmentInject || def.fragmentShader || '// No source available';
        this.monacoEditor.setValue(source);
        
        this.renderUniforms(def);
        this.logSuccess('Ready.');
    }

    close() {
        this.modal.style.display = 'none';
    }

    _initMonaco() {
        return new Promise((resolve) => {
            if (!window.require) {
                console.error('[ShaderEditor] Monaco loader not found!');
                return resolve();
            }

            require.config({ paths: { 'vs': 'lib/monaco/vs' } });
            require(['vs/editor/editor.main'], () => {
                this.monacoEditor = monaco.editor.create(this.container, {
                    value: '',
                    language: 'glsl',
                    theme: 'vs-dark',
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    automaticLayout: true,
                    scrollBeyondLastLine: false
                });

                // Add standard GLSL highlighting (Monaco does not have glsl built-in by default,
                // but we map it to C++ or just use a basic theme if it doesn't).
                // Actually, recent Monaco often has 'cpp' which works well enough for GLSL if 'glsl' is missing.
                monaco.editor.setModelLanguage(this.monacoEditor.getModel(), 'cpp');

                resolve();
            });
        });
    }

    renderUniforms(def) {
        if (!def.uniforms) {
            this.uniformsPanel.innerHTML = '<div style="color:#666; font-style:italic;">No uniforms exposed.</div>';
            return;
        }

        let matDef = null;
        if (this.activeMaterialId && this.core && this.core._levelData.materials) {
            matDef = this.core._levelData.materials.find(m => m.id === this.activeMaterialId);
        }

        let html = '';
        for (const [key, uniform] of Object.entries(def.uniforms)) {
            // Skip internal globals
            if (key === 'time' || key === 'uTime') continue;

            let val = uniform.value;
            // Override with material-specific variant value if available
            if (matDef && matDef.shader_uniforms && matDef.shader_uniforms[key] !== undefined) {
                const ov = matDef.shader_uniforms[key];
                if (val && val.isColor && typeof ov === 'string') {
                    // Render color inputs as hex, even if original is a THREE.Color
                    val = new THREE.Color(ov);
                } else if (val && typeof val === 'object' && val.isVector2) {
                    val = { x: ov.x ?? val.x, y: ov.y ?? val.y };
                } else {
                    val = ov;
                }
            }

            let inputHtml = '';
            
            if (typeof val === 'number') {
                inputHtml = `<input type="number" step="0.1" class="shader-uni-input" data-key="${key}" value="${val}" style="width:60px; background:#111; color:#fff; border:1px solid #333;">`;
            } else if (val && val.isColor) {
                const hex = '#' + val.getHexString();
                inputHtml = `<input type="color" class="shader-uni-input" data-key="${key}" value="${hex}" style="width:24px; height:24px; padding:0; border:none;">`;
            } else if (val && (val.isVector2 || typeof val.x === 'number')) {
                inputHtml = `<input type="number" step="0.1" class="shader-uni-input" data-key="${key}_x" value="${val.x}" style="width:40px; background:#111; color:#fff; border:1px solid #333;">
                             <input type="number" step="0.1" class="shader-uni-input" data-key="${key}_y" value="${val.y}" style="width:40px; background:#111; color:#fff; border:1px solid #333;">`;
            } else {
                inputHtml = `<span style="color:#555;">[Object]</span>`;
            }

            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11px;">
                    <span style="color:#aaa;">${key}</span>
                    <div style="display:flex; gap:4px;">${inputHtml}</div>
                </div>
            `;
        }
        this.uniformsPanel.innerHTML = html;

        this.uniformsPanel.querySelectorAll('.shader-uni-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const key = e.target.dataset.key;
                const def = ShaderRegistry.shaders[this.activeShaderId];
                if (!def) return;
                
                let targetDef = null;
                if (this.activeMaterialId && this.core) {
                    targetDef = this.core._levelData.materials.find(m => m.id === this.activeMaterialId);
                    if (targetDef && !targetDef.shader_uniforms) targetDef.shader_uniforms = {};
                }

                const applyToLiveMaterial = (baseKey, valObj, axis, rawVal) => {
                    if (this.core && this.core.scene) {
                        this.core.scene.traverse(child => {
                            if (child.isMesh && child.material && child.material.userData.materialId === this.activeMaterialId) {
                                const uniforms = child.material.userData.shader_uniforms;
                                if (uniforms && uniforms[baseKey] && uniforms[baseKey].value) {
                                    if (axis) {
                                        uniforms[baseKey].value[axis] = rawVal;
                                    } else if (uniforms[baseKey].value.isColor) {
                                        uniforms[baseKey].value.set(rawVal);
                                    } else {
                                        uniforms[baseKey].value = rawVal;
                                    }
                                }
                            }
                        });
                    }
                };

                if (key.endsWith('_x') || key.endsWith('_y')) {
                    const baseKey = key.slice(0, -2);
                    const axis = key.slice(-1);
                    const parsed = parseFloat(e.target.value);
                    if (targetDef) {
                        if (!targetDef.shader_uniforms[baseKey]) targetDef.shader_uniforms[baseKey] = {};
                        targetDef.shader_uniforms[baseKey][axis] = parsed;
                    } else {
                        def.uniforms[baseKey].value[axis] = parsed;
                    }
                    applyToLiveMaterial(baseKey, null, axis, parsed);
                } else if (e.target.type === 'color') {
                    if (targetDef) {
                        targetDef.shader_uniforms[key] = e.target.value;
                    } else {
                        def.uniforms[key].value.set(e.target.value);
                    }
                    applyToLiveMaterial(key, null, null, e.target.value);
                } else if (e.target.type === 'number') {
                    const parsed = parseFloat(e.target.value);
                    if (targetDef) {
                        targetDef.shader_uniforms[key] = parsed;
                    } else {
                        def.uniforms[key].value = parsed;
                    }
                    applyToLiveMaterial(key, null, null, parsed);
                }
                
                // If editing a template globally (no material active), rebuild scene
                if (!targetDef) {
                    this.core._markDirty();
                    this.core._rebuildScene(this.core._levelData);
                }
            });
        });
    }

    compile() {
        if (!this.monacoEditor) return;
        const code = this.monacoEditor.getValue();
        
        const def = ShaderRegistry.shaders[this.activeShaderId];
        if (!def) return;

        // Backup old inject
        const oldInject = def.fragmentInject;
        const oldShader = def.fragmentShader;

        // Update definition
        if (def.fragmentInject !== undefined) {
            def.fragmentInject = code;
        } else if (def.fragmentShader !== undefined) {
            def.fragmentShader = code;
        }

        this.logSuccess('Compiling shader...');

        // 1. Run Static Analysis before handing to WebGL
        const staticErrors = ShaderRegistry.validateShader(def, window.THREE);
        if (staticErrors.length > 0) {
            staticErrors.forEach(err => this.logError(`[Static Analysis] ${err}`));
            this.logError('Proceeding to compiler despite warnings...');
        }
        
        // Intercept console.error to catch Three.js WebGL errors
        let hasError = false;
        let errorMessage = '';
        const originalError = console.error;
        const originalWarn = console.warn;

        const errorCatcher = (...args) => {
            if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('THREE.WebGLProgram')) {
                hasError = true;
                errorMessage += args.join(' ') + '\n';
            } else if (args.length > 0 && typeof args[0] === 'string' && args[0].match(/^[0-9]+:/)) {
                // Often Three.js logs the shader source with line numbers using console.error or warn
                errorMessage += args.join(' ') + '\n';
            }
            originalError.apply(console, args);
        };

        console.error = errorCatcher;
        // console.warn = errorCatcher; // Usually error is enough

        try {
            // Unset broken flag to allow compilation attempt
            def.isBroken = false;
            
            // Rebuild scene
            this.core._rebuildScene(this.core._levelData);
            
            // Force synchronous compilation
            if (this.core.renderer) {
                this.core.renderer.compile(this.core.scene, this.core.camera);
            }

            if (hasError) {
                throw new Error(errorMessage || 'Unknown WebGL Error');
            }

            this.logSuccess('Shader compiled and applied successfully.');
        } catch(e) {
            this.logError('Compilation failed:\n' + e.message);
            
            // Mark as broken and force a fallback rebuild
            def.isBroken = true;
            def.lastError = e.message;
            this.core._rebuildScene(this.core._levelData);
        } finally {
            console.error = originalError;
            console.warn = originalWarn;
        }
    }

    logError(msg) {
        this.outputPanel.innerHTML = `<span style="color:var(--kas-red);">${msg}</span>`;
    }

    logSuccess(msg) {
        this.outputPanel.innerHTML = `<span style="color:#2ecc71;">${msg}</span>`;
    }
}
