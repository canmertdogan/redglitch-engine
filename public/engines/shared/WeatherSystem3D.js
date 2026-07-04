import * as THREE from '/lib/three/three.module.js';

const DEFAULT_CONFIG = {
    enabled: false,
    type: 'clear',
    intensity: 0.35,
    windX: 0.4,
    windZ: 0.1,
    area: 90,
};

export default class WeatherSystem3D {
    constructor(scene, camera = null, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.THREE = options.THREE || THREE;
        this.root = new this.THREE.Group();
        this.root.name = 'weather_system_root';
        this.scene?.add(this.root);

        this.sunDisc = null;
        this.moonDisc = null;
        this.moonLight = null;
        this.particles = null;
        this.config = { ...DEFAULT_CONFIG };
        this._time = 0;

        this._ensureCelestialObjects();
    }

    applyConfig(skybox = {}) {
        const weather = skybox.weather || {};
        this.config = {
            ...DEFAULT_CONFIG,
            ...weather,
            enabled: weather.enabled ?? weather.type !== undefined,
        };

        this._applyCelestialConfig(skybox);
        this._buildParticles();
        this._applyFogForWeather(skybox);
    }

    update(camera = this.camera, dt = 0) {
        this.camera = camera || this.camera;
        this._time += dt;
        if (this.root && this.camera) {
            this.root.position.copy(this.camera.position);
            this.sunDisc?.lookAt(this.camera.position);
            this.moonDisc?.lookAt(this.camera.position);
        }

        if (this.particles && this.config.enabled) {
            const pos = this.particles.geometry.getAttribute('position');
            const area = this.config.area || 90;
            const half = area * 0.5;
            const speed = this.config.type === 'snow' ? 6 : this.config.type === 'ash' ? 3 : 22;
            const windX = Number(this.config.windX || 0);
            const windZ = Number(this.config.windZ || 0);

            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i) + windX * dt * speed * 0.25;
                let y = pos.getY(i) - speed * dt;
                let z = pos.getZ(i) + windZ * dt * speed * 0.25;
                if (y < 0) y = area;
                if (x > half) x = -half;
                if (x < -half) x = half;
                if (z > half) z = -half;
                if (z < -half) z = half;
                pos.setXYZ(i, x, y, z);
            }
            pos.needsUpdate = true;
        }
    }

    dispose() {
        this.root?.parent?.remove(this.root);
        this.root?.traverse(obj => {
            obj.geometry?.dispose?.();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
            else obj.material?.dispose?.();
        });
        this.moonLight?.parent?.remove(this.moonLight);
        this.moonLight?.target?.parent?.remove(this.moonLight.target);
        this.moonLight = null;
        this.root = null;
    }

    _ensureCelestialObjects() {
        const THREE = this.THREE;
        const discGeo = new THREE.CircleGeometry(4, 24);

        this.sunDisc = new THREE.Mesh(
            discGeo.clone(),
            new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.95, fog: false })
        );
        this.sunDisc.name = 'weather_sun_disc';
        this.root.add(this.sunDisc);

        this.moonDisc = new THREE.Mesh(
            discGeo.clone(),
            new THREE.MeshBasicMaterial({ color: 0xdde7ff, transparent: true, opacity: 0.85, fog: false })
        );
        this.moonDisc.name = 'weather_moon_disc';
        this.root.add(this.moonDisc);

        this.moonLight = new THREE.DirectionalLight(0xbfd4ff, 0.25);
        this.moonLight.name = '__moonLight';
        this.moonLight.castShadow = false;
        this.scene.add(this.moonLight);
        this.scene.add(this.moonLight.target);
    }

    _applyCelestialConfig(skybox) {
        const sun = skybox.sun || {};
        const moon = skybox.moon || {};
        const sunPos = this._celestialPosition(sun.azimuth ?? 45, sun.elevation ?? 45, 70);
        const moonAz = moon.azimuth ?? ((sun.azimuth ?? 45) + 180);
        const moonEl = moon.elevation ?? Math.max(8, 70 - (sun.elevation ?? 45));
        const moonPos = this._celestialPosition(moonAz, moonEl, 68);

        this.sunDisc.position.copy(sunPos);
        this.sunDisc.lookAt(0, 0, 0);
        this.sunDisc.visible = (sun.intensity ?? 1) > 0.02;
        this.sunDisc.material.color.set(sun.color || '#fffbe0');

        this.moonDisc.position.copy(moonPos);
        this.moonDisc.lookAt(0, 0, 0);
        this.moonDisc.visible = moon.enabled !== false && (moon.intensity ?? 0.25) > 0.01;
        this.moonDisc.material.color.set(moon.color || '#dce8ff');

        this.moonLight.color.set(moon.color || '#bcd2ff');
        this.moonLight.intensity = moon.enabled === false ? 0 : Number(moon.intensity ?? 0.25);
        this.moonLight.position.copy(moonPos);
        this.moonLight.target.position.set(0, 0, 0);
    }

    _celestialPosition(azimuthDeg, elevationDeg, radius) {
        const az = Number(azimuthDeg) * Math.PI / 180;
        const el = Number(elevationDeg) * Math.PI / 180;
        return new this.THREE.Vector3(
            radius * Math.cos(el) * Math.sin(az),
            radius * Math.sin(el),
            radius * Math.cos(el) * Math.cos(az)
        );
    }

    _buildParticles() {
        const THREE = this.THREE;
        if (this.particles) {
            this.particles.parent?.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
            this.particles = null;
        }

        if (!this.config.enabled || this.config.type === 'clear') return;

        const area = this.config.area || 90;
        const count = Math.floor((this.config.type === 'fog' ? 90 : 450) * Math.max(0.05, Number(this.config.intensity || 0.3)));
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * area;
            positions[i * 3 + 1] = Math.random() * area;
            positions[i * 3 + 2] = (Math.random() - 0.5) * area;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const color = this.config.type === 'snow' ? 0xeaf3ff :
            this.config.type === 'ash' ? 0x6f6a64 :
            this.config.type === 'fog' ? 0xc8d0d8 : 0x8fc8ff;

        const mat = new THREE.PointsMaterial({
            color,
            size: this.config.type === 'rain' ? 0.08 : this.config.type === 'fog' ? 1.2 : 0.16,
            transparent: true,
            opacity: this.config.type === 'fog' ? 0.22 : 0.7,
            depthWrite: false,
            fog: false,
        });

        this.particles = new THREE.Points(geo, mat);
        this.particles.name = `weather_${this.config.type}_particles`;
        this.root.add(this.particles);
    }

    _applyFogForWeather(skybox) {
        if (!this.scene) return;
        if (!this.config.enabled) return;
        if (this.config.type === 'fog') {
            const color = skybox.fogColor || skybox.bottomColor || '#9aa8b0';
            this.scene.fog = new this.THREE.FogExp2(color, Math.max(0.015, Number(this.config.intensity || 0.3) * 0.08));
        } else if (this.config.type === 'rain' || this.config.type === 'snow') {
            const color = skybox.fogColor || skybox.bottomColor || '#8fa0aa';
            this.scene.fog = new this.THREE.FogExp2(color, Math.max(0.008, Number(this.config.intensity || 0.3) * 0.025));
        }
    }
}
