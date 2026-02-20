document.addEventListener('DOMContentLoaded', () => {
    const aiVisual = document.querySelector('.ai-pro-visual');
    if (!aiVisual) return;

    // Create Canvas for Neural Map
    const canvas = document.createElement('canvas');
    canvas.id = 'neuralMap';
    canvas.style.width = '100%';
    canvas.style.height = '300px';
    canvas.style.background = '#000';
    canvas.style.border = '1px solid #333';
    canvas.style.marginTop = '20px';
    aiVisual.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let w, h;

    function resize() {
        w = canvas.offsetWidth;
        h = canvas.offsetHeight;
        canvas.width = w;
        canvas.height = h;
    }
    window.addEventListener('resize', resize);
    resize();

    const nodes = [];
    const center = { x: w / 2, y: h / 2 };

    // Create surrounding project nodes
    const files = ['Player.js', 'Level1.json', 'Sprites.png', 'Engine.core', 'Save.dat', 'Config.sys'];
    files.forEach((name, i) => {
        const angle = (i / files.length) * Math.PI * 2;
        nodes.push({
            name,
            x: center.x + Math.cos(angle) * 100,
            y: center.y + Math.sin(angle) * 100,
            angle,
            tokens: []
        });
    });

    function draw() {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, w, h);

        // Draw Center (IRAB)
        ctx.fillStyle = '#3498db';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#3498db';
        ctx.beginPath();
        ctx.arc(center.x, center.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.font = '12px VT323';
        ctx.fillText('IRAB_CORE', center.x - 25, center.y - 20);

        nodes.forEach(node => {
            // Move node slightly
            node.angle += 0.01;
            node.x = center.x + Math.cos(node.angle) * 100;
            node.y = center.y + Math.sin(node.angle) * 100;

            // Draw Connection
            ctx.strokeStyle = 'rgba(52, 152, 219, 0.2)';
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(node.x, node.y);
            ctx.stroke();

            // Draw Node
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillText(node.name, node.x + 10, node.y + 5);

            // Emit tokens occasionally
            if (Math.random() > 0.95) {
                node.tokens.push({ x: node.x, y: node.y, progress: 0 });
            }

            // Draw tokens
            node.tokens.forEach((t, i) => {
                t.progress += 0.02;
                const tx = node.x + (center.x - node.x) * t.progress;
                const ty = node.y + (center.y - node.y) * t.progress;
                
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(tx - 1, ty - 1, 2, 2);

                if (t.progress >= 1) node.tokens.splice(i, 1);
            });
        });

        requestAnimationFrame(draw);
    }
    draw();

    // 11. CIRCUIT BOARD VISUALIZER
    const circuitCanvas = document.getElementById('circuitCanvas');
    if (circuitCanvas) {
        const cctx = circuitCanvas.getContext('2d');
        let cw, ch;

        function resizeCircuit() {
            cw = circuitCanvas.offsetWidth;
            ch = circuitCanvas.offsetHeight;
            circuitCanvas.width = cw;
            circuitCanvas.height = ch;
        }
        window.addEventListener('resize', resizeCircuit);
        resizeCircuit();

        const archNodes = document.querySelectorAll('.architecture-visualizer .node');
        const connections = [
            ['gpu', 'rag'],
            ['neural', 'rag'],
            ['rag', 'render'],
            ['rag', 'native']
        ];

        function getCenter(el) {
            const rect = el.getBoundingClientRect();
            const parentRect = el.parentElement.getBoundingClientRect();
            return {
                x: (rect.left - parentRect.left) + rect.width / 2,
                y: (rect.top - parentRect.top) + rect.height / 2
            };
        }

        function drawCircuits() {
            cctx.clearRect(0, 0, cw, ch);
            
            connections.forEach(([fromId, toId]) => {
                const fromEl = document.querySelector(`[data-id="${fromId}"]`);
                const toEl = document.querySelector(`[data-id="${toId}"]`);
                if (!fromEl || !toEl) return;

                const start = getCenter(fromEl);
                const end = getCenter(toEl);

                cctx.strokeStyle = 'rgba(241, 196, 15, 0.2)';
                cctx.lineWidth = 2;
                cctx.beginPath();
                cctx.moveTo(start.x, start.y);
                
                // Draw L-shaped connector
                const midY = start.y + (end.y - start.y) / 2;
                cctx.lineTo(start.x, midY);
                cctx.lineTo(end.x, midY);
                cctx.lineTo(end.x, end.y);
                cctx.stroke();

                // Animated pulse
                const time = Date.now() / 1000;
                const pulse = (time % 2) / 2;
                
                cctx.strokeStyle = 'rgba(241, 196, 15, 0.8)';
                cctx.lineWidth = 3;
                cctx.setLineDash([10, 50]);
                cctx.lineDashOffset = -time * 50;
                cctx.stroke();
                cctx.setLineDash([]);
            });

            requestAnimationFrame(drawCircuits);
        }
        drawCircuits();
    }
});
