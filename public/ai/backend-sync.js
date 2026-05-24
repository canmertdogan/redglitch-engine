export function syncWithBackend(registry) {
        if (!registry.eventBus) return;
        const toolList = Array.from(registry.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
        
        // Broadcast to Native AI Bridge (bridge.js will forward to WebSocket)
        registry.eventBus.emit('ai:command:sync', { type: 'SYNC_TOOLS', data: toolList });
    }