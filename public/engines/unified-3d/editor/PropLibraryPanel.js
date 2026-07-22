export default class PropLibraryPanel {

    constructor() {
        this.editor = null;
        this.container = null;
        this._selectedCategory = 'examples';
        this._selectedPropId = 'table';
        this._props = this._defineProps();
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;
        this._renderToolbar();
        this.onSceneRebuilt(editor._levelData);
    }

    _defineProps() {
        const wood = (c) => ({ color: c || 0x8B5A2B, flatShading: true });
        const metal = (c) => ({ color: c || 0x666666, flatShading: true });
        const stone = (c) => ({ color: c || 0x888888, flatShading: true });
        const fabric = (c) => ({ color: c || 0xCC4444, flatShading: true });

        const P = (THREE, opts) => new THREE.MeshLambertMaterial(opts);
        const exampleProp = (id, name, icon, shape, color = 0x888888) => ({
            id, name, icon,
            create(THREE) {
                const g = new THREE.Group();
                g.name = id;
                const mat = (hex = color) => P(THREE, { color: hex, flatShading: true });
                const add = (mesh, x = 0, y = 0, z = 0) => {
                    mesh.position.set(x, y, z);
                    g.add(mesh);
                    return mesh;
                };

                switch (shape) {
                    case 'coin_stack':
                        for (let i = 0; i < 5; i++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12), mat(0xd6a92d)), 0, 0.02 + i * 0.045, 0);
                        break;
                    case 'torch':
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6), mat(0x6b4226)), 0, 0.45, 0);
                        add(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 7), mat(0xff7a18)), 0, 1.02, 0);
                        break;
                    case 'weapon_rack':
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), mat(0x6b4226)), 0, 0.75, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), mat(0x6b4226)), -0.35, 0.55, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), mat(0x6b4226)), 0.35, 0.55, 0);
                        for (const x of [-0.18, 0.12]) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), mat(0xb8b8b8)), x, 0.45, 0.08);
                        break;
                    case 'potion':
                        add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0x7b3ff2)), 0, 0.18, 0);
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8), mat(0xd8d8d8)), 0, 0.42, 0);
                        break;
                    case 'anvil':
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.22), mat(0x404040)), 0, 0.42, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.18), mat(0x555555)), 0, 0.24, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.28), mat(0x333333)), 0, 0.04, 0);
                        break;
                    case 'hay_bale':
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.45), mat(0xcaa83a)), 0, 0.21, 0);
                        for (const x of [-0.18, 0.18]) add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.44, 0.47), mat(0x8b6b20)), x, 0.22, 0);
                        break;
                    case 'cart':
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.55), mat(0x8b5a2b)), 0, 0.35, 0);
                        for (const x of [-0.36, 0.36]) for (const z of [-0.32, 0.32]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), mat(0x252525)), x, 0.15, z).rotation.x = Math.PI / 2;
                        break;
                    case 'shield':
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.08, 6), mat(0x3d6fb6)), 0, 0.45, 0).rotation.x = Math.PI / 2;
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), mat(0xcaa83a)), 0, 0.45, 0.05);
                        break;
                    case 'banner':
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.4, 6), mat(0x6b4226)), -0.22, 0.7, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.025), mat(0xb6232e)), 0.04, 0.95, 0);
                        break;
                    case 'bedroll':
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 10), mat(0x486b3a)), 0, 0.18, 0).rotation.z = Math.PI / 2;
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 0.42), mat(0x2f4c2a)), 0, 0.03, 0);
                        break;
                    case 'target_dummy':
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.9, 7), mat(0xbe8a55)), 0, 0.5, 0);
                        add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xd2a36a)), 0, 1.02, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), mat(0x6b4226)), 0, 0.72, 0);
                        break;
                    case 'cage':
                        for (const x of [-0.25, 0, 0.25]) for (const z of [-0.22, 0.22]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5), mat(0x555555)), x, 0.35, z);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.5), mat(0x444444)), 0, 0.72, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.5), mat(0x333333)), 0, 0.02, 0);
                        break;
                    case 'brazier':
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.18, 10), mat(0x4a4a4a)), 0, 0.45, 0);
                        add(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 8), mat(0xff5a18)), 0, 0.68, 0);
                        for (const x of [-0.16, 0.16]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 5), mat(0x333333)), x, 0.22, 0);
                        break;
                    case 'rope_coil':
                        for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.TorusGeometry(0.18 + i * 0.035, 0.018, 6, 18), mat(0xb08a4a)), 0, 0.04 + i * 0.025, 0);
                        break;
                    case 'bridge_plank':
                        for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 1.1), mat(0x8b5a2b)), i * 0.24 - 0.36, 0.06, 0);
                        break;
                    case 'supply_sack':
                        add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0xaa8a5a)), 0, 0.24, 0).scale.y = 1.15;
                        add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.12, 8), mat(0x7a5a34)), 0, 0.54, 0);
                        break;
                    case 'market_stall':
                        add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.65), mat(0x8b5a2b)), 0, 0.55, 0);
                        add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.75), mat(0xc23b3b)), 0, 1.05, 0);
                        for (const x of [-0.48, 0.48]) for (const z of [-0.26, 0.26]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.0, 5), mat(0x6b4226)), x, 0.55, z);
                        break;
                    default:
                        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat()), 0, 0.25, 0);
                }
                return g;
            }
        });

        return {
            vehicles: {
                label: 'Vehicles',
                items: [
                    {
                        id: 'car', name: 'Car', icon: '🚗', entityType: 'vehicle',
                        properties: {
                            colorHex: '#3f6fb4',
                            width: 1.8, height: 0.75, depth: 3.0,
                            mass: 450, acceleration: 18, maxSpeed: 18, reverseSpeed: 7, turnRate: 2.3, brake: 16,
                        },
                    },
                    {
                        id: 'truck', name: 'Truck', icon: '🚚', entityType: 'vehicle',
                        properties: {
                            colorHex: '#8a7a5a',
                            width: 2.2, height: 1.1, depth: 4.6,
                            mass: 900, acceleration: 12, maxSpeed: 14, reverseSpeed: 5, turnRate: 1.6, brake: 12,
                        },
                    },
                ]
            },
            examples: {
                label: 'Examples',
                items: [
                    exampleProp('coin_stack', 'Coin Stack', '$', 'coin_stack'),
                    exampleProp('torch', 'Torch', 'T', 'torch'),
                    exampleProp('weapon_rack', 'Weapon Rack', 'W', 'weapon_rack'),
                    exampleProp('potion', 'Potion', 'P', 'potion'),
                    exampleProp('anvil', 'Anvil', 'A', 'anvil'),
                    exampleProp('hay_bale', 'Hay Bale', 'H', 'hay_bale'),
                    exampleProp('cart', 'Hand Cart', 'C', 'cart'),
                    exampleProp('shield', 'Shield', 'S', 'shield'),
                    exampleProp('banner', 'Banner', 'B', 'banner'),
                    exampleProp('bedroll', 'Bedroll', 'R', 'bedroll'),
                    exampleProp('target_dummy', 'Target Dummy', 'D', 'target_dummy'),
                    exampleProp('cage', 'Cage', 'G', 'cage'),
                    exampleProp('brazier', 'Brazier', 'F', 'brazier'),
                    exampleProp('rope_coil', 'Rope Coil', 'O', 'rope_coil'),
                    exampleProp('bridge_plank', 'Bridge Plank', '=', 'bridge_plank'),
                    exampleProp('supply_sack', 'Supply Sack', 'K', 'supply_sack'),
                    exampleProp('market_stall', 'Market Stall', 'M', 'market_stall'),
                    exampleProp('training_post', 'Training Post', 'X', 'target_dummy'),
                ]
            },
            furniture: {
                label: 'Furniture',
                items: [
                    {
                        id: 'table', name: 'Table', icon: '⬛',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'table';
                            const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.2), P(THREE, wood(0xC69C6E)));
                            top.position.y = 0.85; g.add(top);
                            const lm = P(THREE, wood(0x8B5A2B));
                            for (const [lx, lz] of [[-0.8,-0.45],[-0.8,0.45],[0.8,-0.45],[0.8,0.45]]) {
                                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.75, 6), lm);
                                leg.position.set(lx, 0.375, lz); g.add(leg);
                            }
                            return g;
                        }
                    },
                    {
                        id: 'chair', name: 'Chair', icon: '🪑',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'chair';
                            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), P(THREE, wood(0xC69C6E)));
                            seat.position.y = 0.5; g.add(seat);
                            const lm = P(THREE, wood(0x8B5A2B));
                            for (const [lx, lz] of [[-0.22,-0.22],[-0.22,0.22],[0.22,-0.22],[0.22,0.22]]) {
                                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6), lm);
                                leg.position.set(lx, 0.225, lz); g.add(leg);
                            }
                            const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), P(THREE, wood(0xC69C6E)));
                            back.position.set(0, 0.75, -0.28); g.add(back);
                            return g;
                        }
                    },
                    {
                        id: 'bench', name: 'Bench', icon: '🪤',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'bench';
                            const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), P(THREE, wood(0xC69C6E)));
                            seat.position.y = 0.5; g.add(seat);
                            const lm = P(THREE, wood(0x8B5A2B));
                            for (const [lx, lz] of [[-0.65,-0.18],[-0.65,0.18],[0.65,-0.18],[0.65,0.18]]) {
                                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.45, 6), lm);
                                leg.position.set(lx, 0.225, lz); g.add(leg);
                            }
                            return g;
                        }
                    },
                    {
                        id: 'bookshelf', name: 'Bookshelf', icon: '📚',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'bookshelf';
                            const wm = P(THREE, wood(0x6B4226));
                            const sides = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.5), wm);
                            sides.position.set(0, 0.8, 0); g.add(sides);
                            const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.5), wm);
                            top.position.set(0, 0.8, 0); g.add(top);
                            const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.5), P(THREE, wood(0x4A2A1A)));
                            back.position.set(0, 0.8, -0.02); g.add(back);
                            for (let i = 0; i < 4; i++) {
                                const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.45), wm);
                                shelf.position.set(0, i * 0.4 + 0.2, 0); g.add(shelf);
                            }
                            return g;
                        }
                    },
                    {
                        id: 'lamp', name: 'Floor Lamp', icon: '💡',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'lamp';
                            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 8), P(THREE, metal(0x444444)));
                            pole.position.y = 0.9; g.add(pole);
                            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.06, 8), P(THREE, metal(0x333333)));
                            base.position.y = 0.03; g.add(base);
                            const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 8), P(THREE, fabric(0xE8D5A3)));
                            shade.position.y = 1.85; shade.scale.y = 0.6; g.add(shade);
                            return g;
                        }
                    },
                ]
            },
            containers: {
                label: 'Containers',
                items: [
                    {
                        id: 'crate', name: 'Crate', icon: '📦',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'crate';
                            const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), P(THREE, wood(0xC69C6E)));
                            box.position.y = 0.4; g.add(box);
                            const sm = P(THREE, wood(0x8B5A2B));
                            for (const [dx, dy, dz, w, h, d] of [
                                [0,0.4,0.41,0.82,0.02,0.02],[0,0.4,-0.41,0.82,0.02,0.02],
                                [0.41,0.4,0,0.02,0.02,0.82],[-0.41,0.4,0,0.02,0.02,0.82],
                            ]) {
                                const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sm);
                                s.position.set(dx, dy, dz); g.add(s);
                            }
                            return g;
                        }
                    },
                    {
                        id: 'barrel', name: 'Barrel', icon: '🛢️',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'barrel';
                            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.7, 10), P(THREE, wood(0xA0724E)));
                            body.position.y = 0.35; g.add(body);
                            const bm = P(THREE, metal(0x555555));
                            for (let i = 0; i < 3; i++) {
                                const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.38, 0.04, 10), bm);
                                band.position.y = 0.08 + i * 0.27; g.add(band);
                            }
                            return g;
                        }
                    },
                    {
                        id: 'chest', name: 'Chest', icon: '🧰',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'chest';
                            const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), P(THREE, wood(0xC69C6E)));
                            base.position.y = 0.2; g.add(base);
                            const lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.5), P(THREE, wood(0xA0724E)));
                            lid.position.set(0, 0.45, 0); g.add(lid);
                            const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), P(THREE, metal(0xCCA830)));
                            lock.position.set(0, 0.4, 0.26); g.add(lock);
                            return g;
                        }
                    },
                ]
            },
            architecture: {
                label: 'Architecture',
                items: [
                    {
                        id: 'pillar', name: 'Pillar', icon: '🏛️',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'pillar';
                            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.5, 10), P(THREE, stone(0xAAAAAA)));
                            col.position.y = 1.25; g.add(col);
                            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.15, 10), P(THREE, stone(0xCCCCCC)));
                            cap.position.y = 2.5; g.add(cap);
                            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.15, 10), P(THREE, stone(0x999999)));
                            base.position.y = 0.075; g.add(base);
                            return g;
                        }
                    },
                    {
                        id: 'arch', name: 'Archway', icon: '⛩️',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'archway';
                            const sm = P(THREE, stone(0xAAAAAA));
                            const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.4), sm);
                            left.position.set(-0.5, 1, 0); g.add(left);
                            const right = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.4), sm);
                            right.position.set(0.5, 1, 0); g.add(right);
                            const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.15, 0.4), sm);
                            top.position.set(0, 2, 0); g.add(top);
                            return g;
                        }
                    },
                    {
                        id: 'fence', name: 'Fence Post', icon: '🚧',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'fence';
                            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1, 6), P(THREE, wood(0x8B5A2B)));
                            post.position.y = 0.5; g.add(post);
                            const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), P(THREE, wood(0xA0724E)));
                            rail.position.set(0, 0.7, 0); g.add(rail);
                            const rail2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), P(THREE, wood(0xA0724E)));
                            rail2.position.set(0, 0.3, 0); g.add(rail2);
                            return g;
                        }
                    },
                    {
                        id: 'planter', name: 'Planter', icon: '🪴',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'planter';
                            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 8), P(THREE, stone(0xCC6633)));
                            pot.position.y = 0.15; g.add(pot);
                            const plant = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), P(THREE, { color: 0x2d8a3f, flatShading: true }));
                            plant.position.y = 0.4; plant.scale.y = 1.5; g.add(plant);
                            return g;
                        }
                    },
                    {
                        id: 'sign', name: 'Sign Post', icon: '🪧',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'sign';
                            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), P(THREE, wood(0x8B5A2B)));
                            post.position.y = 0.6; g.add(post);
                            const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.03), P(THREE, wood(0xC69C6E)));
                            board.position.set(0, 1.1, 0); g.add(board);
                            return g;
                        }
                    },
                ]
            },
            decor: {
                label: 'Decor',
                items: [
                    {
                        id: 'campfire', name: 'Campfire', icon: '🔥',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'campfire';
                            const sm = P(THREE, stone(0x666666));
                            for (let i = 0; i < 6; i++) {
                                const a = (i / 6) * Math.PI * 2;
                                const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), sm);
                                s.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2);
                                s.scale.set(1, 0.5, 1); g.add(s);
                            }
                            const lm = P(THREE, wood(0x5C3A1E));
                            for (let i = 0; i < 4; i++) {
                                const a = (i / 4) * Math.PI * 2 + 0.2;
                                const log = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5), lm);
                                log.position.set(Math.cos(a) * 0.08, 0.04, Math.sin(a) * 0.08);
                                log.rotation.z = 0.4; log.rotation.y = a; g.add(log);
                            }
                            return g;
                        }
                    },
                    {
                        id: 'tent', name: 'Tent', icon: '⛺',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'tent';
                            const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.6, 3), P(THREE, fabric(0xCC6644)));
                            cloth.position.y = 0.3; g.add(cloth);
                            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5), P(THREE, wood(0x8B5A2B)));
                            pole.position.y = 0.65; g.add(pole);
                            return g;
                        }
                    },
                    {
                        id: 'well', name: 'Well', icon: '⛲',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'well';
                            const sm = P(THREE, stone(0x999999));
                            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 10), sm);
                            ring.position.y = 0.2; g.add(ring);
                            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6), P(THREE, wood(0x8B5A2B)));
                            col.position.set(0, 0.7, 0); g.add(col);
                            const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.15, 6), P(THREE, wood(0xC69C6E)));
                            roof.position.y = 0.95; g.add(roof);
                            return g;
                        }
                    },
                    {
                        id: 'trophy', name: 'Pedestal', icon: '🏆',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'pedestal';
                            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.1, 8), P(THREE, stone(0xBBBBBB)));
                            base.position.y = 0.05; g.add(base);
                            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8), P(THREE, stone(0x999999)));
                            pillar.position.y = 0.5; g.add(pillar);
                            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.15, 0.06, 8), P(THREE, stone(0xCCCCCC)));
                            cap.position.y = 0.93; g.add(cap);
                            return g;
                        }
                    },
                    {
                        id: 'throne', name: 'Throne', icon: '👑',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'throne';
                            const gm = P(THREE, { color: 0xCCA830, flatShading: true });
                            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), gm);
                            seat.position.y = 0.35; g.add(seat);
                            const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), gm);
                            back.position.set(0, 0.65, -0.27); g.add(back);
                            for (const [ax, az] of [[-0.22,-0.22],[-0.22,0.22],[0.22,-0.22],[0.22,0.22]]) {
                                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), P(THREE, { color: 0x8B6914, flatShading: true }));
                                leg.position.set(ax, 0.15, az); g.add(leg);
                            }
                            return g;
                        }
                    },
                ]
            },
            outdoor: {
                label: 'Outdoor',
                items: [
                    {
                        id: 'bush', name: 'Bush', icon: '🌳',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'bush';
                            const gm = P(THREE, { color: 0x2d8a3f, flatShading: true });
                            const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), gm);
                            c1.position.set(0, 0.25, 0); c1.scale.set(1, 0.7, 1); g.add(c1);
                            const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), gm);
                            c2.position.set(0.2, 0.1, 0.15); c2.scale.set(1, 0.6, 1); g.add(c2);
                            const c3 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), gm);
                            c3.position.set(-0.18, 0.1, -0.15); c3.scale.set(1, 0.6, 1); g.add(c3);
                            return g;
                        }
                    },
                    {
                        id: 'rock', name: 'Rock', icon: '🪨',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'rock';
                            const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3), P(THREE, stone(0x777777)));
                            r.position.y = 0.15;
                            r.scale.set(1, 0.6 + Math.random() * 0.3, 0.8 + Math.random() * 0.4);
                            g.add(r);
                            return g;
                        }
                    },
                    {
                        id: 'log', name: 'Log', icon: '🪵',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'log';
                            const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), P(THREE, wood(0x6B4226)));
                            l.rotation.z = Math.PI / 2;
                            l.position.set(0, 0.08, 0);
                            g.add(l);
                            return g;
                        }
                    },
                    {
                        id: 'mushrooms', name: 'Mushrooms', icon: '🍄',
                        create(THREE) {
                            const g = new THREE.Group(); g.name = 'mushrooms';
                            for (let i = 0; i < 3; i++) {
                                const s = 0.4 + i * 0.2;
                                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.03 * s, 0.08 * s, 5), P(THREE, { color: 0xE8D5A3, flatShading: true }));
                                stem.position.set(i * 0.2 - 0.2, 0.04 * s, 0); g.add(stem);
                                const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 5, 4), P(THREE, { color: i === 1 ? 0xCC3333 : 0xDD6633, flatShading: true }));
                                cap.position.set(i * 0.2 - 0.2, 0.1 * s, 0);
                                cap.scale.set(1, 0.5, 1); g.add(cap);
                            }
                            return g;
                        }
                    },
                ]
            },
        };
    }

    _renderToolbar() {
        if (!this.container) return;
        let catHtml = '';
        for (const [key, cat] of Object.entries(this._props)) {
            const active = key === this._selectedCategory ? ' active' : '';
            catHtml += `<button class="tool-btn${active}" data-cat="${key}">${cat.label}</button>`;
        }

        const currentCat = this._props[this._selectedCategory];
        let itemHtml = '';
        if (currentCat) {
            for (const prop of currentCat.items) {
                const active = prop.id === this._selectedPropId ? ' active' : '';
                itemHtml += `
                    <div class="prop-card${active}" data-prop="${prop.id}" title="${prop.name}">
                        <div class="prop-icon">${prop.icon}</div>
                        <div class="prop-label">${prop.name}</div>
                    </div>
                `;
            }
        }

        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">PROP LIBRARY</div>
                <div class="tool-buttons prop-categories">${catHtml}</div>
                <div class="prop-grid">${itemHtml}</div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">PLACEMENT</div>
                <div class="tool-row">
                    <label class="prop-label">Scale</label>
                    <input type="range" id="prop-scale" class="tool-input-sm" min="0.25" max="3" step="0.25" value="1">
                    <span id="prop-scale-val" style="width:24px;text-align:center;">1</span>
                </div>
                <div class="tool-buttons-col" style="margin-top:6px;">
                    <button class="action-btn" id="prop-place-at-origin">Place at Origin</button>
                    <button class="action-btn" id="prop-place-at-cursor">Place with Cursor</button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">MANAGE</div>
                <div class="tool-buttons-col">
                    <button class="action-btn" id="prop-clear-all">Clear All Props</button>
                </div>
            </div>
        `;

        // Category switching
        this.container.querySelectorAll('[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._selectedCategory = btn.dataset.cat;
                this._renderToolbar();
            });
        });

        // Prop click selects the active prop for origin/cursor placement.
        this.container.querySelectorAll('.prop-card').forEach(card => {
            card.addEventListener('click', () => {
                this._selectedPropId = card.dataset.prop;
                this._renderToolbar();
            });
        });

        // Scale slider
        const scaleSlider = document.getElementById('prop-scale');
        const scaleVal = document.getElementById('prop-scale-val');
        if (scaleSlider) {
            scaleSlider.addEventListener('input', () => {
                if (scaleVal) scaleVal.textContent = scaleSlider.value;
            });
        }

        // Clear all
        document.getElementById('prop-clear-all')?.addEventListener('click', () => this._clearAllProps());

        document.getElementById('prop-place-at-origin')?.addEventListener('click', () => {
            this.placeSelectedAt(new this.editor.THREE.Vector3(0, 0, 0));
        });

        document.getElementById('prop-place-at-cursor')?.addEventListener('click', () => {
            this.editor.setActiveTool('draw');
        });
    }

    _findProp(id) {
        for (const cat of Object.values(this._props)) {
            for (const p of cat.items) {
                if (p.id === id) return p;
            }
        }
        return null;
    }

    placeSelectedAt(position) {
        const def = this._findProp(this._selectedPropId);
        if (def?.entityType) return this._placeEntityProp(def, position);
        return this._placeProp(this._selectedPropId, position);
    }

    // Vehicles (and any future interactable premade asset) are placed as real
    // gameplay entities via placeEntityAt, not baked into static level geometry
    // like decorative props - this is what makes them usable (VehicleSystem3D
    // already drives any entity with type:'vehicle' across every 3D mode).
    _placeEntityProp(def, position = null) {
        if (!this.editor?.placeEntityAt) return;
        const center = position ? position.clone() : new this.editor.THREE.Vector3(0, 0, 0);
        this.editor.placeEntityAt(center, def.entityType, { ...(def.properties || {}) });
    }

    _placeProp(id, position = null) {
        const def = this._findProp(id);
        if (!def || !this.editor) return;
        const THREE = this.editor.THREE;
        const group = def.create(THREE);
        const scale = parseFloat(document.getElementById('prop-scale')?.value || '1');
        group.scale.setScalar(scale);

        const center = position ? position.clone() : new THREE.Vector3(0, 0, 0);
        group.position.copy(center);
        group.updateMatrixWorld(true);

        group.name = `${id}_${Date.now().toString(36)}`;

        let idx = 0;
        const tempGroup = new THREE.Group();
        group.traverse(child => {
            if (child.isMesh) {
                const mesh = child.clone();
                mesh.name = `${group.name}_part_${idx++}`;
                mesh.userData.propId = id;
                mesh.userData.propGroup = group.name;
                mesh.userData.propPart = idx - 1;
                mesh.userData.type = 'prop';
                mesh.userData.colorHex = this._getMaterialColorHex(mesh.material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                tempGroup.add(mesh);
            }
        });

        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        group.matrixWorld.decompose(pos, quat, sc);

        for (const mesh of tempGroup.children) {
            mesh.position.copy(mesh.position.clone().multiply(sc).add(pos));
            mesh.quaternion.multiply(quat);
            mesh.scale.multiply(sc);
            this.editor.meshGroup.add(mesh);
        }

        this.editor._updateSceneTree();

        // Select all parts
        const parts = [];
        for (const mesh of tempGroup.children) {
            const found = this.editor.scene.getObjectByName(mesh.name);
            if (found) parts.push(found);
        }
        if (parts.length > 0) {
            if (parts.length === 1) this.editor.select(parts[0]);
            else if (this.editor.selectMultiple) this.editor.selectMultiple(parts);
        }

        // Store prop reference for serialization
        if (!this.editor._propGroups) this.editor._propGroups = [];
        this.editor._propGroups.push({
            id: group.name,
            propId: id,
            position: [center.x, center.y, center.z],
            scale: scale,
            meshNames: tempGroup.children.map(m => m.name),
        });

        this.editor._markDirty();
    }

    _getMaterialColorHex(material) {
        const mat = Array.isArray(material) ? material[0] : material;
        if (!mat?.color) return '#888888';
        return `#${mat.color.getHexString()}`;
    }

    _clearAllProps() {
        if (!this.editor || !this.editor._propGroups) return;
        const names = new Set();
        for (const pg of this.editor._propGroups) {
            for (const n of pg.meshNames) names.add(n);
        }
        const toRemove = [];
        for (const child of this.editor.meshGroup.children) {
            if (child.userData?.propId && names.has(child.name)) {
                toRemove.push(child);
            }
        }
        for (const m of toRemove) {
            this.editor.meshGroup.remove(m);
            m.geometry?.dispose();
            if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
            else if (m.material) m.material.dispose();
        }
        this.editor._propGroups = [];
        this.editor._updateSceneTree();
        this.editor._markDirty();
    }

    onSceneRebuilt(levelData) {
        // Recreate prop groups from serialized data
        if (!this.editor) return;
        this.editor._propGroups = [];

        // Collect meshes tagged as props and re-group them
        const propMap = {};
        for (const child of this.editor.meshGroup.children) {
            const ud = child.userData || {};
            if (ud.propId && ud.propGroup) {
                if (!propMap[ud.propGroup]) {
                    propMap[ud.propGroup] = { propId: ud.propId, meshes: [] };
                }
                propMap[ud.propGroup].meshes.push(child);
            }
        }

        for (const [groupName, info] of Object.entries(propMap)) {
            this.editor._propGroups.push({
                id: groupName,
                propId: info.propId,
                position: [0, 0, 0],
                scale: 1,
                meshNames: info.meshes.map(m => m.name),
            });
        }
    }

    onSerialize(data) {}

    onModeChanged(mode) {}

    getDrawState() {
        const scale = parseFloat(document.getElementById('prop-scale')?.value || '1');
        return { mode: 'pencil', tool: 'prop', block: this._selectedPropId, width: scale, height: scale, depth: scale, snap: true };
    }

    dispose() {
        if (this.container) this.container.innerHTML = '';
    }
}
