const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const safeFs = require('../utils/safeFs');

// Get all slots
router.get('/', async (req, res) => {
    try {
        const slotsDir = path.join(__dirname, '..', '..', 'saves', 'slots');
        await fs.mkdir(slotsDir, { recursive: true });

        const slots = [];
        for (let i = 1; i <= 5; i++) {
            const slotFile = path.join(slotsDir, `slot_${i}.json`);
            let raw;
            try {
                raw = await fs.readFile(slotFile, 'utf8');
            } catch (err) {
                if (err.code === 'ENOENT') {
                    slots.push({ slotId: i, isEmpty: true, campaign: null, player: null, metadata: null });
                    continue;
                }
                throw err;
            }
            try {
                slots.push(JSON.parse(raw));
            } catch (parseErr) {
                // Corrupted slot file: don't silently treat as empty (data loss). Preserve raw copy and 500.
                try { await fs.copyFile(slotFile, slotFile + '.corrupt-' + Date.now()); } catch (_) {}
                throw new Error(`Slot ${i} data is corrupted and could not be parsed`);
            }
        }

        res.json(slots);
    } catch (error) {
        console.error('Error getting slots:', error);
        res.status(500).json({ error: 'Failed to get slots' });
    }
});

// Get specific slot
router.get('/:id', async (req, res) => {
    try {
        const slotId = Number(req.params.id);
        if (!Number.isInteger(slotId) || slotId < 1 || slotId > 5) {
            return res.status(400).json({ error: 'Invalid slot ID' });
        }

        const slotsDir = path.join(__dirname, '..', '..', 'saves', 'slots');
        await fs.mkdir(slotsDir, { recursive: true });

        const slotFile = path.join(slotsDir, `slot_${slotId}.json`);

        let raw;
        try {
            raw = await fs.readFile(slotFile, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.json({ slotId: slotId, isEmpty: true, campaign: null, player: null, metadata: null });
            }
            throw err;
        }
        try {
            res.json(JSON.parse(raw));
        } catch (parseErr) {
            try { await fs.copyFile(slotFile, slotFile + '.corrupt-' + Date.now()); } catch (_) {}
            res.status(500).json({ error: 'Slot data is corrupted' });
        }
    } catch (error) {
        console.error('Error getting slot:', error);
        res.status(500).json({ error: 'Failed to get slot' });
    }
});

// Create or update slot
router.post('/:id', async (req, res) => {
    try {
        const slotId = Number(req.params.id);
        if (!Number.isInteger(slotId) || slotId < 1 || slotId > 5) {
            return res.status(400).json({ error: 'Invalid slot ID' });
        }

        const slotData = req.body;
        
        // Validate slot data
        if (!slotData || typeof slotData !== 'object') {
            return res.status(400).json({ error: 'Invalid slot data' });
        }

        const slotsDir = path.join(__dirname, '..', '..', 'saves', 'slots');
        await fs.mkdir(slotsDir, { recursive: true });

        const slotFile = path.join(slotsDir, `slot_${slotId}.json`);
        
        // Write new slot data atomically
        await safeFs.safeWriteFullPath(slotsDir, slotFile, JSON.stringify(slotData, null, 2), 'utf8');
        
        res.json({ success: true, slotId: slotId });
    } catch (error) {
        console.error('Error saving slot:', error);
        res.status(500).json({ error: 'Failed to save slot' });
    }
});

// Delete slot
router.delete('/:id', async (req, res) => {
    try {
        const slotId = Number(req.params.id);
        if (!Number.isInteger(slotId) || slotId < 1 || slotId > 5) {
            return res.status(400).json({ error: 'Invalid slot ID' });
        }

        const slotsDir = path.join(__dirname, '..', '..', 'saves', 'slots');
        const slotFile = path.join(slotsDir, `slot_${slotId}.json`);
        
        try {
            await fs.unlink(slotFile);
            res.json({ success: true, slotId: slotId });
        } catch (err) {
            // Slot doesn't exist, that's ok
            res.json({ success: true, slotId: slotId });
        }
    } catch (error) {
        console.error('Error deleting slot:', error);
        res.status(500).json({ error: 'Failed to delete slot' });
    }
});

module.exports = router;
