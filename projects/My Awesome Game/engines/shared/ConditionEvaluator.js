/**
 * ConditionEvaluator - Evaluates logic conditions for game events
 * Used for conditional exits, dialogue branches, and quest triggers.
 */
class ConditionEvaluator {
    /**
     * Evaluate a condition against a context (variables/flags)
     * @param {Object} condition - { type: 'variable', key: 'score', operator: '>=', value: 1000 }
     * @param {Object} context - { variables: {}, flags: {} }
     * @returns {boolean}
     */
    static evaluate(condition, context) {
        if (!condition) return true; // No condition = true

        // 1. Variable Check
        if (condition.type === 'variable' || !condition.type) {
            const key = condition.key;
            const val = context.variables ? (context.variables[key] || 0) : 0;
            const target = condition.value;
            const op = condition.operator || '==';

            switch (op) {
                case '==': return val == target;
                case '!=': return val != target;
                case '>': return val > target;
                case '>=': return val >= target;
                case '<': return val < target;
                case '<=': return val <= target;
                default: return false;
            }
        }

        // 2. Flag Check
        if (condition.type === 'flag') {
            const key = condition.key;
            const val = context.flags ? !!context.flags[key] : false;
            const target = condition.value !== false; // Default true
            return val === target;
        }

        // 3. Item Check (inventory)
        if (condition.type === 'item') {
            // Context needs inventory array or check function
            // This requires the context to have an 'hasItem' function or inventory array
            if (context.hasItem) {
                return context.hasItem(condition.key, condition.count || 1);
            }
            return false;
        }

        // 4. Logic Groups (AND/OR)
        if (condition.type === 'AND' && condition.conditions) {
            return condition.conditions.every(c => ConditionEvaluator.evaluate(c, context));
        }
        if (condition.type === 'OR' && condition.conditions) {
            return condition.conditions.some(c => ConditionEvaluator.evaluate(c, context));
        }

        return false;
    }
}

window.ConditionEvaluator = ConditionEvaluator;
if (typeof module !== 'undefined') module.exports = ConditionEvaluator;