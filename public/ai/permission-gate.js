/**
 * RedGlitch AI - Permission Gate (KAP)
 * Safety layer that intercepts tool calls and requires user confirmation
 * before executing sensitive actions (write/delete).
 * 
 * CRITICAL SAFETY FEATURES:
 * - File blacklist prevents modification of engine core and critical systems
 * - Action audit logging for transparency
 * - User approval required for all write/delete operations
 * - Integrated with RedGlitchProjectState for undo support
 */

export class PermissionGate {
    // PROTECTED FILES - CANNOT BE MODIFIED BY AI
    static PROTECTED_PATTERNS = [
        /\/engines\/.*\/main\.js$/,                    // Engine cores
        /\/engines\/.*\/strategies\//,                  // Engine strategies
        /\/shared\/SharedProjectState\.js$/,            // State management
        /\/ai\/permission-gate\.js$/,                   // Safety system itself
        /^\/server\.js$/,                               // API server
        /\/server\/routes\/.*\.js$/,                    // Backend API routes
        /\/server\/middleware\/.*\.js$/,                // Backend middleware
        /\/server\/utils\/.*\.js$/,                     // Backend utilities
        /^\/electron-main\.js$/,                        // Electron entry
        /^\/build-game\.js$/,                           // Build system
        /^\/build-adapter\.js$/,                        // Adapter build
        /capacitor\.config\.ts$/,                       // Mobile config
        /package\.json$/,                               // Dependencies (without review)
        /package-lock\.json$/                           // Lock file
    ];

