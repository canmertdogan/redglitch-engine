/**
 * ShaderRegistry.js
 * Centralized registry for custom GLSL shaders that hook into Three.js materials.
 */

export class ShaderRegistry {
    static shaders = {};
    static activeMaterials = new Set();
    static globalUniforms = {
        time: { value: 0 }
    };

    static registerShader(id, definition) {
        this.shaders[id] = definition;
    }

    static getAvailableShaders() {
        return Object.keys(this.shaders).map(id => ({
            id,
            name: this.shaders[id].name
        }));
    }

    /**
     * Applies a custom shader to a THREE.Material.
     * Uses onBeforeCompile to inject custom GLSL while retaining standard lighting.
     */
    static applyShader(material, shaderId, overrides = {}) {
        if (!shaderId || shaderId === 'standard') return material;

        const def = this.shaders[shaderId];
        if (!def) {
            console.warn(`[ShaderRegistry] Shader '${shaderId}' not found, falling back to standard.`);
            return material;
        }

        // Apply material overrides (transparency, blending)
        if (def.transparent !== undefined) material.transparent = def.transparent;
        if (def.blending !== undefined) material.blending = def.blending;
        if (def.depthWrite !== undefined) material.depthWrite = def.depthWrite;
        if (def.side !== undefined) material.side = def.side;

        material.onBeforeCompile = (shader) => {
            // Merge custom uniforms
            shader.uniforms.uTime = this.globalUniforms.time;
            
            if (def.uniforms) {
                for (const [key, uniform] of Object.entries(def.uniforms)) {
                    // Clone uniform to prevent bleeding across materials sharing the same shader template
                    let clonedValue;
                    if (uniform.value && typeof uniform.value.clone === 'function') {
                        clonedValue = uniform.value.clone();
                    } else if (Array.isArray(uniform.value)) {
                        clonedValue = [...uniform.value];
                    } else {
                        clonedValue = uniform.value;
                    }

                    shader.uniforms[key] = { value: clonedValue };

                    // Apply any material-specific overrides from the UI
                    if (overrides[key] !== undefined) {
                        if (shader.uniforms[key].value && shader.uniforms[key].value.isColor) {
                            shader.uniforms[key].value.set(overrides[key]);
                        } else if (shader.uniforms[key].value && typeof shader.uniforms[key].value === 'object') {
                            Object.assign(shader.uniforms[key].value, overrides[key]);
                        } else {
                            shader.uniforms[key].value = overrides[key];
                        }
                    }
                }
            }

            // Inject Uniforms
            let uniformInject = `uniform float uTime;\n`;
            if (def.uniforms) {
                for (const key of Object.keys(def.uniforms)) {
                    // Very simple uniform type inference (assuming color = vec3, number = float)
                    const val = def.uniforms[key].value;
                    if (typeof val === 'number') uniformInject += `uniform float ${key};\n`;
                    else if (val && val.isColor) uniformInject += `uniform vec3 ${key};\n`;
                    else if (val && val.isVector2) uniformInject += `uniform vec2 ${key};\n`;
                }
            }

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>\n${uniformInject}`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>\n${uniformInject}`
            );

            // Inject Fragment logic
            if (def.isBroken) {
                // Fallback magenta shader to indicate error visually without crashing WebGL
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <dithering_fragment>',
                    `#include <dithering_fragment>\n gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);`
                );
            } else {
                if (def.fragmentInject) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <dithering_fragment>',
                        `#include <dithering_fragment>\n${def.fragmentInject}`
                    );
                }
                if (def.vertexInject) {
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <project_vertex>',
                        `#include <project_vertex>\n${def.vertexInject}`
                    );
                }
            }

            material.userData.shader = shader;
            material.userData.shader_uniforms = shader.uniforms;
        };

        this.activeMaterials.add(material);

        // Map material channels to uniforms if required
        if (def.mapChannels) {
            // We'll call this later from outside if needed, or we just pass the material directly
            // For now, we attach it so the caller can trigger it
            material.userData.mapChannels = def.mapChannels;
        }

        return material;
    }

    static update(now) {
        this.globalUniforms.time.value = now / 1000.0;
        
        // Cleanup disposed materials and update mapChannels
        for (const mat of this.activeMaterials) {
            if (mat._isDisposed || !mat.uuid) {
                this.activeMaterials.delete(mat);
            } else if (mat.userData.mapChannels && mat.userData.shader) {
                mat.userData.mapChannels(mat, mat.userData.shader);
            }
        }
    }

    /**
     * Statically analyzes a shader definition for common errors before compiling.
     * @returns {Array<string>} List of validation warnings/errors.
     */
    static validateShader(shaderDef, THREE) {
        const errors = [];
        if (!shaderDef) return ['Shader definition is missing.'];
        if (shaderDef.id === 'standard') return [];

        const checkIncludes = (code) => {
            if (!code) return;
            const includeRegex = /#include\s+<([\w_]+)>/g;
            let match;
            while ((match = includeRegex.exec(code)) !== null) {
                const chunk = match[1];
                if (THREE && THREE.ShaderChunk && !THREE.ShaderChunk[chunk]) {
                    errors.push(`Missing THREE.ShaderChunk: '${chunk}'`);
                }
            }
        };

        const checkUniforms = (code) => {
            if (!code) return;
            // Matches: uniform vec3 myColor;
            const uniformRegex = /uniform\s+[\w\d_]+\s+([\w\d_]+)\s*;/g;
            let match;
            while ((match = uniformRegex.exec(code)) !== null) {
                const uName = match[1];
                // Ignore internal Three.js uniforms or our globals
                if (uName === 'time' || uName === 'uTime') continue;
                
                // If the uniform is not exposed in the def.uniforms registry, warn the user
                if (!shaderDef.uniforms || shaderDef.uniforms[uName] === undefined) {
                    errors.push(`Uniform '${uName}' is used in GLSL but missing from the shader's parameters block.`);
                }
            }
        };

        checkIncludes(shaderDef.vertexShader || shaderDef.vertexInject);
        checkIncludes(shaderDef.fragmentShader || shaderDef.fragmentInject);

        checkUniforms(shaderDef.vertexShader || shaderDef.vertexInject);
        checkUniforms(shaderDef.fragmentShader || shaderDef.fragmentInject);

        return errors;
    }
}

