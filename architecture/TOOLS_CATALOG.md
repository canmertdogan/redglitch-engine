# Tools Catalog

The `public/` directory contains a vast array of specialized tools. ketebe ENGINE follows the "Unix Philosophy": write programs that do one thing and do it well, communicating via the Event Bus.

## Core Workbench
*   **Dashboard (`dashboard.html`)**: The entry point. Lists recent projects, recent activity, and provides quick access to all other tools.
*   **Code Forge (`script_editor.html`)**: A full-featured code editor (using Monaco Editor) for writing Logic Scripts and Engine code. Supports syntax highlighting, autocomplete, and file tree navigation.
*   **Asset Manager (`asset_manager.html`)**: The explorer for all project files (images, sounds, data). Allows importing, deleting, and renaming assets.

## Level Design
*   **Iso Studio (`iso_editor.html`)**: The level editor for the **IsoPixel** engine. Features:
    *   Tile placement (Paint, Fill).
    *   Height/Elevation tools.
    *   Prop/Decor placement.
    *   Lighting/FX configuration.
*   **World Generator (`world_generator.js`)**: A procedural generation tool (often embedded in Iso Studio) for creating terrain.

## Gameplay Systems
*   **NPC Studio (`npc_editor.html`)**: Creates and configures Non-Player Characters (visuals, stats, behavior).
*   **Dialogue Weaver (`dialogue_editor.html`)**: A node-based editor for creating branching conversations.
*   **Quest Maker (`quest_editor.html`)**: Manages game quests, objectives, and rewards.
*   **Item/Skill Editors (`item_editor.html`, `skill_editor.html`)**: Database tools for RPG data.

## Visual & Audio
*   **Pixel Studio (`pixel_editor.html`)**: A built-in pixel art drawing tool for creating sprites without leaving the engine.
*   **Audio Tool (`audio_tool.html`)**: A simple SFX generator and previewer.
*   **FX Editor (`fx_editor.html`)**: A tool for designing particle effects and saving them as JSON configurations.
*   **Background Editor (`background_editor.html`)**: Configures parallax backgrounds.

## Logic & Behavior
*   **Behavior Editor (`behavior_editor.html`)**: A visual Behavior Tree editor for AI.
*   **Algorithm Editor (`algorithm_editor.html`)**: A node-based visual scripting tool for game logic (alternative to writing JS).

## Utilities
*   **Console (`console.html`)**: A standalone debug console that connects to the game runtime to show logs and errors.
*   **Search (`search_tool.html`)**: Global search across project assets.
*   **Campaign Browser (`campaign_browser.html`)**: Manager for game campaigns (levels linked together).

## AI Components
*   **AI Chat (`ai-chat-ui.js`)**: The new "Micro Edition" AI assistant interface.
*   **Legacy Assistant (`assistant.js`)**: Old "Clippy-style" assistant (being deprecated).
