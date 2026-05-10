// achievements_editor.js - ACHIEVEMENT STUDIO PRO v2.1
// Logic Core (Compact Edition)

class AchievementEditor {
    constructor() {
        this.data = [];
        this.selectedId = null;
        this.icons = ["🏆", "⚔️", "🛡️", "💰", "💀", "💎", "📜", "🔑", "❤️", "⭐", "🔥", "💧", "🌿", "🏹", "🧙‍♂️", "🐉"];
        
        this.dom = {
            list: document.getElementById('ach-list'),
            form: document.getElementById('editor-form'),
            previewHeader: document.getElementById('preview-header'),
            empty: document.getElementById('empty-state'),
            inputs: {
                id: document.getElementById('inp-id'),
                title: document.getElementById('inp-title'),
                desc: document.getElementById('inp-desc'),
                trigger: document.getElementById('inp-trigger'),
                target: document.getElementById('inp-target'),
                secret: document.getElementById('inp-secret'),
                prereq: document.getElementById('inp-prereq'),
                rewardType: document.getElementById('inp-reward-type'),
                rewardValue: document.getElementById('inp-reward-value')
            },
            preview: {
                icon: document.getElementById('prev-icon'),
                title: document.getElementById('prev-title'),
                desc: document.getElementById('prev-desc')
            },
            iconPicker: document.getElementById('icon-picker')
        };

        this.init();
    }

    async init() {
        this.setupInputs();
        this.renderIconPicker();
        await this.loadData();
    }

    async loadData() {
        try {
            let rawRes = await fetch('/dunyalar/definitions/achievements.json');
            if (rawRes.ok) {
                this.data = await rawRes.json();
            } else {
                this.data = [];
            }
        } catch (e) {
            console.warn("No achievements found, starting fresh.");
            this.data = [];
        }
        this.renderList();
    }

    setupInputs() {
        const update = () => {
            if (!this.selectedId) return;
            const item = this.data.find(a => a.id === this.selectedId);
            if (!item) return;

            item.id = this.dom.inputs.id.value;
            item.title = this.dom.inputs.title.value;
            item.desc = this.dom.inputs.desc.value;
            item.trigger = this.dom.inputs.trigger.value;
            item.target = this.dom.inputs.target.value;
            item.secret = this.dom.inputs.secret.checked;
            item.prereq = this.dom.inputs.prereq.value;
            item.rewardType = this.dom.inputs.rewardType.value;
            item.rewardValue = this.dom.inputs.rewardValue.value;

            this.updatePreview(item);
            this.renderListItem(item);
        };

        Object.values(this.dom.inputs).forEach(inp => {
            const evt = inp.type === 'checkbox' ? 'change' : 'input';
            inp.addEventListener(evt, update);
        });
    }

    renderIconPicker() {
        this.dom.iconPicker.innerHTML = '';
        this.icons.forEach(icon => {
            const btn = document.createElement('div');
            btn.className = 'icon-btn';
            btn.innerText = icon;
            btn.onclick = () => {
                if (!this.selectedId) return;
                const item = this.data.find(a => a.id === this.selectedId);
                item.icon = icon;
                this.updatePreview(item);
                this.renderListItem(item);
                this.highlightIcon(icon);
            };
            this.dom.iconPicker.appendChild(btn);
        });
    }

    highlightIcon(currentIcon) {
        Array.from(this.dom.iconPicker.children).forEach(btn => {
            if (btn.innerText === currentIcon) btn.classList.add('selected');
            else btn.classList.remove('selected');
        });
    }

    renderList() {
        this.dom.list.innerHTML = '';
        this.data.forEach(item => {
            const el = document.createElement('div');
            el.className = 'ach-item';
            el.dataset.id = item.id;
            el.innerHTML = `
                <div class="ach-item-icon">${item.icon || '🏆'}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title || 'Untitled'}</div>
                    <div style="font-size:0.7rem; color:#444">${item.id}</div>
                </div>
            `;
            el.onclick = () => this.select(item.id);
            this.dom.list.appendChild(el);
        });
    }

    renderListItem(item) {
        const el = this.dom.list.querySelector(`.ach-item[data-id="${item.id}"]`);
        if (el) {
            el.innerHTML = `
                <div class="ach-item-icon">${item.icon || '🏆'}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title || 'Untitled'}</div>
                    <div style="font-size:0.7rem; color:#444">${item.id}</div>
                </div>
            `;
        }
    }

    select(id) {
        this.selectedId = id;
        
        this.dom.form.style.display = 'grid';
        this.dom.previewHeader.style.display = 'flex';
        this.dom.empty.style.display = 'none';
        
        document.querySelectorAll('.ach-item').forEach(el => el.classList.remove('active'));
        const activeEl = this.dom.list.querySelector(`.ach-item[data-id="${id}"]`);
        if (activeEl) activeEl.classList.add('active');

        const item = this.data.find(a => a.id === id);
        this.dom.inputs.id.value = item.id;
        this.dom.inputs.title.value = item.title;
        this.dom.inputs.desc.value = item.desc;
        this.dom.inputs.trigger.value = item.trigger || 'MANUAL';
        this.dom.inputs.target.value = item.target || '';
        this.dom.inputs.secret.checked = !!item.secret;
        this.dom.inputs.prereq.value = item.prereq || '';
        this.dom.inputs.rewardType.value = item.rewardType || 'NONE';
        this.dom.inputs.rewardValue.value = item.rewardValue || '';
        
        this.highlightIcon(item.icon);
        this.updatePreview(item);
    }

    updatePreview(item) {
        this.dom.preview.icon.innerText = item.icon || '🏆';
        this.dom.preview.title.innerText = item.title || 'ACHIEVEMENT NAME';
        this.dom.preview.desc.innerText = item.desc || 'Description preview...';
    }

    create() {
        const id = `ach_${Date.now().toString().slice(-4)}`;
        const newItem = {
            id: id,
            title: "New Achievement",
            desc: "Description...",
            icon: "🏆",
            trigger: "MANUAL",
            target: "",
            secret: false,
            prereq: "",
            rewardType: "NONE",
            rewardValue: ""
        };
        this.data.push(newItem);
        this.renderList();
        this.select(id);
    }

    delete() {
        if (!this.selectedId) return;
        if (confirm("Delete this achievement?")) {
            this.data = this.data.filter(a => a.id !== this.selectedId);
            this.selectedId = null;
            this.dom.form.style.display = 'none';
            this.dom.previewHeader.style.display = 'none';
            this.dom.empty.style.display = 'block';
            this.renderList();
        }
    }

    async save() {
        try {
            const content = JSON.stringify(this.data, null, 2);
            const res = await fetch('/api/ide/write', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    file: 'dunyalar/definitions/achievements.json',
                    content: content
                })
            });

            if (res.ok) {
                if (window.KetebeEventBus) {
                    window.KetebeEventBus.emit('achievements:updated', this.data);
                }
                alert("DATABASE UPDATED.");
            } else alert("SAVE FAILED.");
            
        } catch (e) {
            console.error(e);
            alert("ERROR SAVING");
        }
    }
}

window.editor = new AchievementEditor();