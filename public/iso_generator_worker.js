// iso_generator_worker.js - worker wrapper for IsoGenerator
// Imports the main generator and runs heavy generation off the main thread
self.importScripts('/iso_generator.js');

self.onmessage = function(e) {
    const data = e.data || {};
    try {
        const gen = new IsoGenerator();
        let result;
        if (data.action === 'terrain') {
            result = gen.generate(data.width, data.height, data.config || {});
        } else if (data.action === 'vegetation') {
            result = gen.generateVegetation(data.width, data.height, data.currentLayers || [], data.currentZ || [], data.config || {});
        } else {
            result = { error: 'unknown action' };
        }
        postMessage({ result });
    } catch (err) {
        postMessage({ error: (err && err.message) ? err.message : String(err) });
    }
};