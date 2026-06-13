import { MaterialSystem } from './MaterialSystem.js';

export const MaterialPresets = {
    "Neon Dystopia": [
        {
            name: "Hex-Grid Energy Shield",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#00ffff" },
                luminance: { enabled: true, value: "#00ffff", intensity: 2.0 },
                transparency: { enabled: true, opacity: 0.3, mode: "additive" },
                reflectance: { enabled: true, roughness: 0.1, metalness: 0.8 }
            }
        },
        {
            name: "Brushed Gunmetal",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#2c2c34" },
                reflectance: { enabled: true, roughness: 0.4, metalness: 0.9 },
                bump: { enabled: true, depth: 0.5 }
            }
        },
        {
            name: "Neon-Lit Grate",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#ff0055" },
                luminance: { enabled: true, value: "#ff0055", intensity: 1.5 },
                reflectance: { enabled: true, roughness: 0.6, metalness: 0.5 }
            }
        }
    ],
    "Low-Poly Nostalgia": [
        {
            name: "PS1 Brick Wall",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#8c4f42" },
                reflectance: { enabled: false },
                bump: { enabled: true, depth: 1.0 }
            }
        },
        {
            name: "Checkerboard Tile",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#ffffff" },
                reflectance: { enabled: true, roughness: 0.8, metalness: 0.1 }
            }
        },
        {
            name: "Flat Shaded Water",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#4a90e2" },
                transparency: { enabled: true, opacity: 0.8, mode: "alpha" },
                reflectance: { enabled: true, roughness: 0.2, metalness: 0.1 }
            }
        }
    ],
    "Cel-Shaded Comic": [
        {
            name: "Flat Ink Black",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#111111" },
                reflectance: { enabled: false }
            }
        },
        {
            name: "Comic Red",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#ff2a2a" },
                reflectance: { enabled: false }
            }
        },
        {
            name: "Halftone Shadow",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#444444" },
                reflectance: { enabled: false }
            }
        }
    ],
    "Brutalism & Decay": [
        {
            name: "Cracked Concrete",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#6a6d70" },
                reflectance: { enabled: true, roughness: 0.9, metalness: 0.0 },
                bump: { enabled: true, depth: 1.5 }
            }
        },
        {
            name: "Rusted Iron",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#7c4125" },
                reflectance: { enabled: true, roughness: 0.8, metalness: 0.6 },
                bump: { enabled: true, depth: 1.2 }
            }
        },
        {
            name: "Oxidized Copper",
            shader_id: "standard",
            channels: {
                color: { enabled: true, value: "#4f9d84" },
                reflectance: { enabled: true, roughness: 0.7, metalness: 0.8 },
                bump: { enabled: true, depth: 0.8 }
            }
        }
    ]
};

export class MaterialPackManager {
    static getPacks() {
        return Object.keys(MaterialPresets);
    }

    static getMaterialsForPack(packName) {
        const presets = MaterialPresets[packName] || [];
        return presets.map(p => MaterialSystem.deserialize(p));
    }

    static getAllPresetMaterials() {
        let all = [];
        for (const pack of Object.values(MaterialPresets)) {
            all = all.concat(pack.map(p => MaterialSystem.deserialize(p)));
        }
        return all;
    }
}
