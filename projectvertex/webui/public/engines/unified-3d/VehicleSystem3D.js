import * as THREE from '/lib/three/three.module.js';
import { BodyType, ShapeType } from '../shared/Physics3DWorld.js';

const DEFAULTS = {
    width: 1.8,
    height: 0.75,
    depth: 3.0,
    mass: 450,
    acceleration: 18,
    maxSpeed: 18,
    reverseSpeed: 7,
    turnRate: 2.3,
    brake: 16,
    drag: 0.985,
};

export default class VehicleSystem3D {
    constructor(game, opts = {}) {
        this.game = game;
        this.opts = opts;
        this.vehicles = [];
        this.active = null;
        this._prevInteract = false;
    }

    load(level = {}) {
        this.dispose();
        const defs = [];
        if (Array.isArray(level.vehicles)) defs.push(...level.vehicles);
        if (Array.isArray(level.entities)) {
            defs.push(...level.entities.filter(e => String(e?.type || '').toLowerCase() === 'vehicle'));
        }
        defs.forEach((def, i) => this._spawn(def, i));
    }

    update(dt, input, playerPosition = null, setPlayerPosition = null) {
        if (!this.vehicles.length) return;
        const interact = !!input?.isAction?.('interact') || !!input?.isKeyHeld?.('KeyE');
        if (interact && !this._prevInteract) {
            this.active ? this.exitActive(setPlayerPosition) : this.tryEnterNearest(playerPosition);
        }
        this._prevInteract = interact;

        for (const vehicle of this.vehicles) {
            if (vehicle === this.active) this._drive(vehicle, dt, input);
            this._syncVehicle(vehicle);
        }

        if (this.active && setPlayerPosition) {
            const p = this.active.mesh.position;
            setPlayerPosition(p.x, p.y + 0.9, p.z);
        }
    }

    tryEnterNearest(playerPosition) {
        if (!playerPosition) return false;
        const pp = _vec3(playerPosition);
        let nearest = null;
        let nearestDist = Infinity;
        for (const vehicle of this.vehicles) {
            const dist = vehicle.mesh.position.distanceTo(pp);
            if (dist < nearestDist) {
                nearest = vehicle;
                nearestDist = dist;
            }
        }
        if (!nearest || nearestDist > 3.2) return false;
        this.active = nearest;
        nearest.mesh.userData.driverActive = true;
        return true;
    }

    exitActive(setPlayerPosition = null) {
        if (!this.active) return;
        const p = this.active.mesh.position;
        this.active.mesh.userData.driverActive = false;
        if (setPlayerPosition) setPlayerPosition(p.x + 1.6, p.y + 0.4, p.z);
        this.active = null;
    }

    dispose() {
        for (const vehicle of this.vehicles) {
            if (vehicle.pb && this.game.physics?.removeBody) this.game.physics.removeBody(vehicle.pb);
            this.game.scene?.remove(vehicle.mesh);
            vehicle.mesh.geometry?.dispose?.();
            vehicle.mesh.material?.dispose?.();
        }
        this.vehicles = [];
        this.active = null;
    }

    _spawn(def = {}, index = 0) {
        const cfg = { ...DEFAULTS, ...(def.config || {}), ...def };
        const pos = _positionFrom(def.position ?? def.pos ?? def);
        const y = Number(pos.y ?? 1);
        const group = this._createVehicleMesh(cfg, index);
        group.position.set(Number(pos.x ?? 0), y, Number(pos.z ?? 0));
        group.rotation.y = _yawFrom(def.rotation ?? def.yaw);
        group.name = def.id || `vehicle_${index}`;
        group.userData = { type: 'vehicle', vehicleConfig: cfg };
        this.game.scene.add(group);

        const pb = this.game.physics?.createBody?.({
            mesh: group,
            type: BodyType.DYNAMIC,
            shape: ShapeType.BOX,
            halfExtents: { x: cfg.width * 0.5, y: cfg.height * 0.5, z: cfg.depth * 0.5 },
            mass: cfg.mass,
            position: { x: group.position.x, y: group.position.y, z: group.position.z },
            fixedRotation: true,
            linearDamping: 0.08,
            angularDamping: 0.9,
            friction: 0.85,
            restitution: 0.05,
        }) ?? null;
        if (pb?.body) pb.body.userData = { type: 'vehicle', surface: 'metal', id: group.name };

        this.vehicles.push({
            id: group.name,
            mesh: group,
            pb,
            cfg,
            yaw: group.rotation.y,
            speed: 0,
        });
    }

