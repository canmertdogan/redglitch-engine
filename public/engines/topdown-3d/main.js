/**
 * TopDown-3D main.js — SHIM
 *
 * @deprecated This engine has been merged into engines/3d/main.js (RedGlitch3DGame).
 *             This file re-exports the unified engine for backward compatibility.
 *             All new code should import from '/engines/3d/main.js' directly.
 */

export { default } from '../3d/main.js';
export { default as TopDownGame3D } from '../3d/main.js';

// Re-expose on window for legacy script tags
import RedGlitch3DGame from '../3d/main.js';
if (typeof window !== 'undefined') {
    window.TopDownGame3D = RedGlitch3DGame;
}
