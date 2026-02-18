/**
 * Ketebe AI - Permission Gate (KAP)
 * Safety layer that intercepts tool calls and requires user confirmation
 * before executing sensitive actions (write/delete).
 * 
 * CRITICAL SAFETY FEATURES:
 * - File blacklist prevents modification of engine core and critical systems
 * - Action audit logging for transparency
 * - User approval required for all write/delete operations
 * - Integrated with KetebeProjectState for undo support
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
        this.aiActionsStack = []; // AI specific undo stack
    }

    /**
     * Check if a file path is protected from AI modification
     */
    static canModifyFile(filePath) {
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
        if (this.auditLog.length > this.maxAuditEntries) this.auditLog.shift();
        console.log('[AI Audit]', entry);
    }

    /**
     * Request permission for a tool action with KAP security awareness.
     */
    async requestPermission(toolName, args, requiresConfirmation) {
        if (!requiresConfirmation) {
            this.logAction('auto-approve', toolName, args, 'read-only/safe');
            return true;
        }

        if (args.filePath || args.path || args.file) {
            const targetPath = args.filePath || args.path || args.file;
            const canModify = PermissionGate.canModifyFile(targetPath);
            if (!canModify.allowed) {
                this.logAction('blocked', toolName, args, canModify.reason);
                await this._showBlockedModal(toolName, targetPath, canModify.reason);
                return false;
            }
        }

        if (this.alwaysAllowSession.has(toolName)) {
            this.logAction('auto-approve', toolName, args, 'session-allowed');
            return true;
        }

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
     * Record an AI action for auditing and undo integration.
     */
    recordAction(toolName, args, result, undoFn = null) {
        const action = {
            id: `ai_action_${Date.now()}`,
            toolName,
            args,
            result,
            undoFn,
            timestamp: Date.now()
        };

        this.aiActionsStack.push(action);
        
        if (window.KetebeProjectState) {
            window.KetebeProjectState.logActivity('ai_action', toolName, {
                args,
                actionId: action.id
            });
            
            // If it's a structural change, trigger a state snapshot for undo
            if (undoFn || toolName.startsWith('fs.') || toolName.includes('save')) {
                window.KetebeProjectState.createUndoPoint();
            }
        }
    }

    /**
     * Show the modal UI with IRAB/Retro theme and Diff view support.
     */
    _showConfirmationModal(toolName, args) {
        return new Promise((resolve) => {
            let diffHtml = '';
            if (args.code || args.content || args.js) {
                const code = args.code || args.content || args.js;
                diffHtml = `
                    <div class="ai-diff-container">
                        <div class="ai-diff-label">PROPOSED CHANGES:</div>
                        <pre class="ai-code-preview">${code.substring(0, 500)}${code.length > 500 ? '...' : ''}</pre>
                    </div>
                `;
            }

            const modal = document.createElement('div');
            modal.className = 'ai-permission-modal';
            modal.innerHTML = `
                <div class="ai-permission-content irab-styled">
                    <div class="ai-modal-header">
                        <span class="ai-modal-title">🧠 IRAB PERMISSION REQUEST</span>
                        <span class="ai-security-tag high">SECURITY: ACTION REQUIRED</span>
                    </div>
                    
                    <div class="ai-permission-details">
                        <div class="ai-action-summary">
                            IRAB wants to use <strong>${toolName}</strong>
                        </div>
                        
                        ${diffHtml || `<pre>${JSON.stringify(args, null, 2)}</pre>`}
                        
                        <div class="ai-permission-warning">
                            THIS ACTION MAY MODIFY YOUR PROJECT FILES.
                        </div>
                    </div>
                    
                    <div class="ai-permission-actions">
                        <button id="ai-reject-btn" class="ai-btn-danger">DENY</button>
                        <button id="ai-always-btn" class="ai-btn-secondary">ALWAYS ALLOW</button>
                        <button id="ai-approve-btn" class="ai-btn-primary">APPROVE & EXECUTE</button>
                    </div>
                </div>
            `;
            
            this._ensureStyles();
            document.body.appendChild(modal);

            document.getElementById('ai-reject-btn').onclick = () => { document.body.removeChild(modal); resolve('reject'); };
            document.getElementById('ai-approve-btn').onclick = () => { document.body.removeChild(modal); resolve('approve'); };
            document.getElementById('ai-always-btn').onclick = () => { document.body.removeChild(modal); resolve('always'); };
        });
    }

    _showBlockedModal(toolName, filePath, reason) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'ai-permission-modal';
            modal.innerHTML = `
                <div class="ai-permission-content irab-styled ai-blocked">
                    <div class="ai-modal-header">
                        <span class="ai-modal-title">🚫 ACTION BLOCKED</span>
                    </div>
                    <div class="ai-permission-details">
                        <p><strong>Tool:</strong> ${toolName}</p>
                        <p><strong>Target:</strong> ${filePath}</p>
                        <p class="ai-block-reason">${reason}</p>
                    </div>
                    <div class="ai-permission-actions">
                        <button id="ai-ok-btn" class="ai-btn-primary">UNDERSTOOD</button>
                    </div>
                </div>
            `;
            this._ensureStyles();
            document.body.appendChild(modal);
            document.getElementById('ai-ok-btn').onclick = () => { document.body.removeChild(modal); resolve(); };
        });
    }

    _ensureStyles() {
        if (!document.getElementById('ai-permission-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-permission-styles';
            style.textContent = `
                .ai-permission-modal {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.85); z-index: 2000000;
                    display: flex; justify-content: center; align-items: center;
                    font-family: 'VT323', monospace; letter-spacing: 1px;
                }
                .ai-permission-content.irab-styled {
                    background: #080c18; border: 2px solid #f1c40f; padding: 0;
                    width: 550px; color: #cfd8dc; box-shadow: 0 0 30px rgba(241, 196, 15, 0.2);
                    display: flex; flex-direction: column;
                }
                .ai-modal-header {
                    background: #f1c40f; color: #000; padding: 10px 15px;
                    display: flex; justify-content: space-between; align-items: center;
                    font-weight: bold; font-size: 1.1em;
                }
                .ai-security-tag {
                    font-size: 0.8em; padding: 2px 6px; background: #000; color: #f1c40f;
                    border-radius: 2px;
                }
                .ai-permission-details { padding: 20px; }
                .ai-action-summary { font-size: 1.3em; margin-bottom: 15px; border-bottom: 1px solid #1f2b42; padding-bottom: 10px; }
                .ai-permission-details pre {
                    background: #000; padding: 12px; border: 1px solid #1f2b42;
                    max-height: 250px; overflow-y: auto; color: #2ecc71; font-size: 14px;
                }
                .ai-diff-container { margin-bottom: 15px; }
                .ai-diff-label { font-size: 0.9em; color: #f1c40f; margin-bottom: 5px; }
                .ai-code-preview { border-left: 3px solid #2ecc71 !important; }
                .ai-permission-warning {
                    margin-top: 15px; color: #e74c3c; font-size: 0.9em; text-align: center;
                    background: rgba(231, 76, 60, 0.1); padding: 8px; border: 1px dashed #e74c3c;
                }
                .ai-permission-actions {
                    display: flex; gap: 2px; padding: 10px; background: #020408;
                    justify-content: stretch;
                }
                .ai-permission-actions button {
                    flex: 1; border: 1px solid #333; padding: 12px; cursor: pointer;
                    font-family: inherit; font-size: 1.1em; transition: all 0.1s;
                }
                .ai-btn-primary { background: #f1c40f; color: #000; font-weight: bold; border-color: #f1c40f !important; }
                .ai-btn-danger { background: #1a0a0a; color: #e74c3c; }
                .ai-btn-secondary { background: #121a2b; color: #8fa0bc; }
                .ai-btn-primary:hover { background: #fff; transform: translateY(-2px); }
                .ai-btn-danger:hover { background: #e74c3c; color: #fff; }
                .ai-btn-secondary:hover { background: #1f2b42; color: #fff; }
                .ai-blocked .ai-modal-header { background: #e74c3c; color: #fff; }
                .ai-block-reason { color: #e74c3c; font-weight: bold; margin-top: 10px; }
            `;
            document.head.appendChild(style);
        }
    }
}
