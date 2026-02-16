/**
 * Campaign Browser - Main logic for campaign selection
 */

let allCampaigns = [];
let filteredCampaigns = [];
let slotId = null;
let currentDifficultyFilter = 'all';

/**
 * Initialize the campaign browser
 */
async function init() {
    console.log('[CampaignBrowser] Initializing...');

    // Get slot ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    slotId = parseInt(urlParams.get('slot'));

    if (!slotId || slotId < 1 || slotId > 5) {
        if (window.showError) {
            window.showError('Invalid slot ID');
        }
        setTimeout(() => {
            window.location.href = 'slot_selection.html';
        }, 1000);
        return;
    }

    // Display slot number
    document.getElementById('slot-number').textContent = slotId;

    // Load campaigns
    await loadCampaigns();
}

/**
 * Load all available campaigns
 */
async function loadCampaigns() {
    showLoading(true);

    try {
        const response = await fetch('/api/campaigns');
        
        if (!response.ok) {
            throw new Error(`Failed to load campaigns: ${response.status}`);
        }

        allCampaigns = await response.json();
        filteredCampaigns = [...allCampaigns];

        console.log(`[CampaignBrowser] Loaded ${allCampaigns.length} campaigns`);

        renderCampaigns();
        showLoading(false);

    } catch (error) {
        console.error('[CampaignBrowser] Failed to load campaigns:', error);
        if (window.showError) {
            window.showError('Failed to load campaigns. Please try again.');
        } else {
            alert('Failed to load campaigns. Please try again.');
        }
        showLoading(false);
        showEmpty(true);
    }
}

/**
 * Render campaign cards
 */
function renderCampaigns() {
    const grid = document.getElementById('campaigns-grid');
    grid.innerHTML = '';

    if (filteredCampaigns.length === 0) {
        showEmpty(true);
        return;
    }

    showEmpty(false);
    grid.style.display = 'grid';

    filteredCampaigns.forEach(campaign => {
        const card = createCampaignCard(campaign);
        grid.appendChild(card);
    });
}

/**
 * Create a campaign card element
 */
function createCampaignCard(campaign) {
    const card = document.createElement('div');
    card.className = 'campaign-card';
    card.onclick = () => selectCampaign(campaign);

    // Extract metadata
    const metadata = campaign.metadata || {};
    const pattern = metadata.pattern || 'linear';
    const difficulty = metadata.difficulty || 'normal';
    const playtime = metadata.estimatedPlaytime || 'Unknown';
    const endings = metadata.endings || 1;

    // Build tags
    let tagsHtml = '';
    
    if (pattern) {
        tagsHtml += `<span class="tag pattern">${pattern.toUpperCase()}</span>`;
    }
    
    if (difficulty) {
        tagsHtml += `<span class="tag difficulty">${difficulty.toUpperCase()}</span>`;
    }

    // Build card HTML
    card.innerHTML = `
        <div class="campaign-header">
            <h2 class="campaign-name">${escapeHtml(campaign.name)}</h2>
            <p class="campaign-author">
                <i class="fas fa-user"></i> ${escapeHtml(campaign.author)}
            </p>
        </div>

        <p class="campaign-description">
            ${escapeHtml(campaign.description)}
        </p>

        <div class="campaign-meta">
            <div class="meta-item">
                <i class="fas fa-map"></i>
                <span>${campaign.nodeCount} Nodes</span>
            </div>
            <div class="meta-item">
                <i class="fas fa-clock"></i>
                <span>${playtime}</span>
            </div>
            ${endings > 1 ? `
            <div class="meta-item">
                <i class="fas fa-code-branch"></i>
                <span>${endings} Endings</span>
            </div>
            ` : ''}
        </div>

        <div class="campaign-tags">
            ${tagsHtml}
            <span class="tag">v${campaign.version}</span>
        </div>

        <button class="campaign-select-btn">
            <i class="fas fa-play-circle"></i> START CAMPAIGN
        </button>
    `;

    return card;
}

/**
 * Select a campaign and create slot
 */
async function selectCampaign(campaign) {
    console.log(`[CampaignBrowser] Selected campaign: ${campaign.name}`);

    showLoading(true);

    try {
        // Create new slot with campaign data
        const slot = new CampaignSlot(slotId);
        
        await slot.load(
            campaign.file.replace('.json', ''),
            campaign.name,
            'Player' // Default player name
        );

        // Initialize campaign data
        slot.campaign.currentNode = null; // Will be set to start node by CampaignController
        slot.campaign.completedNodes = [];
        slot.campaign.totalNodes = campaign.nodeCount;
        slot.campaign.completionPercent = 0;

        // Initialize player stats
        slot.player.stats = {
            level: 1,
            hp: 100,
            maxHp: 100,
            mana: 50,
            maxMana: 50,
            stamina: 100,
            maxStamina: 100
        };

        slot.player.inventory = [];
        slot.player.quests = {};
        slot.player.achievements = [];

        // Initialize metadata
        slot.metadata.created = new Date().toISOString();
        slot.metadata.lastPlayed = new Date().toISOString();
        slot.metadata.playTime = 0;
        slot.metadata.saves = 0;

        // Save slot to server
        await SlotManager.saveSlot(slot);

        console.log(`[CampaignBrowser] Slot ${slotId} created successfully`);

        // Navigate to campaign runtime
        window.location.href = `campaign_runtime.html?slot=${slotId}`;

    } catch (error) {
        console.error('[CampaignBrowser] Failed to create slot:', error);
        if (window.showError) {
            window.showError('Failed to start campaign. Please try again.');
        } else {
            alert('Failed to start campaign. Please try again.');
        }
        showLoading(false);
    }
}

/**
 * Filter campaigns by search query and difficulty
 */
function filterCampaigns() {
    const searchQuery = document.getElementById('search-input').value.toLowerCase();

    filteredCampaigns = allCampaigns.filter(campaign => {
        // Search filter
        const matchesSearch = 
            campaign.name.toLowerCase().includes(searchQuery) ||
            campaign.description.toLowerCase().includes(searchQuery) ||
            campaign.author.toLowerCase().includes(searchQuery);

        if (!matchesSearch) return false;

        // Difficulty filter
        if (currentDifficultyFilter !== 'all') {
            const difficulty = campaign.metadata?.difficulty || 'normal';
            if (difficulty !== currentDifficultyFilter) return false;
        }

        return true;
    });

    renderCampaigns();
}

/**
 * Set difficulty filter
 */
function setDifficultyFilter(difficulty) {
    currentDifficultyFilter = difficulty;

    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    filterCampaigns();
}

/**
 * Show/hide loading state
 */
function showLoading(show) {
    const loading = document.getElementById('loading-state');
    const grid = document.getElementById('campaigns-grid');
    const empty = document.getElementById('empty-state');

    if (show) {
        loading.style.display = 'block';
        grid.style.display = 'none';
        empty.style.display = 'none';
    } else {
        loading.style.display = 'none';
    }
}

/**
 * Show/hide empty state
 */
function showEmpty(show) {
    const empty = document.getElementById('empty-state');
    const grid = document.getElementById('campaigns-grid');

    if (show) {
        empty.style.display = 'block';
        grid.style.display = 'none';
    } else {
        empty.style.display = 'none';
    }
}

/**
 * Go back to slot selection
 */
function goBack() {
    window.location.href = 'slot_selection.html';
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
 * Keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
    // ESC to go back
    if (e.key === 'Escape') {
        goBack();
    }

    // Ctrl/Cmd + F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('search-input').focus();
    }
});

// Initialize on page load
window.addEventListener('load', init);
