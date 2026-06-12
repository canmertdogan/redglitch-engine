import * as THREE from './public/lib/three/three.module.js';
const mat = new THREE.MeshStandardMaterial({ color: '#888888', emissive: '#000000' });
console.log(mat.color.getHexString());
