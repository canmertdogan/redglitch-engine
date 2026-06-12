import { TextureComposer } from '/engines/shared/TextureComposer.js';

export class MaterialPreviewRenderer {
    constructor(THREE) {
        this.THREE = THREE;
        this.width = 128;
        this.height = 128;

        // Offline renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setClearColor(0x000000, 0); // transparent background
        this.renderer.shadowMap.enabled = true;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 0, 3);
        this.camera.lookAt(0, 0, 0);

        // Lighting
        const ambLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xfff0dd, 0.8);
        fillLight.position.set(-5, 0, 2);
        this.scene.add(fillLight);

        // Geometry (Sphere)
        this.geometry = new THREE.SphereGeometry(1, 32, 32);
        this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8, metalness: 0.0 }));
        this.scene.add(this.mesh);

        // Cache: Hash -> Data URL
        this.cache = new Map();
    }

    _hashMaterial(matDef) {
        // Create a simple deterministic string from channels
        if (!matDef || !matDef.channels) return 'default';
        return JSON.stringify(matDef.channels);
    }

    async renderPreview(matDef) {
        const hash = this._hashMaterial(matDef);
        if (this.cache.has(hash)) {
            return this.cache.get(hash);
        }

        let color = '#888888';
        let emissive = '#000000';
        let opacity = 1.0;
        let transparent = false;
        let roughness = 0.8;
        let metalness = 0.0;
        let mapPath = null;
        let colorLayers = null;
        let alphaMapPath = null;
        let normalMapPath = null;
        let normalIntensity = 1.0;
        let tiling = { x: 1, y: 1 };
        let offset = { x: 0, y: 0 };

        if (matDef && matDef.channels) {
            if (matDef.channels.color?.color) color = matDef.channels.color.color;
            if (matDef.channels.color?.layers && matDef.channels.color.layers.length > 0) {
                colorLayers = matDef.channels.color.layers;
                tiling.x = matDef.channels.color.tilingX ?? 1;
                tiling.y = matDef.channels.color.tilingY ?? 1;
                offset.x = matDef.channels.color.offsetX ?? 0;
                offset.y = matDef.channels.color.offsetY ?? 0;
            } else if (matDef.channels.color?.texture) {
                mapPath = matDef.channels.color.texture;
                tiling.x = matDef.channels.color.tilingX ?? 1;
                tiling.y = matDef.channels.color.tilingY ?? 1;
                offset.x = matDef.channels.color.offsetX ?? 0;
                offset.y = matDef.channels.color.offsetY ?? 0;
            }
            if (matDef.channels.luminance?.color) emissive = matDef.channels.luminance.color;
            if (matDef.channels.transparency?.opacity !== undefined) {
                opacity = matDef.channels.transparency.opacity;
                if (opacity < 1.0) transparent = true;
            }
            if (matDef.channels.transparency?.alphaMap) {
                alphaMapPath = matDef.channels.transparency.alphaMap;
                transparent = true;
            }
            if (matDef.channels.reflectance?.roughness !== undefined) roughness = matDef.channels.reflectance.roughness;
            if (matDef.channels.reflectance?.metalness !== undefined) metalness = matDef.channels.reflectance.metalness;
            
            if (matDef.channels.normal?.map) {
                normalMapPath = matDef.channels.normal.map;
                if (matDef.channels.normal?.intensity !== undefined) normalIntensity = matDef.channels.normal.intensity;
            }
        }

        // Assign to mesh material
        this.mesh.material.color.set(color);
        this.mesh.material.emissive.set(emissive);
        this.mesh.material.roughness = roughness;
        this.mesh.material.metalness = metalness;
        this.mesh.material.opacity = opacity;
        this.mesh.material.transparent = transparent;
        this.mesh.material.flatShading = true;
        this.mesh.material.map = null;
        this.mesh.material.alphaMap = null;
        this.mesh.material.normalMap = null;

        if (colorLayers) {
            try {
                if (!this._textureComposer) this._textureComposer = new TextureComposer();
                const dataUrl = await this._textureComposer.compose(colorLayers, 512, 512);
                if (dataUrl) {
                    if (!this._textureLoader) this._textureLoader = new this.THREE.TextureLoader();
                    if (!this._texCache) this._texCache = new Map();
                    
                    let tex;
                    if (this._texCache.has(dataUrl)) {
                        tex = this._texCache.get(dataUrl);
                    } else {
                        tex = await new Promise((resolve, reject) => {
                            this._textureLoader.load(dataUrl, resolve, undefined, reject);
                        });
                        this._texCache.set(dataUrl, tex);
                    }
                    
                    const t = tex.clone();
                    t.wrapS = this.THREE.RepeatWrapping;
                    t.wrapT = this.THREE.RepeatWrapping;
                    t.repeat.set(tiling.x, tiling.y);
                    t.offset.set(offset.x, offset.y);
                    t.magFilter = this.THREE.NearestFilter;
                    t.minFilter = this.THREE.NearestFilter;
                    this.mesh.material.map = t;
                }
            } catch (err) {
                console.warn('PreviewRenderer: Failed to compose texture layers', err);
            }
        } else if (mapPath) {
            try {
                if (!this._textureLoader) this._textureLoader = new this.THREE.TextureLoader();
                // Check local cache first
                if (!this._texCache) this._texCache = new Map();
                
                let tex;
                if (this._texCache.has(mapPath)) {
                    tex = this._texCache.get(mapPath);
                } else {
                    tex = await new Promise((resolve, reject) => {
                        this._textureLoader.load(mapPath, resolve, undefined, reject);
                    });
                    this._texCache.set(mapPath, tex);
                }
                
                const t = tex.clone();
                t.wrapS = this.THREE.RepeatWrapping;
                t.wrapT = this.THREE.RepeatWrapping;
                t.repeat.set(tiling.x, tiling.y);
                t.offset.set(offset.x, offset.y);
                t.magFilter = this.THREE.NearestFilter;
                t.minFilter = this.THREE.NearestFilter;
                this.mesh.material.map = t;
            } catch (err) {
                console.warn('PreviewRenderer: Failed to load texture', mapPath);
            }
        }

        if (alphaMapPath) {
            try {
                if (!this._textureLoader) this._textureLoader = new this.THREE.TextureLoader();
                if (!this._texCache) this._texCache = new Map();
                
                let tex;
                if (this._texCache.has(alphaMapPath)) {
                    tex = this._texCache.get(alphaMapPath);
                } else {
                    tex = await new Promise((resolve, reject) => {
                        this._textureLoader.load(alphaMapPath, resolve, undefined, reject);
                    });
                    this._texCache.set(alphaMapPath, tex);
                }
                
                const t = tex.clone();
                t.wrapS = this.THREE.RepeatWrapping;
                t.wrapT = this.THREE.RepeatWrapping;
                t.repeat.set(tiling.x, tiling.y);
                t.offset.set(offset.x, offset.y);
                t.magFilter = this.THREE.NearestFilter;
                t.minFilter = this.THREE.NearestFilter;
                this.mesh.material.alphaMap = t;
            } catch (err) {
                console.warn('PreviewRenderer: Failed to load alpha map', alphaMapPath);
            }
        }

        if (normalMapPath) {
            try {
                if (!this._textureLoader) this._textureLoader = new this.THREE.TextureLoader();
                if (!this._texCache) this._texCache = new Map();
                
                let tex;
                if (this._texCache.has(normalMapPath)) {
                    tex = this._texCache.get(normalMapPath);
                } else {
                    tex = await new Promise((resolve, reject) => {
                        this._textureLoader.load(normalMapPath, resolve, undefined, reject);
                    });
                    this._texCache.set(normalMapPath, tex);
                }
                
                const t = tex.clone();
                t.wrapS = this.THREE.RepeatWrapping;
                t.wrapT = this.THREE.RepeatWrapping;
                t.repeat.set(tiling.x, tiling.y);
                t.offset.set(offset.x, offset.y);
                t.magFilter = this.THREE.NearestFilter;
                t.minFilter = this.THREE.NearestFilter;
                this.mesh.material.normalMap = t;
                this.mesh.material.normalScale.set(normalIntensity, normalIntensity);
            } catch (err) {
                console.warn('PreviewRenderer: Failed to load normal map', normalMapPath);
            }
        }

        this.mesh.material.needsUpdate = true;

        // Render
        this.renderer.render(this.scene, this.camera);

        // Extract Data URL
        const dataUrl = this.renderer.domElement.toDataURL('image/png');
        this.cache.set(hash, dataUrl);

        return dataUrl;
    }

    dispose() {
        this.renderer.dispose();
        this.geometry.dispose();
        this.mesh.material.dispose();
        this.cache.clear();
    }
}
