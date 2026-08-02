document.addEventListener('DOMContentLoaded', () => {

    document.body.classList.add('ready');

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
                btn.textContent = 'Copied';
                setTimeout(() => { btn.textContent = orig; }, 1800);
            }).catch(() => {});
        });
    });

    // --- Reveal on scroll ---
    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && revealEls.length) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(el => io.observe(el));
    } else {
        revealEls.forEach(el => el.classList.add('in-view'));
    }

    // --- Metric counters ---
    const counters = document.querySelectorAll('[data-count]');
    if ('IntersectionObserver' in window && counters.length) {
        const countIo = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-count'), 10) || 0;
                const suffix = el.getAttribute('data-suffix') || '';
                const duration = 900;
                const start = performance.now();
                function tick(now) {
                    const p = Math.min(1, (now - start) / duration);
                    const eased = 1 - Math.pow(1 - p, 3);
                    el.textContent = Math.round(eased * target) + suffix;
                    if (p < 1) requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
                countIo.unobserve(el);
            });
        }, { threshold: 0.4 });
        counters.forEach(el => countIo.observe(el));
    }

    // --- Hero network graph (ontology-style node graph) ---
    const canvas = document.getElementById('heroGraph');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width, height, dpr;

    function resize() {
        dpr = window.devicePixelRatio || 1;
        width  = canvas.offsetWidth;
        height = canvas.offsetHeight;
        canvas.width  = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const LABELS = ['ISO', 'RPG', 'PLAT', 'FPS3D', 'TOP3D', 'KAI', 'KAI', 'EDIT', 'EDIT', 'SAVE', 'NET', 'AUD'];
    const NODE_COUNT = 22;
    let nodes = [];
    let mouseX = -9999, mouseY = -9999;

    function buildNodes() {
        nodes = [];
        for (let i = 0; i < NODE_COUNT; i++) {
            const isHub = i < 6;
            nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.18,
                vy: (Math.random() - 0.5) * 0.18,
                r: isHub ? 3.2 : 1.6,
                hub: isHub,
                label: isHub ? LABELS[i % LABELS.length] : null,
            });
        }
    }

    function resizeAndRebuild() {
        resize();
        buildNodes();
    }
    window.addEventListener('resize', resizeAndRebuild);
    resizeAndRebuild();

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener('mouseleave', () => { mouseX = -9999; mouseY = -9999; });

    const LINK_DIST = 130;
    const accent = '#ff3b3b';
    const accent2 = '#3ba0ff';

    function step() {
        for (const n of nodes) {
            n.x += n.vx;
            n.y += n.vy;
            if (n.x < 0 || n.x > width) n.vx *= -1;
            if (n.y < 0 || n.y > height) n.vy *= -1;
            n.x = Math.max(0, Math.min(width, n.x));
            n.y = Math.max(0, Math.min(height, n.y));
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        // links
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < LINK_DIST) {
                    const alpha = (1 - dist / LINK_DIST) * (a.hub || b.hub ? 0.35 : 0.14);
                    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        // cursor links
        if (mouseX > -100) {
            for (const n of nodes) {
                const dx = n.x - mouseX, dy = n.y - mouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < LINK_DIST * 1.3) {
                    const alpha = 1 - dist / (LINK_DIST * 1.3);
                    ctx.strokeStyle = `rgba(255,59,59,${alpha * 0.5})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(n.x, n.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                }
            }
        }

        // nodes
        for (const n of nodes) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = n.hub ? accent : 'rgba(255,255,255,0.35)';
            ctx.shadowColor = n.hub ? accent : 'transparent';
            ctx.shadowBlur = n.hub ? 8 : 0;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (n.label) {
                ctx.font = '9px "IBM Plex Mono", monospace';
                ctx.fillStyle = 'rgba(154,160,173,0.85)';
                ctx.fillText(n.label, n.x + 7, n.y + 3);
            }
        }

        if (mouseX > -100 && mouseX < width) {
            ctx.beginPath();
            ctx.arc(mouseX, mouseY, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = accent2;
            ctx.fill();
        }
    }

    function loop() {
        if (!reduceMotion) step();
        draw();
        requestAnimationFrame(loop);
    }
    loop();

});
