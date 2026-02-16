class PlatformerStrategy extends TopDownStrategy {
    render(ctx, map, state, config, tileset) {
        // Platformer specific background (Darker, less "void" like)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Use parent render for visual layers
        const ts = config.tileSize * config.scale;
        super.render(ctx, map, state, config, tileset);
        
        // Custom Collision Overlay for Platformer
        const showCollision = document.getElementById('show-collision')?.checked || state.mode === 'collision';
        if (showCollision) {
            for (let i = 0; i < map.collision.length; i++) {
                const type = map.collision[i];
                if (type === 0) continue;

                const x = (i % map.width) * ts;
                const y = Math.floor(i / map.width) * ts;
                
                if (type === 1) ctx.fillStyle = 'rgba(46, 204, 113, 0.5)'; // Solid (Green)
                else if (type === 2) ctx.fillStyle = 'rgba(52, 152, 219, 0.5)'; // OneWay (Blue)
                else if (type === 3) ctx.fillStyle = 'rgba(231, 76, 60, 0.5)'; // Hazard (Red)
                else ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Unknown

                ctx.fillRect(x, y, ts, ts);
                
                // Borders for clarity
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.strokeRect(x, y, ts, ts);
            }
        }
    }
}
window.PlatformerStrategy = PlatformerStrategy;