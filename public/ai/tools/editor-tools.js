/**
 * RedGlitch AI - Editor Tools
 * Safe automation layer for interacting with studio editors
 * All write operations go through PermissionGate
 */

import { PermissionGate } from '../permission-gate.js';
import { editorFileForTarget, normalizeEditorTarget } from '../tool-aliases.mjs';

export class EditorTools {
    constructor(permissionGate) {
        this.permissionGate = permissionGate || new PermissionGate();
        this.currentEditor = null;
    }

    /**
     * SAFE NAVIGATION ACTIONS (No permission needed)
     */

    /**
     * Open a specific editor
     * @param {string} editorName - Name of editor (e.g., 'npc', 'quest', 'dialogue')
     */
    async openEditor(editorName) {
        const target = normalizeEditorTarget(editorName);
        const editorFile = editorFileForTarget(target);
        if (!editorFile) {
            throw new Error(`Unknown editor: ${editorName}`);
        }

        // Safe navigation - just load the page
        if (typeof loadEditor === 'function') {
            loadEditor(editorFile);
        } else {
            window.location.href = editorFile;
        }
        
        this.currentEditor = target;
        return { success: true, editor: target };
    }

    /**
     * Get current editor context
     */
    getCurrentEditor() {
        return this.currentEditor;
    }

    /**
     * Get current project name
     */
    getCurrentProject() {
        const projectState =
            window.RedGlitchProjectState ||
            (typeof SharedProjectState !== 'undefined' ? SharedProjectState : null);
        if (projectState?.currentProject) return projectState.currentProject;
        if (projectState?.projectName) return projectState.projectName;
        return window.localStorage?.getItem('currentProject') || 'Default Project';
    }

    /**
     * WRITE ACTIONS (Require permission)
     */

    /**
     * Fill a form field (requires permission)
     * @param {string} fieldId - ID of the field
     * @param {any} value - Value to set
     */
    async fillField(fieldId, value) {
        const preview = `Set field "${fieldId}" to: ${JSON.stringify(value)}`;
        const allowed = await this.permissionGate.requestPermission(
            'fillField',
            { fieldId, value, preview },
            true
        );

        if (!allowed) {
            return { success: false, reason: 'Permission denied' };
        }

        const field = document.getElementById(fieldId);
        if (!field) {
            return { success: false, reason: `Field "${fieldId}" not found` };
        }

        field.value = value;
        
        // Trigger change event
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('input', { bubbles: true }));

        return { success: true, fieldId, value };
    }

    /**
     * Click a button (requires permission for dangerous actions)
     * @param {string} buttonId - ID of the button
     * @param {boolean} isDangerous - Whether this is a destructive action
     */
    async clickButton(buttonId, isDangerous = false) {
        const button = document.getElementById(buttonId);
        if (!button) {
            return { success: false, reason: `Button "${buttonId}" not found` };
        }

        if (isDangerous) {
            const preview = `Click button: "${button.textContent || buttonId}"`;
            const allowed = await this.permissionGate.requestPermission(
                'clickButton',
                { buttonId, preview },
                true
            );

            if (!allowed) {
                return { success: false, reason: 'Permission denied' };
            }
        }

        button.click();
        return { success: true, buttonId };
    }

    /**
     * Create a new asset (requires permission)
     * @param {string} assetType - Type of asset (npc, quest, item, etc.)
     * @param {object} data - Asset data
     */
    async createAsset(assetType, data) {
        const preview = `Create new ${assetType}:\n${JSON.stringify(data, null, 2)}`;
        const allowed = await this.permissionGate.requestPermission(
            'createAsset',
            { assetType, data, preview },
            true
        );

        if (!allowed) {
            return { success: false, reason: 'Permission denied' };
        }

        const eventBus = window.RedGlitchEventBus || (typeof EventBus !== 'undefined' ? EventBus : null);
        if (eventBus?.emit) eventBus.emit(`asset:create:${assetType}`, data);

        // Also set dirty flag
        const projectState =
            window.RedGlitchProjectState ||
            (typeof SharedProjectState !== 'undefined' ? SharedProjectState : null);
        if (projectState?.setDirty) projectState.setDirty(true);

        return { success: true, assetType, data };
    }

    /**
     * Save current editor state (requires permission)
     */
    async saveEditor() {
        const preview = `Save changes in ${this.currentEditor || 'current editor'}`;
        const allowed = await this.permissionGate.requestPermission(
            'saveEditor',
            { editor: this.currentEditor, preview },
            true
        );

        if (!allowed) {
            return { success: false, reason: 'Permission denied' };
        }

        // Try to find and click save button
        const saveBtn = document.getElementById('saveBtn') || 
                       document.querySelector('[data-action="save"]') ||
                       document.querySelector('button[onclick*="save"]');

        if (saveBtn) {
            saveBtn.click();
            return { success: true };
        }

        // Or emit save event
        const eventBus = window.RedGlitchEventBus || (typeof EventBus !== 'undefined' ? EventBus : null);
        if (eventBus?.emit) {
            eventBus.emit('editor:save');
            return { success: true };
        }

        return { success: false, reason: 'No save mechanism found' };
    }

    /**
     * Load project data (read-only, no permission needed)
     * @param {string} dataPath - Path relative to project
     */
    async loadProjectData(dataPath) {
        const projectName = this.getCurrentProject();
        const fullPath = `projects/${projectName}/${dataPath}`;

        try {
            const response = await fetch(fullPath);
            if (!response.ok) {
                return { success: false, reason: `Failed to load: ${response.statusText}` };
            }
            const data = await response.json();
            return { success: true, data };
        } catch (error) {
            return { success: false, reason: error.message };
        }
    }

    /**
     * BUILD & EXPORT ACTIONS
     */

    /**
     * Build game for platform (requires permission)
     * @param {string} platform - 'electron', 'android', or 'all'
     */
    async buildGame(platform = 'all') {
        const preview = `Build game for ${platform}\nThis will:\n- Bundle game assets\n- Create executable/package\n- Take 2-3 minutes`;
        const allowed = await this.permissionGate.requestPermission(
            'buildGame',
            { platform, preview },
            true
        );

        if (!allowed) {
            return { success: false, reason: 'Permission denied' };
        }

        // Trigger build (implementation depends on launcher setup)
        if (typeof window.triggerBuild === 'function') {
            window.triggerBuild(platform);
            return { success: true, platform, message: 'Build started' };
        }

        return { success: false, reason: 'Build system not available' };
    }

    /**
     * UTILITY FUNCTIONS
     */

    /**
     * Get list of available editors
     */
    getAvailableEditors() {
        return [
            'npc', 'quest', 'dialogue', 'script', 'item', 'enemy',
            'character', 'skill', 'achievement', 'cutscene', 'campaign',
            'menu', 'logic', 'algorithm', 'behavior', 'prefab',
            'localization', 'iso', 'isopixel', 'isometric', 'isostudio', 'isopixelstudio', 'pixel', 'fx', 'background',
            'shader', 'input'
        ];
    }

    /**
     * Preview an action without executing it
     * @param {string} action - Action name
     * @param {object} params - Action parameters
     */
    previewAction(action, params) {
        const previews = {
            fillField: `Set "${params.fieldId}" = ${JSON.stringify(params.value)}`,
            clickButton: `Click button: ${params.buttonId}`,
            createAsset: `Create ${params.assetType}: ${params.data?.name || 'unnamed'}`,
            saveEditor: `Save changes in ${this.currentEditor}`,
            buildGame: `Build for ${params.platform}`
        };

        return previews[action] || `Execute ${action} with ${JSON.stringify(params)}`;
    }
}
