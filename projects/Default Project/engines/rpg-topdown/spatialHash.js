// spatialHash.js - Optimized Collision Detection
window.SpatialHash = class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
        this.queryId = 0;
    }

    getKey(x, y) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
    }

    clear() {
        this.grid.clear();
    }

    insert(entity) {
        // Calculate bounds
        const scale = entity.scale || 1;
        const width = (entity.width || 16) * scale;
        const height = (entity.height || 16) * scale;
        
        // Entity position (top-left)
        const startX = Math.floor(entity.x / this.cellSize);
        const startY = Math.floor(entity.y / this.cellSize);
        const endX = Math.floor((entity.x + width) / this.cellSize);
        const endY = Math.floor((entity.y + height) / this.cellSize);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const key = `${x},${y}`;
                if (!this.grid.has(key)) this.grid.set(key, []);
                this.grid.get(key).push(entity);
            }
        }
    }

    retrieve(entity, result = []) {
        this.queryId++;
        const scale = entity.scale || 1;
        const width = (entity.width || 16) * scale;
        const height = (entity.height || 16) * scale;

        const startX = Math.floor(entity.x / this.cellSize);
        const startY = Math.floor(entity.y / this.cellSize);
        const endX = Math.floor((entity.x + width) / this.cellSize);
        const endY = Math.floor((entity.y + height) / this.cellSize);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const key = `${x},${y}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        const other = cell[i];
                        if (other !== entity && other._shQueryId !== this.queryId) {
                            other._shQueryId = this.queryId;
                            result.push(other);
                        }
                    }
                }
            }
        }
        return result;
    }
}