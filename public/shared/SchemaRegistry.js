/**
 * RedGlitch Engine - Unified Schema Registry
 * Phase 1 of the Data-Driven IDE Revamp.
 * Standardizes all game data structures (entities, prefabs, algorithms, campaign states)
 * so the IDE and Runtime speak the exact same language.
 */
class SchemaRegistry {
    constructor() {
        this.schemas = new Map();
        this.registerDefaultSchemas();
    }

    /**
     * Register a new schema or override an existing one.
     */
    registerSchema(name, definition) {
        this.schemas.set(name, definition);
    }

    /**
     * Get a schema by name.
     */
    getSchema(name) {
        return this.schemas.get(name);
    }

    /**
     * Validate data against a registered schema.
     */
    validate(schemaName, data) {
        const schema = this.getSchema(schemaName);
        if (!schema) {
            console.warn(`[SchemaRegistry] Schema '${schemaName}' not found.`);
            return { valid: false, errors: ['Schema not found'] };
        }

        const errors = [];
        this._validateObject(schema, data, errors, schemaName);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    _validateObject(schemaDef, data, errors, path) {
        if (typeof data !== 'object' || data === null) {
            errors.push(`${path} must be an object.`);
            return;
        }

        for (const [key, rules] of Object.entries(schemaDef)) {
            const value = data[key];
            const currentPath = `${path}.${key}`;

            if (rules.required && value === undefined) {
                errors.push(`${currentPath} is required.`);
                continue;
            }

            if (value !== undefined) {
                // Type checking
                if (rules.type === 'array') {
                    if (!Array.isArray(value)) {
                        errors.push(`${currentPath} must be an array.`);
                    } else if (rules.items) {
                        value.forEach((item, index) => {
                            if (typeof rules.items === 'string') {
                                if (typeof item !== rules.items) {
                                    errors.push(`${currentPath}[${index}] must be a ${rules.items}.`);
                                }
                            } else if (typeof rules.items === 'object') {
                                this._validateObject(rules.items, item, errors, `${currentPath}[${index}]`);
                            }
                        });
                    }
                } else if (rules.type === 'object') {
                    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                        errors.push(`${currentPath} must be an object.`);
                    } else if (rules.properties) {
                        this._validateObject(rules.properties, value, errors, currentPath);
                    }
                } else if (typeof value !== rules.type && rules.type !== 'any') {
                    // Quick fix: ignore function type checks for serialized JSON
                    if (rules.type !== 'function') {
                        errors.push(`${currentPath} must be of type ${rules.type}.`);
                    }
                }
            }
        }
    }

    /**
     * Registers the core schemas for the RedGlitch Engine.
     */
    registerDefaultSchemas() {
        // Entity Component Schema Definition
        const componentSchema = {
            type: { type: 'string', required: true }
        };
        this.registerSchema('Component', componentSchema);

        // Base Entity/Prefab Schema
        this.registerSchema('Entity', {
            name: { type: 'string', required: true },
            sprite: { type: 'string', required: false },
            components: {
                type: 'array',
                required: true,
                items: componentSchema
            }
        });

        // Campaign Node Schema
        this.registerSchema('CampaignNode', {
            id: { type: 'string', required: true },
            type: { type: 'string', required: true },
            x: { type: 'number', required: true },
            y: { type: 'number', required: true },
            name: { type: 'string', required: false },
            next: { type: 'string', required: false }
        });

        // Algorithm Node Schema
        this.registerSchema('AlgorithmNode', {
            type: { type: 'string', required: true },
            label: { type: 'string', required: true },
            cat: { type: 'string', required: true },
            inputs: { type: 'array', required: false },
            outputs: { type: 'array', required: false }
        });
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.RedGlitchSchemaRegistry = window.RedGlitchSchemaRegistry || new SchemaRegistry();
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SchemaRegistry;
}
