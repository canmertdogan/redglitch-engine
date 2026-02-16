/**
 * ReflectionSystem.js
 * Scans the Game Engine to generate dynamic API definitions for the Algorithm Studio.
 */

export class ReflectionSystem {
    constructor(game) {
        this.game = game;
        this.definitions = [];
    }

    generateSchema() {
        this.definitions = [];
        
        // 1. Core Engine API
        this.reflectClass("Engine", this.game, [
            "spawnFireball", "spawnParticle", "createExplosion", "loadLevel"
        ]);

        // 2. Player API
        this.reflectClass("Player", this.game.player, [
            "hp", "maxHp", "mana", "speed"
        ]);

        // 3. Audio API
        if (this.game.audio) {
            this.reflectClass("Audio", this.game.audio, [
                "playMusic", "playSound", "stopAll"
            ]);
        }

        return this.definitions;
    }

    reflectClass(category, instance, whitelist) {
        if (!instance) return;

        // Methods
        const proto = Object.getPrototypeOf(instance);
        const methods = Object.getOwnPropertyNames(proto)
            .filter(prop => typeof instance[prop] === 'function' && whitelist.includes(prop));

        methods.forEach(method => {
            this.definitions.push({
                type: `func_${method}`,
                cat: category,
                title: this.formatTitle(method),
                desc: `Call ${category}.${method}()`,
                inputs: [{id: 'in', name: 'Exec', type: 'exec'}], // Parameters needed here
                outputs: [{id: 'out', name: 'Exec', type: 'exec'}]
            });
        });

        // Properties (Simple scan)
        whitelist.forEach(prop => {
            if (typeof instance[prop] !== 'function' && instance[prop] !== undefined) {
                // Getter
                this.definitions.push({
                    type: `get_${prop}`,
                    cat: category,
                    title: `Get ${this.formatTitle(prop)}`,
                    desc: `Read ${category}.${prop}`,
                    outputs: [{id: 'val', name: 'Value', type: this.getType(instance[prop])}]
                });
                // Setter
                this.definitions.push({
                    type: `set_${prop}`,
                    cat: category,
                    title: `Set ${this.formatTitle(prop)}`,
                    desc: `Write ${category}.${prop}`,
                    inputs: [{id: 'in', name: 'Exec', type: 'exec'}, {id: 'val', name: 'Value', type: this.getType(instance[prop])}],
                    outputs: [{id: 'out', name: 'Exec', type: 'exec'}]
                });
            }
        });
    }

    formatTitle(str) {
        return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    }

    getType(val) {
        if (typeof val === 'number') return 'num';
        if (typeof val === 'boolean') return 'bool';
        if (typeof val === 'string') return 'string';
        return 'any';
    }
}
