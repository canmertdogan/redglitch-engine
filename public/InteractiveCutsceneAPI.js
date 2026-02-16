// InteractiveCutsceneAPI.js - API connections for Interactive Cutscene System
// Phase 1: Establishing API connections to Algorithm Studio and Campaign Editor

window.InteractiveCutsceneAPI = class InteractiveCutsceneAPI {
    constructor() {
        this.endpoints = {
            algorithmStudio: '/api/algorithm-studio',
            campaignEditor: '/api/campaign',
            dialogueSystem: '/api/dialogue',
            saveSystem: '/api/save'
        };
        
        this.connections = {
            algorithmStudio: false,
            campaignEditor: false
        };
        
        this.init();
    }
    
    async init() {
        console.log("Initializing Interactive Cutscene API connections");
        await this.checkConnections();
    }
    
    async checkConnections() {
        // Check Algorithm Studio connection
        try {
            const response = await fetch(`${this.endpoints.algorithmStudio}/status`, { method: 'HEAD' });
            this.connections.algorithmStudio = response.ok;
        } catch (error) {
            this.connections.algorithmStudio = false;
        }
        
        // Check Campaign Editor connection
        try {
            const response = await fetch(`${this.endpoints.campaignEditor}/status`, { method: 'HEAD' });
            this.connections.campaignEditor = response.ok;
        } catch (error) {
            this.connections.campaignEditor = false;
        }
        
        console.log("API Connection Status:", this.connections);
    }
    
    // Campaign Editor Integration Methods
    async getCampaignNodes() {
        try {
            const response = await fetch('/dunyalar/definitions/campaign.json');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error("Error fetching campaign nodes:", error);
        }
        return [];
    }
    
    async exportToCampaign(cutsceneData, options = {}) {
        const campaignNode = {
            id: `cutscene_${cutsceneData.id}`,
            type: 'interactive_cutscene',
            name: cutsceneData.name,
            cutsceneId: cutsceneData.id,
            variables: options.exportVariables || [],
            outcomes: this.generateCutsceneOutcomes(cutsceneData),
            metadata: {
                created: new Date().toISOString(),
                editor: 'interactive_cutscene'
            }
        };
        
        console.log("Exporting to Campaign Editor:", campaignNode);
        
        // TODO: Actual API call to campaign editor
        // For now, just return the node structure
        return campaignNode;
    }
    
    generateCutsceneOutcomes(cutsceneData) {
        const outcomes = [];
        
        // Analyze branches for possible outcomes
        Object.keys(cutsceneData.branches || {}).forEach(branchId => {
            outcomes.push({
                branchId: branchId,
                condition: `cutscene_${cutsceneData.id}_branch_${branchId}`,
                nextNode: null // To be connected in campaign editor
            });
        });
        
        // Analyze variables that could affect campaign
        if (cutsceneData.variables) {
            cutsceneData.variables.forEach(variable => {
                if (variable.type === 'boolean') {
                    outcomes.push({
                        variable: variable.name,
                        condition: `${variable.name} == true`,
                        nextNode: null
                    });
                }
            });
        }
        
        return outcomes;
    }
    
    async syncWithCampaign(cutsceneData) {
        const campaignNodes = await this.getCampaignNodes();
        const relatedNodes = campaignNodes.filter(node => 
            node.type === 'dialogue' || 
            node.type === 'cutscene' ||
            (node.cutsceneId && node.cutsceneId === cutsceneData.id)
        );
        
        console.log("Related campaign nodes:", relatedNodes);
        return relatedNodes;
    }
    
    // Algorithm Studio Integration Methods (Placeholder for Phase 6)
    async generateDialogue(context) {
        if (!this.connections.algorithmStudio) {
            console.warn("Algorithm Studio not connected - using fallback");
            return this.generateFallbackDialogue(context);
        }
        
        try {
            const response = await fetch(`${this.endpoints.algorithmStudio}/generate-dialogue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(context)
            });
            
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error("Error generating dialogue:", error);
        }
        
        return this.generateFallbackDialogue(context);
    }
    
    generateFallbackDialogue(context) {
        // Fallback dialogue generation for when Algorithm Studio is not available
        const templates = [
            "What should I do about {situation}?",
            "I wonder if {context} is the right choice...",
            "This reminds me of {reference}."
        ];
        
        const template = templates[Math.floor(Math.random() * templates.length)];
        return {
            text: template.replace(/{(\w+)}/g, (match, key) => context[key] || match),
            choices: [
                { text: "Continue", action: "resume_timeline" },
                { text: "Think more", action: "dialogue_continue", target: "thinking_dialogue" }
            ]
        };
    }
    
    async generateChoices(dialogueContext) {
        if (!this.connections.algorithmStudio) {
            return this.generateFallbackChoices(dialogueContext);
        }
        
        // TODO: Implement Algorithm Studio choice generation
        return this.generateFallbackChoices(dialogueContext);
    }
    
    generateFallbackChoices(context) {
        const choiceTemplates = [
            { text: "Yes", action: "set_variable", variable: "player_agrees", value: true },
            { text: "No", action: "set_variable", variable: "player_agrees", value: false },
            { text: "Maybe later", action: "resume_timeline" }
        ];
        
        return choiceTemplates;
    }
    
    // Dialogue System Integration
    async loadDialogueDefinitions() {
        try {
            const response = await fetch('/dunyalar/definitions/dialogues.json');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error("Error loading dialogue definitions:", error);
        }
        return { characters: [], conversations: [] };
    }
    
    async saveDialogueDefinitions(data) {
        // TODO: Implement save functionality
        console.log("Saving dialogue definitions:", data);
    }
    
    // File System Operations
    async loadCutscene(cutsceneId) {
        try {
            const response = await fetch(`/dunyalar/definitions/interactive_cutscenes/${cutsceneId}.json`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error("Error loading cutscene:", error);
        }
        return null;
    }
    
    async saveCutscene(cutsceneData) {
        // TODO: Implement actual save to server
        console.log("Saving cutscene:", cutsceneData.id);
        
        // For now, save to localStorage as fallback
        localStorage.setItem(`cutscene_${cutsceneData.id}`, JSON.stringify(cutsceneData));
        
        return { success: true, message: "Cutscene saved to local storage" };
    }
    
    async listCutscenes() {
        // TODO: Implement server-side cutscene listing
        const cutscenes = [];
        
        // Check localStorage for now
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cutscene_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    cutscenes.push({
                        id: data.id,
                        name: data.name,
                        created: data.metadata?.created,
                        lastModified: new Date().toISOString()
                    });
                } catch (error) {
                    console.error("Error parsing cutscene data:", error);
                }
            }
        }
        
        return cutscenes;
    }
    
    // Export Methods
    async exportCutsceneData(cutsceneData, format = 'json') {
        switch (format) {
            case 'json':
                return this.exportAsJSON(cutsceneData);
            case 'campaign':
                return this.exportToCampaign(cutsceneData);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
    
    exportAsJSON(cutsceneData) {
        return JSON.stringify(cutsceneData, null, 2);
    }
    
    // Validation Methods
    validateCutsceneData(data) {
        const errors = [];
        
        // Required fields
        if (!data.id) errors.push("Missing cutscene ID");
        if (!data.name) errors.push("Missing cutscene name");
        if (!data.timeline) errors.push("Missing timeline data");
        
        // Timeline validation
        if (data.timeline) {
            if (!data.timeline.duration || data.timeline.duration <= 0) {
                errors.push("Timeline duration must be greater than 0");
            }
            
            if (!Array.isArray(data.timeline.tracks)) {
                errors.push("Timeline tracks must be an array");
            }
        }
        
        // Branch validation
        if (data.branches) {
            Object.keys(data.branches).forEach(branchId => {
                const branch = data.branches[branchId];
                if (!branch.duration || branch.duration <= 0) {
                    errors.push(`Branch ${branchId} duration must be greater than 0`);
                }
            });
        }
        
        // Variable validation
        if (data.variables && Array.isArray(data.variables)) {
            data.variables.forEach((variable, index) => {
                if (!variable.name) {
                    errors.push(`Variable at index ${index} missing name`);
                }
                if (!variable.type) {
                    errors.push(`Variable ${variable.name} missing type`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    // Event System for API notifications
    createEventBus() {
        return new EventTarget();
    }
    
    // Utility Methods
    generateUID() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Static API instance
window.cutsceneAPI = new InteractiveCutsceneAPI();

console.log("Interactive Cutscene API loaded");