    _createVehicleMesh(cfg, index) {
        const color = cfg.colorHex || cfg.color || (index % 2 ? '#b4483f' : '#3f6fb4');
        const bodyGeo = new THREE.BoxGeometry(cfg.width, cfg.height, cfg.depth);
        const bodyMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;

        const cabinGeo = new THREE.BoxGeometry(cfg.width * 0.72, cfg.height * 0.65, cfg.depth * 0.42);
        const cabinMat = new THREE.MeshLambertMaterial({ color: '#222833', flatShading: true });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, cfg.height * 0.58, -cfg.depth * 0.08);
        cabin.castShadow = true;
        body.add(cabin);

        return body;
    }

    _drive(vehicle, dt, input) {
        const axis = input?.getAxis?.() ?? { x: 0, y: 0 };
        const throttle = (axis.y < -0.1 ? 1 : 0) + (input?.isAction?.('moveForward') ? 1 : 0);
        const reverse = (axis.y > 0.1 ? 1 : 0) + (input?.isAction?.('moveBackward') ? 1 : 0);
        const steer = Math.max(-1, Math.min(1, axis.x || 0));
        const braking = !!input?.isAction?.('jump') || !!input?.isKeyHeld?.('Space');

        vehicle.speed += (throttle - reverse) * vehicle.cfg.acceleration * dt;
        if (braking) vehicle.speed = THREE.MathUtils.lerp(vehicle.speed, 0, Math.min(1, vehicle.cfg.brake * dt));
        vehicle.speed *= Math.pow(vehicle.cfg.drag, dt * 60);
        vehicle.speed = Math.max(-vehicle.cfg.reverseSpeed, Math.min(vehicle.cfg.maxSpeed, vehicle.speed));

        const speedFactor = Math.min(1, Math.abs(vehicle.speed) / Math.max(1, vehicle.cfg.maxSpeed));
        vehicle.yaw -= steer * vehicle.cfg.turnRate * speedFactor * Math.sign(vehicle.speed || 1) * dt;

        const vx = Math.sin(vehicle.yaw) * vehicle.speed;
        const vz = Math.cos(vehicle.yaw) * vehicle.speed;
        if (vehicle.pb?.body) {
            vehicle.pb.body.velocity.x = vx;
            vehicle.pb.body.velocity.z = vz;
            vehicle.pb.body.quaternion.setFromEuler(0, vehicle.yaw, 0);
            vehicle.pb.body.wakeUp();
        } else {
            vehicle.mesh.position.x += vx * dt;
            vehicle.mesh.position.z += vz * dt;
            vehicle.mesh.rotation.y = vehicle.yaw;
        }
    }

    _syncVehicle(vehicle) {
        if (vehicle.pb?.body) {
            const p = vehicle.pb.body.position;
            vehicle.mesh.position.set(p.x, p.y, p.z);
            vehicle.mesh.rotation.y = vehicle.yaw;
        }
    }
}

function _positionFrom(value) {
    if (Array.isArray(value)) return { x: value[0], y: value[1], z: value[2] };
    return { x: value?.x ?? 0, y: value?.y ?? 1, z: value?.z ?? 0 };
}

function _yawFrom(value) {
    if (Array.isArray(value) && value.length === 4) {
        const q = new THREE.Quaternion(value[0], value[1], value[2], value[3]);
        return new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    }
    const n = Number(Array.isArray(value) ? value[1] : value);
    if (!Number.isFinite(n)) return 0;
    return Math.abs(n) > Math.PI * 2 ? n * Math.PI / 180 : n;
}

function _vec3(value) {
    return new THREE.Vector3(Number(value.x ?? value[0] ?? 0), Number(value.y ?? value[1] ?? 0), Number(value.z ?? value[2] ?? 0));
}
