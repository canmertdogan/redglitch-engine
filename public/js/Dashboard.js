/**
 * RedGlitch Engine - Main Studio Dashboard Logic
 * Handles project management, the creation wizard, and view switching.
 */

const View = {
    show: (id) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`view-${id}`);
        if (target) {
            target.classList.add('active');
            // Update sidebar active state
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
                const btnView = btn.getAttribute('onclick');
                if (btnView && btnView.includes(`'${id}'`)) {
                    btn.classList.add('active');
                }
            });
            // Load specific content
            if (id === 'projects') loadProjects();
            if (id === 'create') Wizard.reset();
            if (id === 'settings') {
                const savedName = localStorage.getItem('redglitch_username') || '';
                document.getElementById('dev-name-input').value = savedName;
            }
        }
    }
};

async function loadProjects() {
    const list = document.getElementById('project-list');
    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        if (!projects || projects.length === 0) {
            list.innerHTML = '<div style="padding:30px; color:#666; text-align:center; grid-column:1/-1;"><i class="fas fa-folder-open" style="font-size:48px; opacity:0.3; margin-bottom:10px;"></i><br>No projects found. Create your first game!</div>';
            return;
        }
        
        list.innerHTML = '';
        
        projects.forEach(p => {
            const engineIcon = getEngineIcon(p.engineType || 'rpg-topdown');
            const lastModified = p.lastModified ? new Date(p.lastModified).toLocaleDateString() : 'Unknown';
            
            const card = document.createElement('div');
            card.className = 'project-card';
            card.onclick = () => launchProject(p.name);
            
            card.innerHTML = `
                <div class="project-actions" onclick="event.stopPropagation()">
                    <div class="project-action-btn" title="Reveal in Finder">
                        <i class="fas fa-folder-open"></i>
                    </div>
                    <div class="project-action-btn danger" title="Delete Project">
                        <i class="fas fa-trash"></i>
                    </div>
                </div>
                <div class="p-icon"><i class="${engineIcon}"></i></div>
                <div class="p-title">${escapeHtml(p.name)}</div>
                <div class="p-path">${escapeHtml(p.path || p.name)}</div>
                <div class="p-meta">
                    <span><i class="fas fa-gamepad"></i> ${escapeHtml(p.engineType || 'RPG')}</span>
                    <span><i class="far fa-clock"></i> ${lastModified}</span>
                </div>
            `;
            
            const actionBtns = card.querySelectorAll('.project-action-btn');
            actionBtns[0].onclick = (e) => { e.stopPropagation(); revealProject(p.name); };
            actionBtns[1].onclick = (e) => { e.stopPropagation(); deleteProject(p.name); };
            
            list.appendChild(card);
        });
    } catch(e) { 
        console.error('Failed to load projects:', e);
        list.innerHTML = '<div style="padding:20px; color:#e74c3c;">⚠️ Error loading projects. Check server connection.</div>'; 
    }
}

