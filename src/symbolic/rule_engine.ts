export class RuleEngine {
    /**
     * Evaluates a simple condition expression against a context object.
     * Supports basic operators: >, <, ==, >=, <=, !=
     * Format: "variable operator value" e.g., "deal_amount > 10000"
     */
    evaluateCondition(expression: string, context: Record<string, any>): boolean {
        try {
            // Very simple parser for deterministic evaluation without eval()
            const parts = expression.trim().split(/\s+/);
            if (parts.length === 3) {
                const [varName, op, valStr] = parts;

                let contextValue = context[varName];

                // Allow dot notation lookup
                if (varName.includes('.')) {
                    contextValue = varName.split('.').reduce((obj, key) => (obj && typeof obj[key] !== 'undefined') ? obj[key] : undefined, context);
                }

                if (contextValue === undefined) {
                    console.warn(`[RuleEngine] Variable ${varName} not found in context.`);
                    return false;
                }

                // Try to parse values as numbers if they look like numbers
                let val: any = valStr;
                if (!isNaN(Number(valStr))) {
                    val = Number(valStr);
                } else if (valStr === 'true' || valStr === 'false') {
                    val = valStr === 'true';
                } else if (valStr.startsWith('"') && valStr.endsWith('"') || valStr.startsWith("'") && valStr.endsWith("'")) {
                    val = valStr.slice(1, -1);
                }

                let ctxVal: any = contextValue;
                if (!isNaN(Number(ctxVal)) && typeof val === 'number') {
                    ctxVal = Number(ctxVal);
                }

                switch (op) {
                    case '>': return ctxVal > val;
                    case '<': return ctxVal < val;
                    case '>=': return ctxVal >= val;
                    case '<=': return ctxVal <= val;
                    case '==':
                    case '===': return ctxVal === val;
                    case '!=':
                    case '!==': return ctxVal !== val;
                    default:
                        console.warn(`[RuleEngine] Unsupported operator: ${op}`);
                        return false;
                }
            } else if (parts.length === 1) {
                // Truthy check (handle dot notation)
                const varName = parts[0];
                let contextValue = context[varName];
                if (varName.includes('.')) {
                    contextValue = varName.split('.').reduce((obj, key) => (obj && typeof obj[key] !== 'undefined') ? obj[key] : undefined, context);
                }
                return !!contextValue;
            }

            console.warn(`[RuleEngine] Invalid expression format: ${expression}`);
            return false;
        } catch (error) {
            console.error(`[RuleEngine] Evaluation error:`, error);
            return false;
        }
    }

    /**
     * Resolves template strings using the context.
     * Replaces {{variable.path}} with the value from context.
     */
    resolveTemplate(template: string | Record<string, any>, context: Record<string, any>): any {
        if (typeof template === 'string') {
            return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
                const value = path.trim().split('.').reduce((obj: any, key: any) => (obj && typeof obj[key] !== 'undefined') ? obj[key] : undefined, context);
                return value !== undefined ? String(value) : match;
            });
        }

        if (Array.isArray(template)) {
            return template.map(item => this.resolveTemplate(item, context));
        }

        if (typeof template === 'object' && template !== null) {
            const resolved: Record<string, any> = {};
            for (const [key, value] of Object.entries(template)) {
                resolved[key] = this.resolveTemplate(value, context);
            }
            return resolved;
        }

        return template;
    }
}
