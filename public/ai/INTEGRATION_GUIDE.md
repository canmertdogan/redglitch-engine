# Ketebe AI Assistant - Integration Guide

## What Has Been Implemented

### Core Components Created:

1. **Enhanced Permission Gate** (`public/ai/permission-gate.js`)
   - File blacklist system protecting critical files
   - Audit logging for all AI actions
   - User approval modals with preview
   - Block modal for protected file attempts

2. **Editor Tools** (`public/ai/tools/editor-tools.js`)
   - Safe navigation (open editors, get context)
   - Write operations (fill fields, click buttons, create assets)
   - Build automation
   - Action preview system

3. **AI Assistant Core** (`public/ai/ketebe-ai-assistant.js`)
   - Query processing and classification
   - Q&A system with RAG integration
   - Action execution with permission checks
   - Tutorial provisioning
   - Conversation history management

4. **Knowledge Base** (`public/ai/knowledge/`)
   - `studio-docs.json` - All 26 editors documented
   - `tutorials.json` - 5 step-by-step tutorials
   - `faq.json` - 15 common questions and answers

5. **UI Components** (`public/ai/ui/`)
   - `assistant-panel.html` - Floating Clippy + chat panel + tutorial overlay
   - `assistant-panel.js` - UI controller with full interaction logic

## How to Integrate into Launcher

### Step 1: Add to Launcher HTML

Add this to your launcher's `index.html` (or main dashboard):

```html
<!-- Near the end of <body>, before closing tag -->
<iframe id="ai-assistant-frame" src="ai/ui/assistant-panel.html" 
        style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
               border: none; pointer-events: none; z-index: 9999;">
</iframe>

<script>
    // Make iframe allow pointer events on assistant elements only
    const aiFrame = document.getElementById('ai-assistant-frame');
    aiFrame.addEventListener('load', () => {
        // Frame content is interactive
        aiFrame.style.pointerEvents = 'auto';
        // But frame itself is transparent to clicks except on UI elements
        aiFrame.contentWindow.document.body.style.pointerEvents = 'none';
        aiFrame.contentWindow.document.querySelectorAll('#ai-assistant-container, #ai-chat-panel, #ai-tutorial-overlay').forEach(el => {
            el.style.pointerEvents = 'auto';
        });
    });
</script>
```

### Step 2: Add AI Button to Launcher Dashboard

In your launcher's toolbar/menu, add:

```html
<button id="open-ai-assistant" class="launcher-btn">
    🤖 AI Assistant (Ctrl+Shift+A)
</button>

<script>
    document.getElementById('open-ai-assistant').addEventListener('click', () => {
        const aiFrame = document.getElementById('ai-assistant-frame');
        if (aiFrame && aiFrame.contentWindow.AIChatUI) {
            aiFrame.contentWindow.AIChatUI.openChat();
        }
    });
</script>
```

### Step 3: Add to Each Editor

For each editor HTML file, add this near the end of `<body>`:

```html
<!-- AI Assistant Integration -->
<script type="module">
    import { AIChatUIController } from '/ai/ui/assistant-panel.js';
    window.AIChatUI = new AIChatUIController();
    await window.AIChatUI.initialize();
</script>
```

Or include the iframe approach (recommended for consistency):

```html
<iframe src="/ai/ui/assistant-panel.html" id="editor-ai-assistant"
        style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
               border: none; pointer-events: auto; z-index: 9999;">
</iframe>
```

### Step 4: Configure Protected Files

The AI assistant already has these files protected by default:

```javascript
- /public/engines/*/main.js
- /public/engines/*/strategies/*
- /public/shared/SharedProjectState.js
- /public/ai/permission-gate.js
- /server.js
- /electron-main.js
- /build-game.js
- /build-adapter.js
- capacitor.config.ts
- package.json
- package-lock.json
```

To add more protected files, edit `public/ai/permission-gate.js`:

```javascript
static PROTECTED_PATTERNS = [
    // ... existing patterns ...
    /\/your-critical-file\.js$/,  // Add your pattern here
];
```

## Usage Examples

### For Users:

**Open AI Assistant:**
- Click the floating 🤖 icon
- Press `Ctrl+Shift+A` (anywhere in the studio)
- Click "AI Assistant" button in launcher