function getEngineIcon(engineType) {
    const icons = {
        'rpg-topdown':   'fas fa-map',
        'platformer-2d': 'fas fa-running',
        'iso-pixel':     'fas fa-cubes',
        'topdown-3d':    'fas fa-street-view',
        'fps-3d':        'fas fa-crosshairs',
        'platformer-3d': 'fas fa-layer-group',
    };
    return icons[engineType] || 'fas fa-gamepad';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function launchProject(name) {
    await fetch('/api/projects/switch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name }) });
    window.location.href = 'tools.html';
}

// --- PROJECT WIZARD ---
const Wizard = {
    currentStep: 1,
    TOTAL_STEPS: 5,
    IS_3D_ENGINE: ['topdown-3d', 'fps-3d', 'platformer-3d'],
    data: {
        name: '',
        author: '',
        engineType: 'rpg-topdown',
        template: 'blank',
        renderQuality: 'medium',
        physics3D: true,
        shadowQuality: true,
    },
    
    init() {
        const savedAuthor = localStorage.getItem('redglitch_username') || '';
        const authorInput = document.getElementById('wizard-author');
        if (authorInput) authorInput.value = savedAuthor;
    },

    is3D() { return this.IS_3D_ENGINE.includes(this.data.engineType); },
    
    selectEngine(type) {
        this.data.engineType = type;
        document.querySelectorAll('.engine-card').forEach(el => el.classList.remove('selected'));
        if (event && event.target) {
            const card = event.target.closest('.engine-card');
            if (card) card.classList.add('selected');
        }
        
        const q3d = document.getElementById('quality-3d-section');
        const q2d = document.getElementById('quality-2d-section');
        if (q3d) q3d.style.display = this.is3D() ? '' : 'none';
        if (q2d) q2d.style.display = this.is3D() ? 'none' : '';
    },

    selectQuality(level) {
        this.data.renderQuality = level;
        document.querySelectorAll('.quality-card').forEach(el => el.classList.remove('selected'));
        if (event && event.target) {
            const card = event.target.closest('.quality-card');
            if (card) card.classList.add('selected');
        }
    },
    
    selectTemplate(type) {
        this.data.template = type;
        document.querySelectorAll('.template-card').forEach(el => el.classList.remove('selected'));
        if (event && event.target) {
            const card = event.target.closest('.template-card');
            if (card) card.classList.add('selected');
        }
    },
    
    next() {
        if (this.currentStep === 1) {
            this.data.name = document.getElementById('wizard-proj-name').value.trim();
            this.data.author = document.getElementById('wizard-author').value.trim();
            if (!this.data.name) { showToast('⚠️ Please enter a project name', 'warning'); return; }
        }
        if (this.currentStep === 2 && !this.data.engineType) {
            showToast('⚠️ Please select an engine type', 'warning'); return;
        }
        if (this.currentStep < this.TOTAL_STEPS) {
            this.currentStep++;
            this.updateUI();
        }
    },
    
    prev() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    },
    
    updateUI() {
        document.querySelectorAll('.wizard-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            if (stepNum === this.currentStep) step.classList.add('active');
            if (stepNum < this.currentStep) step.classList.add('completed');
        });
        
        document.querySelectorAll('.wizard-page').forEach(page => {
            page.classList.remove('active');
            if (parseInt(page.dataset.page) === this.currentStep) page.classList.add('active');
        });

        if (this.currentStep === 3) {
            const q3d = document.getElementById('quality-3d-section');
            const q2d = document.getElementById('quality-2d-section');
            if (q3d) q3d.style.display = this.is3D() ? '' : 'none';
            if (q2d) q2d.style.display = this.is3D() ? 'none' : '';
        }
        
        document.getElementById('wizard-prev-btn').style.display = this.currentStep > 1 ? 'block' : 'none';
        document.getElementById('wizard-next-btn').style.display = this.currentStep < this.TOTAL_STEPS ? 'block' : 'none';
        document.getElementById('wizard-create-btn').style.display = this.currentStep === this.TOTAL_STEPS ? 'block' : 'none';
        
        if (this.currentStep === this.TOTAL_STEPS) {
            if (this.is3D()) {
                this.data.physics3D      = document.getElementById('opt-physics3d')?.checked ?? true;
                this.data.shadowQuality  = document.getElementById('opt-shadows')?.checked ?? true;
            }
            document.getElementById('confirm-name').textContent     = this.data.name;
            document.getElementById('confirm-author').textContent   = this.data.author || 'Anonymous';
            document.getElementById('confirm-engine').textContent   = this.data.engineType.toUpperCase().replace(/-/g, ' ');
            document.getElementById('confirm-template').textContent = this.data.template === 'blank' ? 'Blank Project' : 'Demo Project';
            const qRow = document.getElementById('confirm-quality-row');
            const qVal = document.getElementById('confirm-quality');
            if (this.is3D()) {
                if (qRow) qRow.style.display = 'flex';
                if (qVal) qVal.textContent = this.data.renderQuality.toUpperCase() + (this.data.shadowQuality ? ' + Shadows' : '');
            } else {
                if (qRow) qRow.style.display = 'none';
            }
        }
    },
    
    async create() {
        try {
            const payload = {
                name:     this.data.name,
                author:   this.data.author || 'Anonymous',
                template: this.data.template,
                engineType: this.data.engineType,
            };
            if (this.is3D()) {
                payload.renderQuality  = this.data.renderQuality;
                payload.physics3D      = this.data.physics3D;
                payload.shadowQuality  = this.data.shadowQuality;
            }
            const res = await fetch('/api/projects/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                showToast('✅ Project created successfully!', 'success');
                this.reset();
                View.show('projects');
            } else {
                const error = await res.text();
                showToast(`❌ Failed: ${error}`, 'error');
            }
        } catch(e) {
            console.error('Create project error:', e);
            showToast('❌ Error creating project', 'error');
        }
    },
    
    reset() {
        this.currentStep = 1;
        this.data = { name: '', author: '', engineType: 'rpg-topdown', template: 'blank', renderQuality: 'medium', physics3D: true, shadowQuality: true };
        const nameInput = document.getElementById('wizard-proj-name');
        if (nameInput) nameInput.value = '';
        document.querySelectorAll('.engine-card').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.template-card').forEach((el, i) => {
            el.classList.remove('selected');
            if (i === 0) el.classList.add('selected');
        });
        document.querySelectorAll('.quality-card').forEach((el, i) => {
            el.classList.toggle('selected', i === 1);
        });
        this.updateUI();
    }
};

