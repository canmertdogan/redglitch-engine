/**
 * Slot Selection UI - Main logic for slot selection screen
 */

let allSlots = [];
let deleteSlotId = null;

/**
 * Initialize the slot selection screen
 */
async function init() {
    showLoading(true);
    
    try {
        await loadSlots();
        renderSlots();
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Failed to load slots. Please refresh the page.');
    } finally {
        showLoading(false);
    }
}

/**
 * Load all slots from server
 */
async function loadSlots() {
    try {
        allSlots = await SlotManager.getAllSlots();
        console.log('[SlotSelection] Loaded slots:', allSlots.length);
    } catch (error) {
        console.error('[SlotSelection] Failed to load slots:', error);
        throw error;
    }
}

/**
 * Render all slot cards
 */
function renderSlots() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';

    allSlots.forEach(slot => {
        const slotCard = createSlotCard(slot);
        container.appendChild(slotCard);
    });
}

/**
 * Create a slot card element
 */
function createSlotCard(slot) {
    const summary = slot.getSummary();
    const card = document.createElement('div');
    
    card.className = 'slot-card';
    if (summary.isEmpty) {
        card.classList.add('empty');
    }
    if (summary.isComplete) {
        card.classList.add('complete');
    }

    if (summary.isEmpty) {
        card.innerHTML = createEmptySlotHTML(summary);
    } else {
        card.innerHTML = createOccupiedSlotHTML(summary);
    }

    return card;
}

/**
 * Create HTML for empty slot
 */
function createEmptySlotHTML(summary) {
    return `
        <div class="slot-header">
            <div class="slot-number">SLOT ${summary.slotId}</div>
            <div class="slot-status">EMPTY</div>
        </div>
        <div class="slot-body">
            <div class="empty-slot-content">
                <div class="empty-icon"><i class="fas fa-plus-circle"></i></div>
                <div class="empty-text">Start a New Campaign</div>
            </div>
            <div class="slot-actions">
                <button class="btn btn-primary" onclick="startNewCampaign(${summary.slotId})">
                    <i class="fas fa-play"></i> NEW GAME
                </button>
                <button class="btn btn-success" onclick="showImportModal(${summary.slotId})" title="Import Save">
                    <i class="fas fa-file-import"></i> IMPORT
                </button>
            </div>
        </div>
    `;
}

/**
 * Create HTML for occupied slot
 */