// ── Register Built-in Shaders ──────────────────────────────────────────────

ShaderRegistry.registerShader('standard', {
    name: 'Standard Surface'
});

ShaderRegistry.registerShader('hologram', {
    name: 'Hologram Projection',
    transparent: true,
    blending: 2, // THREE.AdditiveBlending = 2
    depthWrite: false,
    uniforms: {
        hologramColor: { value: null }, // Will be set by mapChannels
        scanlineSpeed: { value: 10.0 },
        scanlineDensity: { value: 50.0 }
    },
    fragmentInject: `
        // Create scanline effect based on screen-space or world-space Y
        float scanline = sin(vViewPosition.y * scanlineDensity - uTime * scanlineSpeed) * 0.5 + 0.5;
        float alpha = scanline * 0.5 + 0.2;
        
        // Override output color
        gl_FragColor = vec4(hologramColor * (scanline + 0.5), alpha * opacity);
    `,
    mapChannels: (material, userDataShader) => {
        if (!userDataShader || !userDataShader.uniforms) return;
        
        // Grab color from material standard properties
        if (!userDataShader.uniforms.hologramColor) {
            userDataShader.uniforms.hologramColor = { value: material.color };
        } else {
            userDataShader.uniforms.hologramColor.value = material.color;
        }
    }
});

ShaderRegistry.registerShader('water', {
    name: 'Animated Water',
    transparent: true,
    uniforms: {
        waterColor: { value: null },
        waveSpeed: { value: 2.0 },
        waveHeight: { value: 0.2 },
        waveScale: { value: 5.0 }
    },
    vertexInject: `
        float wave = sin(position.x * waveScale + uTime * waveSpeed) * 
                     cos(position.z * waveScale + uTime * waveSpeed) * waveHeight;
        transformed.y += wave;
    `,
    fragmentInject: `
        // Blend base color with water color based on height/time or just use solid tint
        float waveFresnel = dot(vNormal, vec3(0.0, 1.0, 0.0));
        gl_FragColor = vec4(mix(waterColor, vec3(1.0), 1.0 - waveFresnel), 0.8 * opacity);
    `,
    mapChannels: (material, userDataShader) => {
        if (!userDataShader || !userDataShader.uniforms) return;
        if (!userDataShader.uniforms.waterColor) {
            userDataShader.uniforms.waterColor = { value: material.color };
        } else {
            userDataShader.uniforms.waterColor.value = material.color;
        }
    }
});

