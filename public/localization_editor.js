
// localization_editor.js - Professional Localization Studio
// Algorithm Studio Design Language Integration
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeLocalizationIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Listen for dialogue updates to sync localization keys
            eventBus.on('dialogue:*', (event) => {
                console.log('[LocalizationEditor] Dialogue updated:', event.data);
            });
            
            console.log('[LocalizationEditor] EventBus connected');
        }
    }
}

function broadcastLocalizationUpdate(key, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`localization:${action}`, {
            key: key,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set('localization.lastModified', Date.now());
    }
}

class LocalizationEditor {
    constructor() {
        // Localization data structure
        this.data = {
            // UI Elements
            "ui.start_game": { "EN": "START GAME", "TR": "OYUNA BAŞLA", "RU": "НАЧАТЬ ИГРУ" },
            "ui.continue": { "EN": "CONTINUE", "TR": "DEVAM ET", "RU": "ПРОДОЛЖИТЬ" },
            "ui.settings": { "EN": "SETTINGS", "TR": "AYARLAR", "RU": "НАСТРОЙКИ" },
            "ui.quit": { "EN": "QUIT", "TR": "ÇIKIŞ", "RU": "ВЫХОД" },
            
            // Game Messages
            "game.welcome": { "EN": "Welcome to the adventure!", "TR": "Maceraya hoş geldiniz!", "RU": "Добро пожаловать в приключение!" },
            "game.level_complete": { "EN": "Level Complete!", "TR": "Bölüm Tamamlandı!", "RU": "Уровень завершен!" },
            "game.game_over": { "EN": "Game Over", "TR": "Oyun Bitti", "RU": "Игра окончена" },
            
            // Character Dialogue
            "npc.merchant.greeting": { "EN": "Hello, traveler! What can I do for you?", "TR": "Merhaba yolcu! Size nasıl yardım edebilirim?", "RU": "Привет, путешественник! Чем могу помочь?" },
            "npc.guard.halt": { "EN": "Halt! Who goes there?", "TR": "Dur! Kim var orada?", "RU": "Стой! Кто идет?" }
        };
        
        // Supported languages with metadata
        this.languages = {
            "EN": { name: "English", flag: "🇺🇸", rtl: false },
            "TR": { name: "Türkçe", flag: "🇹🇷", rtl: false },
            "RU": { name: "Русский", flag: "🇷🇺", rtl: false },
            "AR": { name: "العربية", flag: "🇸🇦", rtl: true },
            "DE": { name: "Deutsch", flag: "🇩🇪", rtl: false },
            "FR": { name: "Français", flag: "🇫🇷", rtl: false },
            "ES": { name: "Español", flag: "🇪🇸", rtl: false },
            "IT": { name: "Italiano", flag: "🇮🇹", rtl: false },
            "JA": { name: "日本語", flag: "🇯🇵", rtl: false },
            "KO": { name: "한국어", flag: "🇰🇷", rtl: false }
        };
        
        this.activeLanguages = ["EN", "TR", "RU"]; // Currently enabled languages
        this.selectedLanguages = new Set(this.activeLanguages); // For filtering
        this.searchQuery = "";
        this.isDirty = false; // Track unsaved changes
        
        // DOM references
        this.dom = {
            headerRow: document.getElementById('header-row'),
            tableBody: document.getElementById('table-body'),
            langList: document.getElementById('lang-list'),
            searchInput: document.getElementById('search-input'),
            statusText: document.getElementById('status-text'),
            keyCount: document.getElementById('key-count'),
            langCount: document.getElementById('lang-count'),
            totalKeys: document.getElementById('total-keys'),
            totalLangs: document.getElementById('total-langs'),
            completionRate: document.getElementById('completion-rate')
        };
        
        this.init();
    }
    
