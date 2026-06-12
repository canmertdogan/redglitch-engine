import * as THREE from './public/lib/three/three.module.js';

const geo = new THREE.BoxGeometry(1, 1, 1);
const mat1 = new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#000000' });
const mesh = new THREE.Mesh(geo, [mat1, mat1, mat1, mat1, mat1, mat1]);

console.log('Mesh created with material array:', mesh.material.length);
