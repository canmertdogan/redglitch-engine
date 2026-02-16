# IRAB - MSN Messenger Redesign

## 🎨 Complete Visual Overhaul

Redesigned IRAB from Windows XP balloon style to **authentic MSN Messenger** (Windows Messenger) interface with distorted Tahoma fonts for perfect retro XP feel.

---

## ✨ New Features

### 1. MSN Messenger Window Chrome
- **Title Bar**: Blue gradient (#5199FF → #0F3D8C → #052256)
- **Borders**: 3px bevel (#0F3D8C top/left, #052256 bottom/right)
- **Shadow**: 4px blur with 0.6 opacity
- **Icon**: 20x20 IRAB helper.png in title
- **Controls**: Settings (⚙) and Close (×) buttons

### 2. MSN-Style Message Bubbles
**Structure**:
```
┌─────────────────────────────────┐
│ [Avatar] Name          3:45 PM  │
│          ┌──────────────────┐   │
│          │ Message text...  │   │
│          └──────────────────┘   │
└─────────────────────────────────┘
```

**Avatar Types**:
- **User**: Blue background, white "U" letter
- **IRAB**: helper.png sprite (36x36)
- **System**: Orange background, white "ℹ" icon
- **Error**: Red background, white "!" icon

**Bubble Colors**:
- **User**: Light blue (#D4E7FF, border #99BBEE)
- **IRAB**: Light pink (#FFE7F0, border #FFBBDD)
- **System**: Light yellow (#FFFFDD, border #FFEE99, italic)
- **Error**: Light red (#FFDDDD, border #FFAAAA)

### 3. Distorted/Pixelated Tahoma Font
**CSS Properties**:
```css
font-family: Tahoma, Verdana, sans-serif;
-webkit-font-smoothing: none;
-moz-osx-font-smoothing: grayscale;
text-rendering: optimizeSpeed;
font-smooth: never;
-webkit-text-stroke: 0.1px;  /* Subtle distortion */
image-rendering: crisp-edges;
```

**Result**: Slightly distorted, pixelated text that matches authentic Windows XP/MSN Messenger rendering

### 4. AI Settings Panel ⚙
**Accessible via**: Settings button (⚙) in title bar

**Settings Groups**:

**AI Provider**:
- Local (Transformers.js) - Desktop/Web
- Cerebras (Cloud) - Android/Web

**Response Style**:
- ✓ Use IRAB personality (CAPS, quirky)
- ✓ Show helpful tips

**Automation**:
- ✓ Enable auto-suggestions
- ☐ Always ask before actions

**Knowledge Base**:
- ✓ Use studio documentation
- ✓ Enable tutorials

**Cerebras API Key**:
- Text input for cloud API key
- Format: `csk-...`

**Max Response Length**:
- Number input: 100-2000 tokens
- Default: 500

**Actions**:
- [Save Settings] - Saves to localStorage
- [Reset Defaults] - Restores defaults

### 5. MSN Speech Bubble (Notification)
**Style**: Same MSN window chrome as chat
- Blue gradient header
- "💬 IRAB says..." title
- Close button (×)
- White content area
- Gray footer with action buttons
- [Open Chat] [Close] buttons

### 6. Enhanced Input Area
**Textarea**:
- Multi-line (60px height)
- White background
- Blue focus outline
- Tahoma font

**Toolbar**:
- 😊 Emoticons button
- ? Help button
- [Send] button (green gradient)

**Character Counter**:
- Shows: `0/500` characters
- Updates as you type
- Located in status bar

**Keyboard**:
- **Enter** → Send message
- **Shift+Enter** → New line

### 7. Status Bar
**Left Side**:
- Green dot (●) - Online
- Orange dot (●) - Thinking (pulsing animation)
- Status text: "Online - Ready to help!" / "🤔 IRAB is thinking..."

**Right Side**:
- Character count: `0/500`

---

## 🎯 Color Palette - MSN Theme

```
MSN Blue (Light):  #5199FF  ███████ (title bar top)
MSN Blue (Mid):    #0F3D8C  ███████ (title bar mid)
MSN Blue (Dark):   #052256  ███████ (title bar bottom, borders)

User Bubble:       #D4E7FF  ███████ (light blue)
User Border:       #99BBEE  ███████ (medium blue)
User Name:         #0066CC  ███████ (blue)

IRAB Bubble:       #FFE7F0  ███████ (light pink)
IRAB Border:       #FFBBDD  ███████ (medium pink)
IRAB Name:         #CC0066  ███████ (magenta)

System Bubble:     #FFFFDD  ███████ (light yellow)
System Border:     #FFEE99  ███████ (medium yellow)

Error Bubble:      #FFDDDD  ███████ (light red)
Error Border:      #FFAAAA  ███████ (medium red)

Input Bg:          #F5F5F5  ███████ (very light gray)
Border:            #7F9DB9  ███████ (gray-blue)

Send Button:       #66DD66  ███████ (light green top)
Send Button Bot:   #44BB44  ███████ (medium green)

Status Online:     #44CC44  ███████ (green)
Status Thinking:   #FFAA00  ███████ (orange)
```

---

## 📐 Layout & Dimensions

### Chat Window
- **Width**: 450px
- **Height**: 550px
- **Position**: Bottom-right (100px from bottom, 20px from right)
- **Border**: 3px solid beveled
- **Shadow**: 4px 4px 12px rgba(0,0,0,0.6)

### Title Bar
- **Height**: ~30px
- **Icon**: 20x20px
- **Buttons**: 22x22px each
- **Font**: 11px Tahoma bold

### Message Avatar
- **Size**: 36x36px
- **Border**: 1px solid #999
- **Spacing**: 10px gap from bubble

### Message Bubble
- **Padding**: 7px 12px
- **Font**: 11px Tahoma
- **Line Height**: 1.5
- **Border**: 1px solid

### Input Area
- **Height**: 60px (textarea)
- **Padding**: 8px
- **Font**: 11px Tahoma
- **Border**: 1px solid #7F9DB9

### Status Bar
- **Height**: ~25px
- **Font**: 10px
- **Padding**: 4px 10px
- **Dot**: 10px circle

### Settings Panel
- **Width**: 320px
- **Max Height**: 400px (scrollable)
- **Border**: 2px solid #0F3D8C
- **Position**: Absolute, top: 35px, right: 0

---

## 🔧 Technical Implementation

### File Structure
```
public/ai/ui/
├── assistant-panel.html      # NEW: MSN Messenger UI
├── assistant-panel-old-xp.html  # BACKUP: Old XP balloon
├── assistant-panel.js         # Updated with MSN features
└── assistant-panel-msn.html   # BACKUP: MSN original
```

### Key Components

**1. MSN Window**:
```html
<div id="ai-chat-panel">
  <div id="ai-chat-header">
    <span id="ai-chat-title">...</span>
    <div class="msn-controls">...</div>
  </div>
  <div id="ai-chat-messages">...</div>
  <div id="ai-chat-input-container">...</div>
  <div class="msn-status-bar">...</div>
</div>
```

**2. Message Structure**:
```html
<div class="ai-message user|assistant|system|error">
  <div class="ai-message-avatar">...</div>
  <div class="ai-message-content">
    <div>
      <span class="ai-message-name">Name</span>
      <span class="ai-message-timestamp">3:45 PM</span>
    </div>
    <div class="ai-message-bubble">Message text...</div>
  </div>
</div>
```

**3. Settings Panel**:
```html
<div id="msn-settings">
  <div class="msn-settings-header">...</div>
  <div class="msn-settings-content">
    <div class="msn-setting-group">...</div>
    ...
  </div>
</div>
```

### JavaScript Features

**Settings Controller**:
```javascript
class AISettingsController {
  loadSettings()   // From localStorage
  saveSettings()   // To localStorage
  toggle()         // Show/hide panel
  save()           // Save form to settings
  reset()          // Reset to defaults
  loadToForm()     // Populate form fields
}
```

**Enhanced Message Method**:
```javascript
addMessage(type, text) {
  // Creates avatar
  // Adds name + timestamp
  // Styles bubble based on type
  // Auto-scrolls to bottom
  // Updates status indicator
}
```

**Input Enhancement**:
- Character counter
- Enter/Shift+Enter handling
- Auto-clear on send

---

## ⚡ Interactions

### Keyboard Shortcuts
- **Ctrl+K** / **Cmd+K** → Toggle chat
- **Esc** → Close chat
- **Enter** → Send message
- **Shift+Enter** → New line

### Mouse Actions
- **Click IRAB sprite** → Toggle chat
- **Click ⚙** → Open settings
- **Click ×** → Close window/panel
- **Click [Send]** → Send message
- **Click emoticons** → (Placeholder for future)

### Status Indicators
- **Green dot** → Online, ready
- **Orange dot (pulsing)** → Thinking/processing
- **Status text** → Current state

---

## 🎨 Visual Comparison

### Before (XP Balloon)
```
     [👾]  ← 64x64 sprite
      ↓
┌──────────────┐
│ Simple text  │  ← Light yellow, rounded
└──────────────┘
      ▼           ← Triangle tail
```

### After (MSN Messenger)
```
╔═══════════════════════════════════╗
║ [IRAB] IRAB - Your Studio... ⚙ × ║ ← Blue gradient
╠═══════════════════════════════════╣
║ [Avatar] Name           3:45 PM   ║
║          ┌─────────────────────┐  ║
║          │ Pink bubble message │  ║
║          └─────────────────────┘  ║
║                                   ║
╠═══════════════════════════════════╣
║ [Type message...]     [Send]     ║
╠═══════════════════════════════════╣
║ ● Online - Ready!      0/500     ║
╚═══════════════════════════════════╝
```

---

## 📝 Usage Guide

### Opening Chat
1. Click IRAB sprite (64x64, bottom-right)
2. Or press **Ctrl+K** / **Cmd+K**
3. MSN window appears above sprite

### Sending Messages
1. Type in textarea
2. Watch character counter
3. Press **Enter** to send
4. Or click green **[Send]** button

### Using Settings
1. Click **⚙** button in title bar
2. Adjust AI settings
3. Click **[Save Settings]**
4. Settings stored in localStorage

### Closing Chat
1. Click **×** button
2. Or press **Esc**
3. Or press **Ctrl+K** / **Cmd+K** again

---

## 🧪 Testing Checklist

### Visual
- [ ] MSN blue gradient title bar
- [ ] 3px beveled borders
- [ ] Distorted Tahoma font
- [ ] Message avatars (36x36)
- [ ] Colored bubbles per type
- [ ] Timestamps on messages
- [ ] Status bar with green dot
- [ ] Character counter (0/500)

### Interactive
- [ ] Settings panel opens/closes
- [ ] All settings save correctly
- [ ] Messages send with Enter
- [ ] Character counter updates
- [ ] Status changes to orange when thinking
- [ ] Auto-scroll to new messages
- [ ] Ctrl+K toggles window
- [ ] Esc closes window

### Functional
- [ ] Settings persist after reload
- [ ] Reset defaults works
- [ ] User/IRAB/System/Error types display correctly
- [ ] Timestamps format correctly
- [ ] Input clears after send
- [ ] No console errors

---

## 🎉 Success Criteria

✅ **MSN Messenger Aesthetic** - Authentic 2003 MSN look  
✅ **Distorted Tahoma Font** - Pixelated XP rendering  
✅ **Avatar-Based Messages** - 36x36 icons per message  
✅ **Colored Bubbles** - Blue/Pink/Yellow/Red by type  
✅ **AI Settings Panel** - Full configuration UI  
✅ **Status Indicators** - Green/Orange dots with text  
✅ **Enhanced Input** - Multi-line, char counter, Enter to send  
✅ **MSN Window Chrome** - Blue gradients, beveled borders  
✅ **Timestamps** - Time shown for each message  

---

**Status**: COMPLETE ✅  
**Style**: MSN Messenger (Windows Messenger)  
**Font**: Tahoma (distorted/pixelated)  
**Theme**: Blue/Pink/Yellow retro  

**GRRR... MSN STYLE IRAB IS HERE! 💬**