function createOccupiedSlotHTML(summary) {
    const progressPercent = summary.progress || 0;
    const progressBar = createProgressBarHTML(progressPercent);
    
    return `
        <div class="slot-header">
            <div class="slot-number">SLOT ${summary.slotId}</div>
            <div class="slot-status">${summary.isComplete ? 'COMPLETE' : 'IN PROGRESS'}</div>
        </div>
        <div class="slot-body">
            <h2 class="campaign-name">${escapeHtml(summary.campaignName)}</h2>
            
            <div class="campaign-info">
                <div class="info-row">
                    <i class="fas fa-user"></i>
                    <span>${escapeHtml(summary.playerName)}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-clock"></i>
                    <span>${summary.playTime}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-history"></i>
                    <span>${summary.relativeTime}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-save"></i>
                    <span>${summary.saves} saves</span>
                </div>
            </div>

            ${progressBar}

            <div class="slot-actions">
                <button class="btn btn-primary" onclick="resumeCampaign(${summary.slotId})">
                    <i class="fas fa-play"></i> ${summary.isComplete ? 'REPLAY' : 'RESUME'}
                </button>
                <button class="btn btn-info" onclick="showSlotInfo(${summary.slotId})">
                    <i class="fas fa-info-circle"></i>
                </button>
                <button class="btn btn-warning" onclick="showCopyModal(${summary.slotId})" title="Copy">
                    <i class="fas fa-copy"></i>
                </button>
                <button class="btn btn-success" onclick="showExportModal(${summary.slotId})" title="Export">
                    <i class="fas fa-file-export"></i>
                </button>
                <button class="btn btn-danger" onclick="showDeleteConfirmation(${summary.slotId})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Create progress bar HTML
 */
function createProgressBarHTML(percent) {
    return `
        <div class="progress-container">
            <div class="progress-label">
                <span>PROGRESS</span>
                <span>${percent}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percent}%"></div>
            </div>
        </div>
    `;
}

/**
 * Start a new campaign in empty slot
 */
function startNewCampaign(slotId) {
    console.log(`[SlotSelection] Starting new campaign in slot ${slotId}`);
    
    // Navigate to campaign browser with slot ID
    window.location.href = `campaign_browser.html?slot=${slotId}`;
}

/**
 * Resume an existing campaign
 */
async function resumeCampaign(slotId) {
    console.log(`[SlotSelection] Resuming campaign in slot ${slotId}`);
    
    showLoading(true);
    
    try {
        const slot = await SlotManager.getSlot(slotId);
        
        if (slot.isEmpty) {
            throw new Error('Slot is empty');
        }

        // Navigate to campaign runtime
        window.location.href = `campaign_runtime.html?slot=${slotId}`;
    } catch (error) {
        console.error('[SlotSelection] Failed to resume campaign:', error);
        showError('Failed to resume campaign. Please try again.');
        showLoading(false);
    }
}

/**
 * Show slot info modal
 */
async function showSlotInfo(slotId) {
    console.log(`[SlotSelection] Showing info for slot ${slotId}`);
    
    try {
        const slot = await SlotManager.getSlot(slotId);
        
        if (slot.isEmpty) return;

        const summary = slot.getSummary();
        const modal = document.getElementById('info-modal');
        const body = document.getElementById('info-modal-body');
        
        // Build detailed info HTML
        body.innerHTML = `
            <div class="info-grid">
                <div class="info-label"><i class="fas fa-gamepad"></i> CAMPAIGN:</div>
                <div class="info-value">${escapeHtml(summary.campaignName)}</div>
                
                <div class="info-label"><i class="fas fa-user"></i> PLAYER:</div>
                <div class="info-value">${escapeHtml(summary.playerName)}</div>
                
                <div class="info-label"><i class="fas fa-chart-line"></i> PROGRESS:</div>
                <div class="info-value">${summary.progress}% (${slot.campaign.completedNodes.length}/${slot.campaign.totalNodes} nodes)</div>
                
                <div class="info-label"><i class="fas fa-clock"></i> PLAY TIME:</div>
                <div class="info-value">${summary.playTime}</div>
                
                <div class="info-label"><i class="fas fa-calendar-plus"></i> CREATED:</div>
                <div class="info-value">${new Date(slot.metadata.created).toLocaleString()}</div>
                
                <div class="info-label"><i class="fas fa-history"></i> LAST PLAYED:</div>
                <div class="info-value">${summary.relativeTime} (${new Date(slot.metadata.lastPlayed).toLocaleString()})</div>
                
                <div class="info-label"><i class="fas fa-save"></i> SAVES:</div>
                <div class="info-value">${summary.saves}</div>
                
                <div class="info-label"><i class="fas fa-check-circle"></i> STATUS:</div>
                <div class="info-value">${summary.isComplete ? '✅ Complete' : '⏳ In Progress'}</div>
                
                <div class="info-label"><i class="fas fa-flag"></i> CURRENT NODE:</div>
                <div class="info-value">${slot.campaign.currentNode || 'Start'}</div>
            </div>
            ${slot.player.achievements.length > 0 ? `
                <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid var(--border);">
                    <div class="info-label" style="margin-bottom: 10px;">
                        <i class="fas fa-trophy"></i> ACHIEVEMENTS (${slot.player.achievements.length}):
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${slot.player.achievements.map(achievement => 
                            `<span style="padding: 5px 12px; background: rgba(241, 196, 15, 0.2); border: 1px solid #f1c40f; border-radius: 12px; font-size: 0.7rem; color: #f1c40f;">
                                ${escapeHtml(achievement)}
                            </span>`
                        ).join('')}
                    </div>
                </div>
            ` : ''}
        `;
        
        modal.classList.add('active');
    } catch (error) {
        console.error('[SlotSelection] Failed to show info:', error);
        showError('Failed to load slot info.');
    }
}

/**
 * Close info modal
 */
function closeInfoModal() {
    document.getElementById('info-modal').classList.remove('active');
}

/**
 * Show delete confirmation modal
 */
async function showDeleteConfirmation(slotId) {
    console.log(`[SlotSelection] Showing delete confirmation for slot ${slotId}`);
    
    try {
        const slot = await SlotManager.getSlot(slotId);
        
        if (slot.isEmpty) return;

        const summary = slot.getSummary();
        
        // Set modal content
        document.getElementById('delete-slot-name').textContent = summary.campaignName;
        deleteSlotId = slotId;
        
        // Show modal
        document.getElementById('delete-modal').classList.add('active');
    } catch (error) {
        console.error('[SlotSelection] Failed to show delete confirmation:', error);
        showError('Failed to load slot info.');
    }
}

/**
 * Confirm delete action
 */
async function confirmDelete() {
    if (deleteSlotId === null) return;

    console.log(`[SlotSelection] Deleting slot ${deleteSlotId}`);
    
    // Hide modal
    document.getElementById('delete-modal').classList.remove('active');
    showLoading(true);
    
    try {
        await SlotManager.deleteSlot(deleteSlotId);
        
        // Reload slots
        await loadSlots();
        renderSlots();
        
        console.log(`[SlotSelection] Slot ${deleteSlotId} deleted successfully`);
    } catch (error) {
        console.error('[SlotSelection] Failed to delete slot:', error);
        showError('Failed to delete slot. Please try again.');
    } finally {
        deleteSlotId = null;
        showLoading(false);
    }
}

/**
 * Cancel delete action
 */
function cancelDelete() {
    deleteSlotId = null;
    document.getElementById('delete-modal').classList.remove('active');
}

/**
 * Go back to main menu
 */
function goBack() {
    window.location.href = 'launcher.html';
}

/**
 * Show/hide loading overlay
 */
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

/**
 * Show error message
 */
function showError(message) {
    if (window.showError) {
        window.showError(message);
    } else {
        alert('ERROR: ' + message);
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Refresh slots
 */
async function refreshSlots() {
    showLoading(true);
    
    try {
        await loadSlots();
        renderSlots();
    } catch (error) {
        console.error('[SlotSelection] Failed to refresh slots:', error);
        showError('Failed to refresh slots.');
    } finally {
        showLoading(false);
    }
}

/**
 * Show copy modal
 */
async function showCopyModal(sourceSlotId) {
    console.log(`[SlotSelection] Showing copy modal for slot ${sourceSlotId}`);
    
    try {
        const sourceSlot = await SlotManager.getSlot(sourceSlotId);
        
        if (sourceSlot.isEmpty) return;

        const summary = sourceSlot.getSummary();
        const modal = document.getElementById('copy-modal');
        const targetSlotsContainer = document.getElementById('copy-target-slots');
        
        // Set source name
        document.getElementById('copy-source-name').textContent = summary.campaignName;
        
        // Build target slots list
        targetSlotsContainer.innerHTML = '';
        
        for (let i = 1; i <= 5; i++) {
            if (i === sourceSlotId) continue; // Skip source slot
            
            const targetSlot = allSlots[i - 1];
            const targetSummary = targetSlot.getSummary();
            const isOccupied = !targetSummary.isEmpty;
            
            const button = document.createElement('button');
            button.className = 'copy-target-btn';
            button.disabled = isOccupied;
            button.onclick = () => confirmCopy(sourceSlotId, i);
            
            button.innerHTML = `
                <span>
                    <i class="fas fa-save"></i> SLOT ${i}
                    ${isOccupied ? ` - ${escapeHtml(targetSummary.campaignName)}` : ' - EMPTY'}
                </span>
                <i class="fas fa-arrow-right"></i>
            `;
            
            targetSlotsContainer.appendChild(button);
        }
        
        modal.classList.add('active');
    } catch (error) {
        console.error('[SlotSelection] Failed to show copy modal:', error);
        showError('Failed to load slot info.');
    }
}

/**
 * Confirm copy slot
 */
async function confirmCopy(sourceSlotId, targetSlotId) {
    console.log(`[SlotSelection] Copying slot ${sourceSlotId} to ${targetSlotId}`);
    
    closeCopyModal();
    showLoading(true);
    
    try {
        await SlotManager.copySlot(sourceSlotId, targetSlotId);
        
        // Reload slots
        await loadSlots();
        renderSlots();
        
        if (window.showSuccess) {
            window.showSuccess(`Successfully copied Slot ${sourceSlotId} to Slot ${targetSlotId}!`);
        } else {
            alert(`Successfully copied Slot ${sourceSlotId} to Slot ${targetSlotId}!`);
        }
    } catch (error) {
        console.error('[SlotSelection] Failed to copy slot:', error);
        showError('Failed to copy slot. Please try again.');
    } finally {
        showLoading(false);
    }
}

/**
 * Close copy modal
 */
function closeCopyModal() {
    document.getElementById('copy-modal').classList.remove('active');
}

/**
 * Show export modal
 */
async function showExportModal(slotId) {
    console.log(`[SlotSelection] Showing export modal for slot ${slotId}`);
    
    try {
        const slot = await SlotManager.getSlot(slotId);
        
        if (slot.isEmpty) return;

        const summary = slot.getSummary();
        const modal = document.getElementById('export-modal');
        
        // Set slot name
        document.getElementById('export-slot-name').textContent = summary.campaignName;
        
        // Set default filename
        const campaignName = summary.campaignName.toLowerCase().replace(/\s+/g, '_');
        document.getElementById('export-filename').value = `${campaignName}_slot${slotId}.json`;
        
        // Store slot ID for export
        modal.dataset.slotId = slotId;
        
        modal.classList.add('active');
    } catch (error) {
        console.error('[SlotSelection] Failed to show export modal:', error);
        showError('Failed to load slot info.');
    }
}

/**
 * Confirm export
 */
async function confirmExport() {
    const modal = document.getElementById('export-modal');
    const slotId = parseInt(modal.dataset.slotId);
    const filename = document.getElementById('export-filename').value || `slot_${slotId}.json`;
    
    console.log(`[SlotSelection] Exporting slot ${slotId} as ${filename}`);
    
    try {
        const exportData = await SlotManager.exportSlot(slotId);
        
        // Create download link
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        closeExportModal();
        if (window.showSuccess) {
            window.showSuccess('Slot exported successfully!');
        } else {
            alert('Slot exported successfully!');
        }
    } catch (error) {
        console.error('[SlotSelection] Failed to export slot:', error);
        showError('Failed to export slot. Please try again.');
    }
}

/**
 * Close export modal
 */
function closeExportModal() {
    document.getElementById('export-modal').classList.remove('active');
}

/**
 * Show import modal
 */
function showImportModal(slotId) {
    console.log(`[SlotSelection] Showing import modal for slot ${slotId}`);
    
    const modal = document.getElementById('import-modal');
    const fileInput = document.getElementById('import-file-input');
    const preview = document.getElementById('import-preview');
    const confirmBtn = document.getElementById('confirm-import-btn');
    
    // Set slot number
    document.getElementById('import-slot-number').textContent = slotId;
    
    // Store slot ID
    modal.dataset.slotId = slotId;
    
    // Reset file input and hide preview
    fileInput.value = '';
    preview.style.display = 'none';
    confirmBtn.disabled = true;
    
    // Set up file change listener
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Validate slot data
            if (!data.slotId || !data.campaign || !data.player || !data.metadata) {
                throw new Error('Invalid slot file format');
            }
            
            // Show preview
            preview.style.display = 'block';
            document.getElementById('import-preview-content').innerHTML = `
                <div><strong>Campaign:</strong> ${escapeHtml(data.campaign.name)}</div>
                <div><strong>Player:</strong> ${escapeHtml(data.player.name)}</div>
                <div><strong>Progress:</strong> ${data.campaign.completionPercent}%</div>
                <div><strong>Play Time:</strong> ${formatPlayTime(data.metadata.playTime)}</div>
            `;
            
            confirmBtn.disabled = false;
            
            // Store parsed data
            modal.dataset.importData = text;
        } catch (error) {
            console.error('[SlotSelection] Failed to parse import file:', error);
            showError('Invalid save file format.');
            preview.style.display = 'none';
            confirmBtn.disabled = true;
        }
    };
    
    modal.classList.add('active');
}

/**
 * Confirm import
 */
async function confirmImport() {
    const modal = document.getElementById('import-modal');
    const slotId = parseInt(modal.dataset.slotId);
    const importData = modal.dataset.importData;
    
    console.log(`[SlotSelection] Importing to slot ${slotId}`);
    
    closeImportModal();
    showLoading(true);
    
    try {
        await SlotManager.importSlot(slotId, importData);
        
        // Reload slots
        await loadSlots();
        renderSlots();
        
        if (window.showSuccess) {
            window.showSuccess('Slot imported successfully!');
        } else {
            alert('Slot imported successfully!');
        }
    } catch (error) {
        console.error('[SlotSelection] Failed to import slot:', error);
        showError('Failed to import slot. Please try again.');
    } finally {
        showLoading(false);
    }
}

/**
 * Close import modal
 */
function closeImportModal() {
    document.getElementById('import-modal').classList.remove('active');
}

/**
 * Format play time helper
 */
function formatPlayTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
    // ESC to close any open modal
    if (e.key === 'Escape') {
        if (document.getElementById('delete-modal').classList.contains('active')) {
            cancelDelete();
        }
        if (document.getElementById('info-modal').classList.contains('active')) {
            closeInfoModal();
        }
        if (document.getElementById('copy-modal').classList.contains('active')) {
            closeCopyModal();
        }
        if (document.getElementById('export-modal').classList.contains('active')) {
            closeExportModal();
        }
        if (document.getElementById('import-modal').classList.contains('active')) {
            closeImportModal();
        }
    }
    
    // F5 to refresh slots
    if (e.key === 'F5') {
        e.preventDefault();
        refreshSlots();
    }
    
    // Number keys 1-5 to select slots
    if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.metaKey) {
        const slotId = parseInt(e.key);
        const slot = allSlots[slotId - 1];
        if (slot) {
            const summary = slot.getSummary();
            if (summary.isEmpty) {
                startNewCampaign(slotId);
            } else {
                resumeCampaign(slotId);
            }
        }
    }
});

// Initialize on page load
window.addEventListener('load', init);

// Auto-refresh slots every 30 seconds (in case of external changes)
setInterval(() => {
    if (!document.getElementById('loading-overlay').classList.contains('active') &&
        !document.getElementById('delete-modal').classList.contains('active')) {
        loadSlots().then(renderSlots).catch(console.error);
    }
}, 30000);
