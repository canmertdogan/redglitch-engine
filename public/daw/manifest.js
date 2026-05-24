/**
 * MASTER ENGINE AUDIO MANIFEST
 * A complete catalog of every detectable event in the Ketebe Engine.
 */
const ENGINE_AUDIO_MANIFEST = {
    PLAYER: [
        { id: "player:footstep", desc: "Footfall on current terrain" },
        { id: "player:jump", desc: "Initiating a jump" },
        { id: "player:land", desc: "Landing from a height" },
        { id: "player:hurt", desc: "Taking damage" },
        { id: "player:death", desc: "Player life reaching zero" },
        { id: "player:attack", desc: "Primary weapon/action trigger" },
        { id: "player:dodge", desc: "Evasive maneuver" },
        { id: "player:respawn", desc: "Restoration to checkpoint" }
    ],
    COMBAT: [
        { id: "enemy:spawn", desc: "Enemy appearing in world" },
        { id: "enemy:alert", desc: "Enemy detecting player" },
        { id: "enemy:hurt", desc: "Enemy taking damage" },
        { id: "enemy:death", desc: "Enemy life reaching zero" },
        { id: "enemy:attack", desc: "Enemy initiating action" },
        { id: "projectile:fire", desc: "Ranged attack launch" },
        { id: "projectile:hit", desc: "Projectile colliding with target" },
        { id: "ability:cast", desc: "Special ability trigger" }
    ],
    WORLD: [
        { id: "level:start", desc: "Initial world loading" },
        { id: "level:complete", desc: "Goal reached" },
        { id: "level:fail", desc: "Failure condition met" },
        { id: "checkpoint", desc: "Progress saved in-game" },
        { id: "item:pickup", desc: "Acquiring an asset" },
        { id: "item:use", desc: "Consuming or activating item" },
        { id: "door:open", desc: "Transition between zones" },
        { id: "door:close", desc: "Closing transition" }
    ],
    UI: [
        { id: "ui:click", desc: "Button confirmation" },
        { id: "ui:hover", desc: "Pointer entering interaction zone" },
        { id: "ui:open", desc: "Menu appearing" },
        { id: "ui:close", desc: "Menu dismissing" },
        { id: "ui:error", desc: "Invalid operation signal" },
        { id: "ui:success", desc: "Task completion signal" },
        { id: "ui:tab:switch", desc: "Navigation change" }
    ],
    AMBIENT: [
        { id: "ambient:forest", desc: "Nature/Outdoor loop" },
        { id: "ambient:dungeon", desc: "Indoor/Echo loop" },
        { id: "ambient:boss_area", desc: "High-tension loop" },
        { id: "ambient:underwater", desc: "Muffled environmental loop" }
    ],
    AI: [
        { id: "ai:thought", desc: "Assistant generating idea" },
        { id: "ai:token", desc: "Text generation stream" },
        { id: "ai:ready", desc: "Assistant online" },
        { id: "ai:error", desc: "Assistant failure" }
    ]
};

if (typeof window !== 'undefined') window.ENGINE_AUDIO_MANIFEST = ENGINE_AUDIO_MANIFEST;
