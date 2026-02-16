/**
 * Ketebe AI - Permission Gate
 * Safety layer that intercepts tool calls and requires user confirmation
 * before executing sensitive actions (write/delete).
 * 
 * CRITICAL SAFETY FEATURES:
 * - File blacklist prevents modification of engine core and critical systems
 * - Action audit logging for transparency
 * - User approval required for all write/delete operations
 */

export class PermissionGate {
    // PROTECTED FILES - CANNOT BE MODIFIED BY AI
    static PROTECTED_PATTERNS = [
        /\/engines\/.*\/main\.js$/,                    // Engine cores
        /\/engines\/.*\/strategies\//,                  // Engine strategies
        /\/shared\/SharedProjectState\.js$/,            // State management
        /\/ai\/permission-gate\.js$/,                   // Safety system itself
        /^\/server\.js$/,                               // API server
        /^\/electron-main\.js$/,                        // Electron entry
        /^\/build-game\.js$/,                           // Build system
        /^\/build-adapter\.js$/,                        // Adapter build
        /capacitor\.config\.ts$/,                       // Mobile config
        /package\.json$/,                               // Dependencies (without review)
        /package-lock\.json$/                           // Lock file
    ];

    constructor(config = {}) {
        this.alwaysAllowSession = new Set(); // Tools allowed for this session
        this.config = config;
        this.auditLog = []; // Track all actions
        this.maxAuditEntries = 1000;
    }

    /**
     * Check if a file path is protected from AI modification
     * @param {string} filePath - Path to check
     * @returns {{allowed: boolean, reason?: string}}
     */
    static canModifyFile(filePath) {
        // Normalize path for comparison
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        for (const pattern of PermissionGate.PROTECTED_PATTERNS) {
            if (pattern.test(normalizedPath)) {
                return {
                    allowed: false,
                    reason: '🔒 CRITICAL SYSTEM FILE - Cannot be modified by AI for safety'
                };
            }
        }
        
        return { allowed: true };
    }

