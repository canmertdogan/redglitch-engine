document.addEventListener('DOMContentLoaded', () => {

    // --- Bootloader Sequence ---
    const bootloader   = document.getElementById('bootloader');
    const bootProgress = document.getElementById('boot-progress');
    if (bootloader && bootProgress) {
        const steps = [
            'MOUNTING_VFS...',
            'LOADING_ENGINE_CORES...',
            'LINKING_KAI_NEURAL...',
            'INITIALIZING_ISO_BUS...',
            'SYSTEM_READY'
        ];
        let step = 0;
        const interval = setInterval(() => {
            bootProgress.textContent = steps[step];
            step++;
            if (step >= steps.length) {
                clearInterval(interval);
                setTimeout(() => bootloader.classList.add('loaded'), 400);
            }
        }, 280);
    }

    // --- Mobile Menu ---
    const menuToggle = document.getElementById('menuToggle');
    const menuClose  = document.getElementById('menuClose');
    const mobileMenu = document.getElementById('mobileMenu');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => mobileMenu.classList.add('open'));
        if (menuClose) menuClose.addEventListener('click', () => mobileMenu.classList.remove('open'));
        mobileMenu.querySelectorAll('.mobile-link').forEach(link => {
            link.addEventListener('click', () => mobileMenu.classList.remove('open'));
        });
    }

    // --- Copy Buttons ---
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.getAttribute('data-code') || btn.closest('.code-block')?.querySelector('code')?.textContent || '';
            navigator.clipboard.writeText(code).then(() => {
                const orig = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = orig; }, 2000);
            }).catch(() => {});
        });
    });

    // --- Hero Isometric Canvas ---
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;

    function resize() {
        width  = canvas.offsetWidth;
        height = canvas.offsetHeight;
        canvas.width  = width  * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    window.addEventListener('resize', resize);
    resize();

    const TILE = 30;
    const COLS = 8;
    const ROWS = 8;

    // Build tile grid with randomized heights
    const grid = [];
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            const isAccent = Math.random() > 0.82;
            grid.push({
                x, y,
                baseZ: Math.random() * 0.6,
                color: isAccent ? '#f1c40f' : '#1a1a1a',
                top:   isAccent ? '#f5d147' : '#222222',
                left:  isAccent ? '#c9a50b' : '#111111',
                right: isAccent ? '#b8950a' : '#0d0d0d',
            });
        }
    }
    grid.sort((a, b) => (a.x + a.y) - (b.x + b.y));

    function drawTile(x, y, z) {
        const tile = grid.find(t => t.x === x && t.y === y);
        if (!tile) return;

        const isoX = (x - y) * TILE;
        const isoY = (x + y) * (TILE / 2) - z * TILE;
        const sx = width / 2 + isoX;
        const sy = height / 2 + isoY - TILE;

        // Top face
        ctx.fillStyle = tile.top;
        ctx.beginPath();
        ctx.moveTo(sx,        sy);
        ctx.lineTo(sx + TILE, sy + TILE / 2);
        ctx.lineTo(sx,        sy + TILE);
        ctx.lineTo(sx - TILE, sy + TILE / 2);
        ctx.closePath();
        ctx.fill();

        // Left face
        ctx.fillStyle = tile.left;
        ctx.beginPath();
        ctx.moveTo(sx - TILE, sy + TILE / 2);
        ctx.lineTo(sx,        sy + TILE);
        ctx.lineTo(sx,        sy + TILE * 1.6);
        ctx.lineTo(sx - TILE, sy + TILE * 1.1);
        ctx.closePath();
        ctx.fill();

        // Right face
        ctx.fillStyle = tile.right;
        ctx.beginPath();
        ctx.moveTo(sx + TILE, sy + TILE / 2);
        ctx.lineTo(sx,        sy + TILE);
        ctx.lineTo(sx,        sy + TILE * 1.6);
        ctx.lineTo(sx + TILE, sy + TILE * 1.1);
        ctx.closePath();
        ctx.fill();
    }

    let time = 0;
    function animate() {
        time += 0.025;
        ctx.clearRect(0, 0, width, height);

        for (const tile of grid) {
            const wave = Math.sin(time + tile.x * 0.6 + tile.y * 0.6) * 0.5;
            drawTile(tile.x, tile.y, tile.baseZ + wave);
        }

        requestAnimationFrame(animate);
    }
    animate();

});
