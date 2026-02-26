const express = require('express');
const router = express.Router();
const os = require('os');

// GET /api/system/status - Simple health check
router.get('/status', (req, res) => {
    res.json({ status: 'ONLINE', timestamp: Date.now() });
});

// GET /api/system/stats - Get system statistics
router.get('/stats', (req, res) => {
    try {
        let memUsage = 0;
        let systemUptime = 0;
        let cpuUsage = 0;

        try {
            const memInfo = process.memoryUsage();
            memUsage = Math.round(memInfo.rss / 1024 / 1024);
        } catch (e) { 
            console.error('[SYSTEM] Error getting memory:', e); 
        }

        try {
            // process.uptime() returns seconds
            systemUptime = Math.round(process.uptime());
        } catch (e) { 
            console.error('[SYSTEM] Error getting uptime:', e); 
        }

        try {
            const loadAvg = os.loadavg();
            const cpuCount = os.cpus().length || 1;
            // Use 1-minute load average
            if (loadAvg && loadAvg.length > 0) {
                cpuUsage = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));
            }
        } catch (e) { 
            console.error('[SYSTEM] Error getting CPU:', e); 
        }

        const stats = {
            mem: Number(memUsage) || 0,
            uptime: Number(systemUptime) || 0,
            cpu: Number(cpuUsage) || 0,
            platform: os.platform()
        };
        
        res.json(stats);
    } catch (error) {
        console.error('[SYSTEM] Critical error in /api/system/stats:', error);
        res.status(500).json({ 
            error: error.message, 
            mem: 0, 
            uptime: 0, 
            cpu: 0,
            platform: os.platform() 
        });
    }
});

module.exports = router;