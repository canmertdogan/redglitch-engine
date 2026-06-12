/**
 * MaterialSystem.js — Cinema 4D style channel-based material system.
 * Designed for RedGlitch Engine's stylized flat-shaded aesthetic.
 */

const MATERIAL_SCHEMA_VERSION = "1.0";

export class MaterialSystem {
    /**
     * Create a new default material object.
     * @param {string} name - The name of the material.
     * @returns {object} A material schema object.
     */
    static createMaterial(name = "New Material") {
        return {
            version: MATERIAL_SCHEMA_VERSION,
            id: 'mat_' + Date.now() + '_' + Math.floor(Math.random() * 1000000),
            name: name,
            shader_id: 'standard',
            tags: [],
            channels: {
                color: {
                    enabled: true,
                    value: "#cccccc",
                    texture: null
                },
                luminance: {
                    enabled: false,
                    value: "#ffffff",
                    intensity: 1.0
                },
                reflectance: {
                    enabled: false,
                    roughness: 0.5,
                    metalness: 0.0
                },
                transparency: {
                    enabled: false,
                    opacity: 1.0,
                    mode: 'alpha' // 'alpha' or 'additive'
                },
                bump: {
                    enabled: false,
                    texture: null,
                    depth: 1.0
                }
            }
        };
    }

    /**
     * Serialize a material to JSON string.
     * @param {object} material - The material object.
     * @returns {string} JSON representation.
     */
    static serialize(material) {
        if (!material) return null;
        return JSON.stringify(material);
    }

    /**
     * Deserialize a material from JSON string or object, applying defaults for missing fields.
     * @param {string|object} data - JSON string or parsed object.
     * @returns {object} The hydrated material object.
     */
    static deserialize(data) {
        if (!data) return null;
        let parsed = typeof data === 'string' ? JSON.parse(data) : data;

        // Create a base material to ensure all channels exist
        let mat = this.createMaterial(parsed.name || "Imported Material");
        
        // Retain ID if present
        if (parsed.id) mat.id = parsed.id;
        
        // Shader ID
        if (parsed.shader_id) mat.shader_id = parsed.shader_id;
        
        // Tags
        if (Array.isArray(parsed.tags)) {
            mat.tags = [...parsed.tags];
        }

        // Channels
        if (parsed.channels) {
            for (const [key, channelDef] of Object.entries(parsed.channels)) {
                if (mat.channels[key]) {
                    Object.assign(mat.channels[key], channelDef);
                }
            }
        }

        return mat;
    }
}
