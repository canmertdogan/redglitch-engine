// Ambient backdrop for the hero screens — a still technical grid with a
// slow scanning sweep and a faint vignette, in the spirit of an ops-console
// HUD rather than a synthwave horizon. Pure CSS/DOM, no canvas/WebGL.
export default function RetroBackground() {
    return (
        <div className="tech-bg" aria-hidden="true">
            <div className="tech-bg-grid" />
            <div className="tech-bg-vignette" />
            <div className="tech-bg-sweep" />
        </div>
    );
}