    constructor(config = {}) {
        this.config = config;
        this.auditLog = []; // Track all actions
        this.maxAuditEntries = 1000;
        this.aiActionsStack = []; // AI specific undo stack
        this._modalQueue = Promise.resolve(); // Prevent overlapping permission modals
    }

    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Check if a file path is protected from AI modification
     */
    static canModifyFile(filePath) {
        const segments = String(filePath).replace(/\\/g, '/').split('/');
        const normalized = [];
        for (const segment of segments) {
            if (!segment || segment === '.') continue;
            if (segment === '..') normalized.pop();
            else normalized.push(segment);
        }
        const normalizedPath = `/${normalized.join('/')}`;
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
            args: this._redact(args),
            result: this._redact(result)
        };
        this.auditLog.push(entry);
        if (this.auditLog.length > this.maxAuditEntries) this.auditLog.shift();
        console.log('[AI Audit]', entry);
    }

    _redact(value, key = '') {
        if (/token|secret|api.?key|password|credential|content|code/i.test(key)) return '[REDACTED]';
        if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…[TRUNCATED]` : value;
        if (Array.isArray(value)) return value.slice(0, 50).map((item) => this._redact(item));
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, this._redact(child, childKey)]));
        }
        return value;
    }

    /**
     * Request permission for a tool action with KAP security awareness.
     */
    async requestPermission(toolName, args, requiresConfirmation, plan = null) {
        const safeArgs = args && typeof args === 'object' ? args : {};
        if (!requiresConfirmation) {
            this.logAction('auto-approve', toolName, safeArgs, 'read-only/safe');
            return true;
        }

        if (safeArgs.filePath || safeArgs.path || safeArgs.file) {
            const targetPath = safeArgs.filePath || safeArgs.path || safeArgs.file;
            const canModify = PermissionGate.canModifyFile(targetPath);
            if (!canModify.allowed) {
                this.logAction('blocked', toolName, safeArgs, canModify.reason);
                return this._enqueueModal(() => this._showBlockedModal(toolName, targetPath, canModify.reason).then(() => false));
            }
        }

        const response = await this._enqueueModal(async () => await this._showConfirmationModal(toolName, safeArgs, plan));

        const approved = response === 'approve';
        this.logAction(approved ? 'approve' : 'reject', toolName, safeArgs, response);
        return approved;
    }

    _enqueueModal(task) {
        const run = this._modalQueue
            .then(() => task())
            .catch((err) => {
                console.error('[PermissionGate] Modal queue error:', err);
                return false;
            });
        this._modalQueue = run.then(() => undefined, () => undefined);
        return run;
    }

    /**
     * Record an AI action for auditing and undo integration.
     */
    recordAction(toolName, args, result, undoDescriptor = null) {
        const action = {
            id: `ai_action_${Date.now()}`,
            toolName,
            args,
            result,
            undoDescriptor: undoDescriptor || result?.undoDescriptor || null,
            timestamp: Date.now()
        };

        this.aiActionsStack.push(action);
        
        if (window.RedGlitchProjectState) {
            window.RedGlitchProjectState.logActivity('ai_action', toolName, {
                args,
                actionId: action.id
            });
            
            // If it's a structural change, trigger a state snapshot for undo
            if (action.undoDescriptor || toolName.startsWith('fs.') || toolName.includes('save')) {
                window.RedGlitchProjectState.createUndoPoint();
            }
        }
    }

    /**
     * Show the modal UI with IRAB/Retro theme and Diff view support.
     */
    async _showConfirmationModal(toolName, args, plan = null) {
        let originalContent = null;
        const filePath = args.path || args.file || args.filePath;
        
        // Try to fetch original content if it's a file write
        if (filePath && (toolName === 'fs.write' || toolName.includes('save'))) {
            try {
                const res = await fetch(`/api/ide/read?file=${encodeURIComponent(filePath)}`);
                if (res.ok) originalContent = await res.text();
            } catch (e) {}
        }

        return new Promise((resolve) => {
            let diffHtml = '';
            const proposedCode = args.code || args.content || args.js || (typeof args === 'string' ? args : null);

            if (proposedCode) {
                let code = typeof proposedCode === 'string' ? proposedCode : JSON.stringify(proposedCode, null, 2);
                
                if (originalContent !== null) {
                    diffHtml = `
                        <div class="ai-diff-container side-by-side">
                            <div class="ai-diff-pane">
                                <div class="ai-diff-label">ORIGINAL (${this._escapeHtml(filePath)})</div>
                                <pre class="ai-code-preview original">${this._escapeHtml(originalContent.substring(0, 1000))}${originalContent.length > 1000 ? '...' : ''}</pre>
                            </div>
                            <div class="ai-diff-pane">
                                <div class="ai-diff-label proposed">PROPOSED CHANGES</div>
                                <pre class="ai-code-preview proposed">${this._escapeHtml(code.substring(0, 1000))}${code.length > 1000 ? '...' : ''}</pre>
                            </div>
                        </div>
                    `;
                } else {
                    diffHtml = `
                        <div class="ai-diff-container">
                            <div class="ai-diff-label proposed">PROPOSED CHANGES:</div>
                            <pre class="ai-code-preview proposed">${this._escapeHtml(code.substring(0, 1000))}${code.length > 1000 ? '...' : ''}</pre>
                        </div>
                    `;
                }
            }

            const modal = document.createElement('div');
            modal.id = 'ai-permission-gate';
            modal.className = 'ai-permission-modal';
            modal.innerHTML = `
                <div class="ai-permission-content irab-styled">
                    <div class="ai-modal-header">
                        <span class="ai-modal-title">🧠 IRAB PERMISSION REQUEST</span>
                        <span class="ai-security-tag high">SECURITY: ACTION REQUIRED</span>
                    </div>
                    
                    <div class="ai-permission-details">
                        <div class="ai-action-summary">
                            IRAB wants to use <strong>${this._escapeHtml(toolName)}</strong>
                        </div>
                        
                        <p>${this._escapeHtml(plan?.summary || 'Project mutation requested.')}</p>
                        ${diffHtml || `<pre>${this._escapeHtml(JSON.stringify(plan?.proposed || args, null, 2))}</pre>`}
                        
                        <div class="ai-permission-warning">
                            THIS ACTION MAY MODIFY YOUR PROJECT FILES.
                        </div>
                    </div>
                    
                    <div class="ai-permission-actions">
                        <button id="ai-reject-btn" class="ai-btn-danger">DENY</button>
                        <button id="ai-approve-btn" class="ai-btn-primary">APPROVE & EXECUTE</button>
                    </div>
                </div>
            `;
            
            this._ensureStyles();
            document.body.appendChild(modal);

            modal.querySelector('#ai-reject-btn').onclick = () => { document.body.removeChild(modal); resolve('reject'); };
            modal.querySelector('#ai-approve-btn').onclick = () => { document.body.removeChild(modal); resolve('approve'); };
        });
    }

    _showBlockedModal(toolName, filePath, reason) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.id = 'ai-permission-gate';
            modal.className = 'ai-permission-modal';
            modal.innerHTML = `
                <div class="ai-permission-content irab-styled ai-blocked">
                    <div class="ai-modal-header">
                        <span class="ai-modal-title">🚫 ACTION BLOCKED</span>
                    </div>
                    <div class="ai-permission-details">
                        <p><strong>Tool:</strong> ${this._escapeHtml(toolName)}</p>
                        <p><strong>Target:</strong> ${this._escapeHtml(filePath)}</p>
                        <p class="ai-block-reason">${this._escapeHtml(reason)}</p>
                    </div>
                    <div class="ai-permission-actions">
                        <button id="ai-ok-btn" class="ai-btn-primary">UNDERSTOOD</button>
                    </div>
                </div>
            `;
            this._ensureStyles();
            document.body.appendChild(modal);
            modal.querySelector('#ai-ok-btn').onclick = () => { document.body.removeChild(modal); resolve(); };
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
                    pointer-events: auto !important;
                }
                .ai-permission-content.irab-styled {
                    background: #080c18; border: 2px solid #ff0000; padding: 0;
                    width: 95%; max-width: 900px; color: #cfd8dc; 
                    box-shadow: 0 0 30px rgba(255, 0, 0, 0.2);
                    display: flex; flex-direction: column;
                    max-height: 95vh; overflow: hidden;
                }
                .ai-modal-header {
                    background: #ff0000; color: #000; padding: 10px 15px;
                    display: flex; justify-content: space-between; align-items: center;
                    font-weight: bold; font-size: 1.1em;
                    flex-shrink: 0;
                }
                .ai-security-tag {
                    font-size: 0.8em; padding: 2px 6px; background: #000; color: #ff0000;
                    border-radius: 2px;
                }
                .ai-permission-details { 
                    padding: 20px; 
                    overflow-y: auto;
                    flex-grow: 1;
                }
                .ai-action-summary { font-size: 1.3em; margin-bottom: 15px; border-bottom: 1px solid #1f2b42; padding-bottom: 10px; }
                .ai-permission-details pre {
                    background: #000; padding: 12px; border: 1px solid #1f2b42;
                    max-height: 400px; overflow-y: auto; color: #2ecc71; font-size: 14px;
                    white-space: pre-wrap; word-break: break-all;
                }
                .ai-diff-container { margin-bottom: 15px; }
                .ai-diff-container.side-by-side {
                    display: flex; gap: 10px;
                }
                .ai-diff-pane {
                    flex: 1; min-width: 0;
                }
                .ai-diff-label { font-size: 0.9em; color: #888; margin-bottom: 5px; text-transform: uppercase; }
                .ai-diff-label.proposed { color: #ff0000; }
                .ai-code-preview { border-left: 3px solid #333 !important; }
                .ai-code-preview.original { border-left: 3px solid #e74c3c !important; opacity: 0.7; }
                .ai-code-preview.proposed { border-left: 3px solid #2ecc71 !important; }
                .ai-permission-warning {
                    margin-top: 15px; color: #e74c3c; font-size: 0.9em; text-align: center;
                    background: rgba(231, 76, 60, 0.1); padding: 8px; border: 1px dashed #e74c3c;
                }
                .ai-permission-actions {
                    display: flex; gap: 2px; padding: 10px; background: #020408;
                    justify-content: stretch;
                    flex-shrink: 0;
                }
                .ai-permission-actions button {
                    flex: 1; border: 1px solid #333; padding: 12px; cursor: pointer;
                    font-family: inherit; font-size: 1.1em; transition: all 0.1s;
                    pointer-events: auto !important;
                }
                .ai-btn-primary { background: #ff0000; color: #000; font-weight: bold; border-color: #ff0000 !important; }
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