    async init() {
        console.log("Localization Studio initializing...");
        
        // Initialize integration first
        initializeLocalizationIntegration();
        
        // Load existing localization data
        await this.loadProject();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial render
        this.render();
        
        console.log("Localization Studio ready");
        this.updateStatus("LOCALIZATION STUDIO READY");
    }
    
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        this.saveProject();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.newProject();
                        break;
                    case 'o':
                        e.preventDefault();
                        this.loadProject();
                        break;
                    case 'k':
                        e.preventDefault();
                        this.addKey();
                        break;
                    case 'l':
                        e.preventDefault();
                        this.addLanguage();
                        break;
                }
            }
        });
        
        // Auto-save on changes
        setInterval(() => {
            if (this.isDirty) {
                this.autoSave();
            }
        }, 30000); // Auto-save every 30 seconds
    }
    
    async loadProject() {
        try {
            // Try to load from Ketebe project structure
            const response = await fetch('/dunyalar/definitions/locales.json');
            if (response.ok) {
                const loadedData = await response.json();
                this.data = loadedData;
                
                // Extract active languages from data
                const foundLangs = new Set();
                Object.values(this.data).forEach(translations => {
                    Object.keys(translations).forEach(lang => foundLangs.add(lang));
                });
                this.activeLanguages = Array.from(foundLangs);
                this.selectedLanguages = new Set(this.activeLanguages);
                
                this.updateStatus("PROJECT LOADED SUCCESSFULLY");
            } else {
                this.updateStatus("USING DEFAULT LOCALIZATION DATA");
            }
        } catch (error) {
            console.warn("Could not load project localization:", error);
            this.updateStatus("USING DEFAULT LOCALIZATION DATA");
        }
    }
    
    async saveProject() {
        try {
            // Save to Ketebe project structure
            const response = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: 'dunyalar/definitions/locales.json',
                    content: JSON.stringify(this.data, null, 2)
                })
            });
            
            if (response.ok) {
                this.isDirty = false;
                this.updateStatus("PROJECT SAVED SUCCESSFULLY");
            } else {
                throw new Error("Save failed");
            }
        } catch (error) {
            console.error("Save error:", error);
            this.updateStatus("ERROR: COULD NOT SAVE PROJECT");
        }
    }
    
    autoSave() {
        // Perform auto-save without user notification
        this.saveProject().then(() => {
            console.log("Auto-saved localization data");
        });
    }
    
    newProject() {
        if (this.isDirty && !confirm("UNSAVED CHANGES WILL BE LOST. CONTINUE?")) {
            return;
        }
        
        this.data = {
            "ui.start_game": { "EN": "START GAME" },
            "ui.continue": { "EN": "CONTINUE" },
            "ui.settings": { "EN": "SETTINGS" }
        };
        
        this.activeLanguages = ["EN"];
        this.selectedLanguages = new Set(["EN"]);
        this.isDirty = true;
        this.render();
        this.updateStatus("NEW PROJECT CREATED");
    }
    
    render() {
        this.renderLanguageList();
        this.renderTable();
        this.updateStatistics();
    }
    
    renderLanguageList() {
        this.dom.langList.innerHTML = '';
        
        this.activeLanguages.forEach(langCode => {
            const langInfo = this.languages[langCode];
            const item = document.createElement('div');
            item.className = 'lang-item';
            if (this.selectedLanguages.has(langCode)) {
                item.classList.add('active');
            }
            
            const completionRate = this.calculateLanguageCompletion(langCode);
            
            item.innerHTML = `
                <div class="lang-flag">${langInfo?.flag || '🏳️'}</div>
                <div style="flex: 1;">
                    <div>${langCode}</div>
                    <div style="font-size: 0.8rem; color: #666;">${langInfo?.name || langCode}</div>
                </div>
                <div class="lang-stats">${completionRate}%</div>
            `;
            
            item.onclick = () => this.toggleLanguageFilter(langCode);
            this.dom.langList.appendChild(item);
        });
    }
    
    renderTable() {
        // Render header
        this.renderTableHeader();
        
        // Render rows
        this.dom.tableBody.innerHTML = '';
        
        const filteredKeys = this.getFilteredKeys();
        filteredKeys.forEach(key => {
            this.renderTableRow(key);
        });
    }
    
    renderTableHeader() {
        let headerHtml = '<th class="key-header">TRANSLATION KEY</th>';
        
        this.activeLanguages.forEach(langCode => {
            if (this.selectedLanguages.has(langCode)) {
                const langInfo = this.languages[langCode];
                headerHtml += `
                    <th class="lang-header">
                        ${langInfo?.flag || '🏳️'} ${langCode}
                        <div style="font-size: 0.8rem; color: #666; text-transform: none;">${langInfo?.name || langCode}</div>
                    </th>
                `;
            }
        });
        
        headerHtml += '<th class="action-header">ACTION</th>';
        this.dom.headerRow.innerHTML = headerHtml;
    }
    
    renderTableRow(key) {
        const row = document.createElement('tr');
        row.className = 'table-row';
        
        // Key cell
        const keyCell = document.createElement('td');
        keyCell.className = 'key-cell';
        keyCell.textContent = key;
        keyCell.title = key;
        row.appendChild(keyCell);
        
        // Language cells
        this.activeLanguages.forEach(langCode => {
            if (this.selectedLanguages.has(langCode)) {
                const textCell = document.createElement('td');
                textCell.className = 'text-cell';
                
                const input = document.createElement('textarea');
                input.className = 'text-input';
                input.value = this.data[key]?.[langCode] || '';
                input.rows = 1;
                
                // Handle RTL languages
                if (this.languages[langCode]?.rtl) {
                    input.classList.add('rtl');
                }
                
                // Mark missing translations
                if (!input.value.trim()) {
                    input.classList.add('missing');
                }
                
                // Auto-resize textarea
                input.addEventListener('input', (e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.max(40, e.target.scrollHeight) + 'px';
                    
                    // Update data
                    if (!this.data[key]) this.data[key] = {};
                    this.data[key][langCode] = e.target.value;
                    this.isDirty = true;
                    
                    // Update missing class
                    if (e.target.value.trim()) {
                        e.target.classList.remove('missing');
                    } else {
                        e.target.classList.add('missing');
                    }
                    
                    this.updateStatistics();
                });
                
                textCell.appendChild(input);
                row.appendChild(textCell);
            }
        });
        
        // Action cell
        const actionCell = document.createElement('td');
        actionCell.className = 'action-cell';
        actionCell.innerHTML = '<i class="fas fa-trash"></i>';
        actionCell.title = 'Delete Key';
        actionCell.onclick = () => this.deleteKey(key);
        row.appendChild(actionCell);
        
        this.dom.tableBody.appendChild(row);
    }
    
    getFilteredKeys() {
        let keys = Object.keys(this.data);
        
        // Apply search filter
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            keys = keys.filter(key => 
                key.toLowerCase().includes(query) ||
                Object.values(this.data[key] || {}).some(text => 
                    text.toLowerCase().includes(query)
                )
            );
        }
        
        return keys.sort();
    }
    
    calculateLanguageCompletion(langCode) {
        const totalKeys = Object.keys(this.data).length;
        if (totalKeys === 0) return 100;
        
        const translatedKeys = Object.keys(this.data).filter(key => {
            const translation = this.data[key]?.[langCode];
            return translation && translation.trim().length > 0;
        }).length;
        
        return Math.round((translatedKeys / totalKeys) * 100);
    }
    
    toggleLanguageFilter(langCode) {
        if (this.selectedLanguages.has(langCode)) {
            this.selectedLanguages.delete(langCode);
        } else {
            this.selectedLanguages.add(langCode);
        }
        this.render();
    }
    
    filterKeys(query) {
        this.searchQuery = query;
        this.renderTable();
        this.updateStatistics();
    }
    
    updateStatistics() {
        const totalKeys = Object.keys(this.data).length;
        const totalLangs = this.activeLanguages.length;
        
        // Calculate overall completion
        let totalTranslations = 0;
        let completedTranslations = 0;
        
        Object.keys(this.data).forEach(key => {
            this.activeLanguages.forEach(lang => {
                totalTranslations++;
                if (this.data[key]?.[lang]?.trim()) {
                    completedTranslations++;
                }
            });
        });
        
        const completionRate = totalTranslations > 0 ? 
            Math.round((completedTranslations / totalTranslations) * 100) : 100;
        
        // Update DOM
        this.dom.keyCount.textContent = totalKeys;
        this.dom.langCount.textContent = totalLangs;
        this.dom.totalKeys.textContent = totalKeys;
        this.dom.totalLangs.textContent = totalLangs;
        this.dom.completionRate.textContent = completionRate + '%';
    }
    
    updateStatus(message) {
        this.dom.statusText.textContent = message;
        console.log("Localization Studio:", message);
    }
    
    // Menu Actions
    addKey() {
        const key = prompt("ENTER TRANSLATION KEY (e.g., ui.menu.start):");
        if (!key || key.trim() === '') return;
        
        const cleanKey = key.trim();
        
        if (this.data[cleanKey]) {
            alert("KEY ALREADY EXISTS!");
            return;
        }
        
        this.data[cleanKey] = {};
        this.isDirty = true;
        this.render();
        this.updateStatus(`KEY ADDED: ${cleanKey.toUpperCase()}`);
    }
    
    deleteKey(key) {
        if (!confirm(`DELETE KEY '${key}'?`)) return;
        
        delete this.data[key];
        this.isDirty = true;
        this.render();
        this.updateStatus(`KEY DELETED: ${key.toUpperCase()}`);
    }
    
    addLanguage() {
        const availableLangs = Object.keys(this.languages).filter(lang => 
            !this.activeLanguages.includes(lang)
        );
        
        if (availableLangs.length === 0) {
            alert("ALL SUPPORTED LANGUAGES ARE ALREADY ADDED!");
            return;
        }
        
        const langCode = prompt(`ENTER LANGUAGE CODE:\nAvailable: ${availableLangs.join(', ')}`);
        if (!langCode) return;
        
        const cleanLangCode = langCode.trim().toUpperCase();
        
        if (!this.languages[cleanLangCode]) {
            alert("UNSUPPORTED LANGUAGE CODE!");
            return;
        }
        
        if (this.activeLanguages.includes(cleanLangCode)) {
            alert("LANGUAGE ALREADY EXISTS!");
            return;
        }
        
        this.activeLanguages.push(cleanLangCode);
        this.selectedLanguages.add(cleanLangCode);
        this.isDirty = true;
        this.render();
        this.updateStatus(`LANGUAGE ADDED: ${cleanLangCode}`);
    }
    
    findMissingTranslations() {
        const missing = [];
        
        Object.keys(this.data).forEach(key => {
            this.activeLanguages.forEach(lang => {
                if (!this.data[key]?.[lang]?.trim()) {
                    missing.push({ key, lang });
                }
            });
        });
        
        if (missing.length === 0) {
            alert("NO MISSING TRANSLATIONS FOUND!");
            return;
        }
        
        const report = missing.map(item => `${item.key} (${item.lang})`).join('\n');
        alert(`MISSING TRANSLATIONS (${missing.length}):\n\n${report}`);
    }
    
    validateAll() {
        let issues = 0;
        
        // Check for empty keys
        Object.keys(this.data).forEach(key => {
            this.activeLanguages.forEach(lang => {
                if (!this.data[key]?.[lang]?.trim()) {
                    issues++;
                }
            });
        });
        
        if (issues === 0) {
            alert("ALL TRANSLATIONS ARE VALID!");
        } else {
            alert(`VALIDATION COMPLETE\n\nIssues found: ${issues} missing translations`);
        }
        
        this.updateStatus(`VALIDATION COMPLETE: ${issues} ISSUES FOUND`);
    }
    
    exportToCSV() {
        let csv = 'Key,' + this.activeLanguages.join(',') + '\n';
        
        Object.keys(this.data).sort().forEach(key => {
            const row = [key];
            this.activeLanguages.forEach(lang => {
                const text = this.data[key]?.[lang] || '';
                row.push(`"${text.replace(/"/g, '""')}"`);
            });
            csv += row.join(',') + '\n';
        });
        
        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'localization.csv';
        a.click();
        URL.revokeObjectURL(url);
        
        this.updateStatus("EXPORTED TO CSV");
    }
    
    importFromCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    this.parseCSV(event.target.result);
                    this.updateStatus("IMPORTED FROM CSV");
                } catch (error) {
                    alert("ERROR IMPORTING CSV: " + error.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    
    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error("Invalid CSV format");
        
        const headers = lines[0].split(',').map(h => h.trim());
        const languages = headers.slice(1); // Skip 'Key' column
        
        // Update active languages
        this.activeLanguages = languages;
        this.selectedLanguages = new Set(languages);
        
        // Parse data
        const newData = {};
        for (let i = 1; i < lines.length; i++) {
            const cells = this.parseCSVLine(lines[i]);
            if (cells.length >= 2) {
                const key = cells[0];
                newData[key] = {};
                
                for (let j = 1; j < cells.length && j <= languages.length; j++) {
                    newData[key][languages[j-1]] = cells[j];
                }
            }
        }
        
        this.data = newData;
        this.isDirty = true;
        this.render();
    }
    
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        
        return result.map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"'));
    }
    
    generateReport() {
        const report = {
            totalKeys: Object.keys(this.data).length,
            totalLanguages: this.activeLanguages.length,
            completionByLanguage: {}
        };
        
        this.activeLanguages.forEach(lang => {
            report.completionByLanguage[lang] = this.calculateLanguageCompletion(lang);
        });
        
        const reportText = `LOCALIZATION REPORT
        
Total Keys: ${report.totalKeys}
Total Languages: ${report.totalLanguages}

Completion by Language:
${Object.entries(report.completionByLanguage)
    .map(([lang, completion]) => `${lang}: ${completion}%`)
    .join('\n')}`;
        
        alert(reportText);
    }
    
    bulkTranslate() {
        alert("BULK TRANSLATION FEATURE COMING SOON!\n\nThis feature will allow:\n- Auto-translation via APIs\n- Find and replace operations\n- Bulk text operations");
    }
    
    settings() {
        alert("SETTINGS FEATURE COMING SOON!\n\nThis feature will allow:\n- Custom language configurations\n- Auto-save preferences\n- Export/import settings");
    }
}

// Initialize the localization editor
window.addEventListener('DOMContentLoaded', () => {
    window.editor = new LocalizationEditor();
});

console.log("LOCALIZATION STUDIO LOADED");