    /**
     * Log an action to the audit trail
     * @param {string} action - Action type (approve/reject)
     * @param {string} toolName - Tool that was invoked
     * @param {object} args - Tool arguments
     * @param {string} result - Outcome
     */
    logAction(action, toolName, args, result) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            toolName,
            args,
            result
        };
        
        this.auditLog.push(entry);
        
        // Keep audit log size manageable
        if (this.auditLog.length > this.maxAuditEntries) {
            this.auditLog.shift();
        }
        
        // Also log to console for debugging
        console.log('[AI Audit]', entry);
    }

    /**
     * Get audit log entries
     * @param {number} limit - Max entries to return
     * @returns {Array}
     */
    getAuditLog(limit = 50) {
        return this.auditLog.slice(-limit);
    }

    /**
     * Clear audit log (admin only)
     */
    clearAuditLog() {
        this.auditLog = [];
        console.log('[AI Audit] Log cleared');
    }

    /**
     * Request permission for a tool action.
     * @param {string} toolName
     * @param {object} args
     * @param {boolean} requiresConfirmation
     * @returns {Promise<boolean>}
     */
    async requestPermission(toolName, args, requiresConfirmation) {
        // Read-only tools usually don't need confirmation, unless configured otherwise
        if (!requiresConfirmation) {
            this.logAction('auto-approve', toolName, args, 'read-only');
            return true;
        }

        // Check for protected file access
        if (args.filePath || args.path || args.file) {
            const targetPath = args.filePath || args.path || args.file;
            const canModify = PermissionGate.canModifyFile(targetPath);
            
            if (!canModify.allowed) {
                this.logAction('blocked', toolName, args, canModify.reason);
                await this._showBlockedModal(toolName, targetPath, canModify.reason);
                return false;
            }
        }

        // Check if user already authorized this tool for the session
        if (this.alwaysAllowSession.has(toolName)) {
            this.logAction('auto-approve', toolName, args, 'session-allowed');
            return true;
        }

        // Show confirmation modal
        const response = await this._showConfirmationModal(toolName, args);
        
        if (response === 'always') {
            this.alwaysAllowSession.add(toolName);
            this.logAction('approve', toolName, args, 'session-allowed-granted');
            return true;
        }

        const approved = response === 'approve';
        this.logAction(approved ? 'approve' : 'reject', toolName, args, response);
        return approved;
    }

    /**
     * Show blocked action modal (cannot be overridden)
     * @private
     */
    _showBlockedModal(toolName, filePath, reason) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'ai-permission-modal';
            modal.innerHTML = `
                <div class="ai-permission-content ai-blocked">
                    <h3>🚫 Action Blocked</h3>
                    <div class="ai-permission-details">
                        <p><strong>Tool:</strong> ${toolName}</p>
                        <p><strong>Target:</strong> ${filePath}</p>
                        <p class="ai-block-reason">${reason}</p>
                        <p style="margin-top: 15px; font-size: 0.9em; color: #888;">
                            This file is critical to the engine and cannot be modified by AI.
                            If you need to change it, please edit it manually.
                        </p>
                    </div>
                    <div class="ai-permission-actions">
                        <button id="ai-ok-btn" class="ai-btn-primary">OK</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const cleanup = () => {
                document.body.removeChild(modal);
                resolve();
            };
            
            document.getElementById('ai-ok-btn').onclick = cleanup;
        });
    }

    /**
     * Show the modal UI.
     * @private
     */
    _showConfirmationModal(toolName, args) {
        return new Promise((resolve) => {
            // Create modal DOM
            const modal = document.createElement('div');
            modal.className = 'ai-permission-modal';
            modal.innerHTML = `
                <div class="ai-permission-content">
                    <h3>⚠️ AI Requesting Action</h3>
                    <div class="ai-permission-details">
                        <p><strong>Tool:</strong> ${toolName}</p>
                        <pre>${JSON.stringify(args, null, 2)}</pre>
                    </div>
                    <div class="ai-permission-actions">
                        <button id="ai-reject-btn" class="ai-btn-danger">Reject</button>
                        <button id="ai-approve-btn" class="ai-btn-primary">Approve</button>
                        <button id="ai-always-btn" class="ai-btn-secondary">Always Allow (Session)</button>
                    </div>
                </div>
            `;
            
            // Add basic styles if not present
            if (!document.getElementById('ai-permission-styles')) {
                const style = document.createElement('style');
                style.id = 'ai-permission-styles';
                style.textContent = `
                    .ai-permission-modal {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(0,0,0,0.8); z-index: 10000;
                        display: flex; justify-content: center; align-items: center;
                    }
                    .ai-permission-content {
                        background: #252526; border: 1px solid #454545; padding: 20px;
                        border-radius: 8px; width: 500px; color: #fff; font-family: monospace;
                    }
                    .ai-permission-content.ai-blocked {
                        border: 2px solid #ce3838;
                    }
                    .ai-permission-details pre {
                        background: #1e1e1e; padding: 10px; overflow: auto; max-height: 200px;
                    }
                    .ai-block-reason {
                        background: #3a1f1f; border-left: 3px solid #ce3838; 
                        padding: 10px; margin-top: 10px; color: #ff6b6b;
                    }
                    .ai-permission-actions {
                        display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;
                    }
                    .ai-btn-primary { background: #007acc; color: white; border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; }
                    .ai-btn-danger { background: #ce3838; color: white; border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; }
                    .ai-btn-secondary { background: #3c3c3c; color: white; border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; }
                    .ai-btn-primary:hover { background: #005a9e; }
                    .ai-btn-danger:hover { background: #a02828; }
                    .ai-btn-secondary:hover { background: #2a2a2a; }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(modal);

            const cleanup = () => {
                document.body.removeChild(modal);
            };

            document.getElementById('ai-reject-btn').onclick = () => {
                cleanup();
                resolve('reject');
            };

            document.getElementById('ai-approve-btn').onclick = () => {
                cleanup();
                resolve('approve');
            };

            document.getElementById('ai-always-btn').onclick = () => {
                cleanup();
                resolve('always');
            };
        });
    }
}