// --- PROJECT MANAGEMENT ---
async function deleteProject(name) {
    if (!window.ConfirmModal) {
        if (!confirm(`Delete project "${name}"?`)) return;
    } else {
        ConfirmModal.show(
            'Delete Project',
            `Are you sure you want to delete "<strong>${escapeHtml(name)}</strong>"?<br><br>
            <span style="color:var(--danger);">⚠️ This action cannot be undone!</span>`,
            async () => {
                try {
                    const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('✅ Project deleted successfully', 'success');
                        loadProjects();
                    } else {
                        const error = await res.text();
                        showToast(`❌ Failed to delete: ${error}`, 'error');
                    }
                } catch(e) {
                    console.error('Delete error:', e);
                    showToast('❌ Error deleting project', 'error');
                }
            }
        );
        return;
    }
    
    // Simple fallback
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (res.ok) loadProjects();
    } catch(e) {}
}

async function revealProject(name) {
    try {
        const res = await fetch('/api/projects/reveal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!res.ok) {
            const error = await res.text();
            showToast(`❌ Failed to reveal: ${error}`, 'error');
        }
    } catch(e) {
        console.error('Reveal error:', e);
        showToast('❌ Error revealing project', 'error');
    }
}

// --- LOG MODAL ---
const LogManager = {
    logs: [],
    init: () => {
        const originalError = console.error;
        console.error = (...args) => { originalError.apply(console, args); LogManager.add('error', args.join(' ')); };
    },
    add: (type, msg) => {
        const entry = { time: new Date().toLocaleTimeString(), type, msg };
        LogManager.logs.push(entry);
        const ind = document.getElementById('status-indicator');
        if (ind && type === 'error') { ind.style.display = 'flex'; document.getElementById('status-text').innerText = 'ERR'; }
    },
    show: () => { document.getElementById('log-modal').classList.add('active'); LogManager.renderAll(); },
    hide: () => { document.getElementById('log-modal').classList.remove('active'); },
    renderAll: () => {
        const list = document.getElementById('log-list');
        if (list) list.innerHTML = LogManager.logs.map(l => `<div class="log-entry ${l.type}"><span style="color:#666">[${l.time}]</span> ${l.msg}</div>`).join('');
    }
};

// --- CONFIRMATION MODAL ---
const ConfirmModal = {
    callback: null,
    show(title, content, onConfirm) {
        document.getElementById('confirm-modal-title').textContent = title;
        document.getElementById('confirm-modal-content').innerHTML = content;
        this.callback = onConfirm;
        document.getElementById('confirm-modal').classList.add('active');
    },
    hide() {
        document.getElementById('confirm-modal').classList.remove('active');
        this.callback = null;
    },
    confirm() {
        if (this.callback) this.callback();
        this.hide();
    }
};

function saveSettings() {
    const devName = document.getElementById('dev-name-input').value.trim();
    if (devName) {
        localStorage.setItem('redglitch_username', devName);
        showToast('✅ Settings saved!', 'success');
        location.reload();
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function updateClock() {
    const clock = document.getElementById('clock');
    if (clock) clock.innerText = new Date().toLocaleTimeString();
}

// Typing brand animation
function startTypingBrand() {
    const savedName = localStorage.getItem('redglitch_username') || 'Architect';
    const brandText = `REDGLITCH STUDIO - ${savedName}`;
    let charIndex = 0;
    const brandEl = document.getElementById('typing-brand');
    if (!brandEl) return;
    
    function typeChar() {
        if (charIndex < brandText.length) {
            brandEl.textContent += brandText.charAt(charIndex);
            charIndex++;
            setTimeout(typeChar, 80);
        }
    }
    typeChar();
}

// Boot Dashboard
window.addEventListener('DOMContentLoaded', () => {
    LogManager.init();
    setInterval(updateClock, 1000);
    updateClock();
    loadProjects();
    Wizard.init();
    startTypingBrand();
});