ShaderRegistry.registerShader('glow', {
    name: 'Pulsing Emissive',
    uniforms: {
        pulseSpeed: { value: 3.0 },
        pulseMin: { value: 0.5 },
        pulseMax: { value: 2.0 }
    },
    fragmentInject: `
        float pulse = sin(uTime * pulseSpeed) * 0.5 + 0.5;
        float intensity = mix(pulseMin, pulseMax, pulse);
        
        // Multiply RGB by intensity
        gl_FragColor = vec4(gl_FragColor.rgb * intensity, gl_FragColor.a);
    `
});

ShaderRegistry.registerShader('outline', {
    name: 'Cartoon Outline',
    side: 1, // THREE.BackSide
    depthWrite: true,
    uniforms: {
        outlineColor: { value: null },
        outlineThickness: { value: 0.05 }
    },
    vertexInject: `
        transformed += normal * outlineThickness;
    `,
    fragmentInject: `
        gl_FragColor = vec4(outlineColor, 1.0);
    `,
    mapChannels: (material, userDataShader) => {
        if (!userDataShader || !userDataShader.uniforms) return;
        // Provide black outline by default
        if (!userDataShader.uniforms.outlineColor) {
            userDataShader.uniforms.outlineColor = { value: { isColor: true, r: 0, g: 0, b: 0 } };
        }
    }
});

ShaderRegistry.registerShader('fog', {
    name: 'Distance Fog',
    uniforms: {
        fogColor: { value: null },
        fogNear: { value: 10.0 },
        fogFar: { value: 50.0 }
    },
    fragmentInject: `
        float depth = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = smoothstep(fogNear, fogFar, depth);
        gl_FragColor = vec4(mix(gl_FragColor.rgb, fogColor, fogFactor), gl_FragColor.a);
    `,
    mapChannels: (material, userDataShader) => {
        if (!userDataShader || !userDataShader.uniforms) return;
        if (!userDataShader.uniforms.fogColor) {
            userDataShader.uniforms.fogColor = { value: { isColor: true, r: 0.8, g: 0.8, b: 0.9 } };
        }
    }
});

ShaderRegistry.registerShader('toon', {
    name: 'Toon Shading',
    uniforms: {
        toonSteps: { value: 4.0 }
    },
    fragmentInject: `
        // Extract brightness from the current output color
        float brightness = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
        
        // Quantize
        float steppedBrightness = floor(brightness * toonSteps) / toonSteps;
        
        // Avoid division by zero
        float ratio = brightness > 0.0 ? steppedBrightness / brightness : 0.0;
        
        gl_FragColor = vec4(gl_FragColor.rgb * ratio, gl_FragColor.a);
    `
});

ShaderRegistry.registerShader('glass', {
    name: 'Simple Transparent Glass',
    transparent: true,
    depthWrite: false,
    uniforms: {
        glassColor: { value: null },
        edgeBrightness: { value: 1.5 }
    },
    fragmentInject: `
        float rim = 1.0 - max(dot(vViewPosition, vNormal), 0.0);
        rim = smoothstep(0.6, 1.0, rim);
        
        vec3 finalColor = mix(glassColor, vec3(1.0), rim * edgeBrightness);
        float alpha = max(0.2, rim);
        
        gl_FragColor = vec4(finalColor, alpha * opacity);
    `,
    mapChannels: (material, userDataShader) => {
        if (!userDataShader || !userDataShader.uniforms) return;
        if (!userDataShader.uniforms.glassColor) {
            userDataShader.uniforms.glassColor = { value: material.color };
        } else {
            userDataShader.uniforms.glassColor.value = material.color;
        }
    }
});