**Ask Questions:**
- "How do I create an NPC?"
- "What editors are available?"
- "How does the quest system work?"

**Request Actions:**
- "Open the dialogue editor"
- "Create an NPC named Bob"
- "Build my game for Android"
- "Show me how to add a quest"

**Tutorials:**
- "Show me how to create a quest"
- "Guide me through creating an NPC"

### Keyboard Shortcuts:

- `Ctrl+Shift+A` - Toggle AI assistant chat panel

## Safety Features

### What AI CANNOT Do:

❌ Modify engine core files (`main.js` in engines)
❌ Change state management system
❌ Edit build scripts
❌ Modify permission gate itself
❌ Alter server configuration
❌ Change package dependencies without approval

### What AI CAN Do (with approval):

✅ Open editors
✅ Fill form fields
✅ Create assets (NPCs, quests, items, etc.)
✅ Trigger builds
✅ Save editor state
✅ Load project data (read-only)

### Safety Guarantees:

🔒 All write/delete operations require user approval
🔒 Preview shown before execution
🔒 Audit log tracks all actions
🔒 Hardcoded file blacklist (cannot be bypassed)
🔒 Works with existing undo/redo system

## Testing Checklist

- [ ] Open launcher and see 🤖 icon in bottom-right
- [ ] Click icon to open chat panel
- [ ] Type "help" and verify response
- [ ] Ask "How do I create an NPC?" and verify knowledge base answer
- [ ] Try "Open the quest editor" and verify navigation
- [ ] Try "Create an NPC named TestBot" and verify permission modal appears
- [ ] Approve action and verify NPC is created
- [ ] Try to modify a protected file path (should be blocked)
- [ ] Check console for audit log entries
- [ ] Test Ctrl+Shift+A shortcut

## Troubleshooting

### AI not appearing:
- Check console for errors
- Verify `/ai/ui/assistant-panel.html` loads
- Ensure module imports are working

### Permission gate not working:
- Check `permission-gate.js` is loaded
- Verify `canModifyFile()` is being called
- Check console for audit logs

### Knowledge base empty:
- Verify JSON files in `/ai/knowledge/` exist
- Check network tab for failed fetches
- Ensure RAG engine is initialized

### Actions not executing:
- Check permission modal responses
- Verify EditorTools methods exist
- Check for JavaScript errors in console

## Advanced Configuration

### Custom Tools:

Add to `editor-tools.js`:

```javascript
async customAction(params) {
    const preview = `Do something with ${params}`;
    const allowed = await this.permissionGate.requestPermission(
        'customAction', { params, preview }, true
    );
    if (!allowed) return { success: false };
    
    // Your logic here
    return { success: true };
}
```

### Custom Knowledge:

Add to knowledge JSON files or create new ones in `/ai/knowledge/` and update `ketebe-ai-assistant.js`:

```javascript
const knowledgeFiles = [
    'studio-docs.json',
    'tutorials.json',
    'faq.json',
    'your-custom-knowledge.json'  // Add here
];
```

### Custom Tutorials:

Add to `tutorials.json`:

```json
{
    "id": "your-tutorial-id",
    "title": "Your Tutorial Title",
    "keywords": "search keywords",
    "difficulty": "beginner|intermediate|advanced",
    "estimatedTime": "X minutes",
    "steps": [
        {
            "number": 1,
            "instruction": "What to do",
            "action": "actionName",
            "params": {},
            "selector": "#element-to-highlight"
        }
    ]
}
```

## Performance Notes

- AI models lazy load (only when assistant is first invoked)
- RAG search is optimized with vector store caching
- Conversation history limited to 20 messages
- Audit log capped at 1000 entries

## Privacy

✅ All AI runs locally (no external API calls)
✅ No telemetry or data collection
✅ Audit log stays on local machine
✅ User data never leaves device

## Next Steps

1. Test the integration
2. Gather user feedback
3. Add more tutorials based on common workflows
4. Expand knowledge base as features are added
5. Consider adding voice input (optional enhancement)

---

**Created:** 2026-02-08  
**Status:** Core implementation complete, ready for integration testing
