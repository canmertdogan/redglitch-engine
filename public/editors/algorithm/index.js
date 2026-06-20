import { AlgorithmStudio } from './AlgorithmStudio.js';
import { StudioBridge } from '../../ai/studio-bridge.js';

window.studio = new AlgorithmStudio();
const algorithmBridge = new StudioBridge('logic', window.RedGlitchEventBus);
algorithmBridge.register({
    name: 'generate',
    description: 'Apply a validated node and wire patch to the current algorithm graph.',
    securityLevel: 'high-risk',
    parameters: {
        type: 'object',
        properties: {
            nodes: { type: 'array', items: { type: 'object' } },
            wires: { type: 'array', items: { type: 'object' } }
        },
        required: ['nodes', 'wires']
    },
    execute: async ({ nodes, wires }) => {
        window.studio.applyAIPatch(nodes, wires);
        return { changedResources: ['algorithm:current'], nodeCount: nodes.length, wireCount: wires.length };
    }
});
