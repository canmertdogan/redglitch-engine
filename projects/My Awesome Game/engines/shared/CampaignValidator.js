/**
 * CampaignValidator - Validation utilities for campaigns
 * Checks campaign integrity, level file existence, and node references
 */
class CampaignValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Validate entire campaign
     * @param {Object} campaign - Campaign data
     * @returns {Object} Validation result
     */
    async validate(campaign) {
        this.errors = [];
        this.warnings = [];

        if (!campaign) {
            this.errors.push('Campaign data is null or undefined');
            return this._getResult();
        }

        const nodes = campaign.nodes || campaign;
        if (!Array.isArray(nodes)) {
            this.errors.push('Campaign nodes must be an array');
            return this._getResult();
        }

        // Run all validation checks
        this._validateNodeStructure(nodes);
        this._validateNodeReferences(nodes);
        this._validateStartNode(nodes);
        await this._validateLevelFiles(nodes);
        this._validateBranchNodes(nodes);
        this._validateEngineTypes(nodes);

        return this._getResult();
    }

    /**
     * Validate node structure
     * @private
     */
    _validateNodeStructure(nodes) {
        nodes.forEach((node, index) => {
            if (!node.id) {
                this.errors.push(`Node at index ${index} is missing 'id' field`);
            }
            if (!node.type) {
                this.errors.push(`Node '${node.id || index}' is missing 'type' field`);
            }
            
            // Check for duplicate IDs
            const duplicates = nodes.filter(n => n.id === node.id);
            if (duplicates.length > 1) {
                this.errors.push(`Duplicate node ID: '${node.id}'`);
            }
        });
    }

    /**
     * Validate node references
     * @private
     */
    _validateNodeReferences(nodes) {
        const nodeIds = new Set(nodes.map(n => n.id));

        nodes.forEach(node => {
            // Check 'next' reference
            if (node.next && !nodeIds.has(node.next)) {
                this.errors.push(`Node '${node.id}' references non-existent node '${node.next}'`);
            }

            // Check branch references
            if (node.type === 'branch' || node.type === 'if-statement' || node.type === 'random') {
                if (node.nextTrue && !nodeIds.has(node.nextTrue)) {
                    this.errors.push(`Node '${node.id}' references non-existent nextTrue '${node.nextTrue}'`);
                }
                if (node.nextFalse && !nodeIds.has(node.nextFalse)) {
                    this.errors.push(`Node '${node.id}' references non-existent nextFalse '${node.nextFalse}'`);
                }
            }
        });
    }

    /**
     * Validate start node
     * @private
     */
    _validateStartNode(nodes) {
        const startNodes = nodes.filter(n => n.type === 'start');
        
        if (startNodes.length === 0) {
            this.warnings.push('No start node found. Campaign will use first node.');
        }
        
        if (startNodes.length > 1) {
            this.warnings.push(`Multiple start nodes found (${startNodes.length}). Only first will be used.`);
        }
    }

    /**
     * Validate level files exist
     * @private
     */
    async _validateLevelFiles(nodes) {
        const levelNodes = nodes.filter(n => n.type === 'level');

        for (const node of levelNodes) {
            if (!node.levelId && !node.levelPath) {
                this.errors.push(`Level node '${node.id}' missing levelId or levelPath`);
                continue;
            }

            const levelPath = node.levelPath || `dunyalar/${node.levelId}.json`;
            
            try {
                const response = await fetch(levelPath, { method: 'HEAD' });
                if (!response.ok) {
                    this.errors.push(`Level file not found: ${levelPath} (node '${node.id}')`);
                }
            } catch (error) {
                this.warnings.push(`Could not verify level file: ${levelPath} (node '${node.id}')`);
            }
        }
    }

    /**
     * Validate branch nodes
     * @private
     */
    _validateBranchNodes(nodes) {
        const branchNodes = nodes.filter(n => 
            n.type === 'branch' || n.type === 'if-statement' || n.type === 'random'
        );

        branchNodes.forEach(node => {
            if (!node.nextTrue) {
                this.warnings.push(`Branch node '${node.id}' missing nextTrue path`);
            }
            if (!node.nextFalse) {
                this.warnings.push(`Branch node '${node.id}' missing nextFalse path`);
            }
            
            if (node.type === 'branch' || node.type === 'if-statement') {
                if (!node.condition && !node.flag) {
                    this.errors.push(`Branch node '${node.id}' missing condition/flag`);
                }
            }
            
            if (node.type === 'random') {
                if (node.chance === undefined) {
                    this.warnings.push(`Random node '${node.id}' missing chance, defaulting to 50%`);
                }
                if (node.chance < 0 || node.chance > 100) {
                    this.errors.push(`Random node '${node.id}' chance must be 0-100`);
                }
            }
        });
    }

    /**
     * Validate engine types
     * @private
     */
    _validateEngineTypes(nodes) {
        const validEngines = ['rpg-topdown', 'iso-pixel', 'platformer-2d'];
        const levelNodes = nodes.filter(n => n.type === 'level');

        levelNodes.forEach(node => {
            if (!node.engineType) {
                this.warnings.push(`Level node '${node.id}' missing engineType, will default to 'rpg-topdown'`);
            } else if (!validEngines.includes(node.engineType)) {
                this.errors.push(`Level node '${node.id}' has invalid engineType '${node.engineType}'`);
            }
        });
    }

    /**
     * Check for unreachable nodes
     * @param {Array} nodes - Campaign nodes
     * @returns {Array} Unreachable node IDs
     */
    findUnreachableNodes(nodes) {
        const reachable = new Set();
        const visited = new Set();

        // Find start node
        let startNode = nodes.find(n => n.type === 'start');
        if (!startNode) {
            const targets = new Set();
            nodes.forEach(n => {
                if (n.next) targets.add(n.next);
                if (n.nextTrue) targets.add(n.nextTrue);
                if (n.nextFalse) targets.add(n.nextFalse);
            });
            startNode = nodes.find(n => !targets.has(n.id));
        }
        if (!startNode) startNode = nodes[0];

        // Traverse from start
        const traverse = (nodeId) => {
            if (!nodeId || visited.has(nodeId)) return;
            visited.add(nodeId);
            
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;
            
            reachable.add(nodeId);
            
            if (node.next) traverse(node.next);
            if (node.nextTrue) traverse(node.nextTrue);
            if (node.nextFalse) traverse(node.nextFalse);
        };

        if (startNode) {
            traverse(startNode.id);
        }

        // Find unreachable nodes
        const unreachable = nodes
            .filter(n => !reachable.has(n.id))
            .map(n => n.id);

        if (unreachable.length > 0) {
            this.warnings.push(`Unreachable nodes: ${unreachable.join(', ')}`);
        }

        return unreachable;
    }

    /**
     * Detect cycles in campaign graph
     * @param {Array} nodes - Campaign nodes
     * @returns {Array} Cycles detected
     */
    detectCycles(nodes) {
        const cycles = [];
        const visiting = new Set();
        const visited = new Set();

        const dfs = (nodeId, path = []) => {
            if (visiting.has(nodeId)) {
                // Found a cycle
                const cycleStart = path.indexOf(nodeId);
                cycles.push(path.slice(cycleStart).concat(nodeId));
                return;
            }
            if (visited.has(nodeId)) return;

            visiting.add(nodeId);
            path.push(nodeId);

            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                if (node.next) dfs(node.next, [...path]);
                if (node.nextTrue) dfs(node.nextTrue, [...path]);
                if (node.nextFalse) dfs(node.nextFalse, [...path]);
            }

            visiting.delete(nodeId);
            visited.add(nodeId);
        };

        nodes.forEach(node => {
            if (!visited.has(node.id)) {
                dfs(node.id);
            }
        });

        if (cycles.length > 0) {
            cycles.forEach(cycle => {
                this.warnings.push(`Cycle detected: ${cycle.join(' → ')}`);
            });
        }

        return cycles;
    }

    /**
     * Get validation result
     * @private
     */
    _getResult() {
        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            hasWarnings: this.warnings.length > 0
        };
    }

    /**
     * Format validation result as string
     * @param {Object} result - Validation result
     * @returns {string}
     */
    static formatResult(result) {
        let output = '';

        if (result.valid) {
            output += '✓ Campaign validation passed\n';
        } else {
            output += '✗ Campaign validation failed\n';
        }

        if (result.errors.length > 0) {
            output += '\nErrors:\n';
            result.errors.forEach(err => {
                output += `  ✗ ${err}\n`;
            });
        }

        if (result.warnings.length > 0) {
            output += '\nWarnings:\n';
            result.warnings.forEach(warn => {
                output += `  ⚠ ${warn}\n`;
            });
        }

        return output;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CampaignValidator;
}
