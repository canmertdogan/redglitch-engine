import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

console.log("Android Adapter Loaded");

const ROOT_DIR = Directory.Documents;
const BASE_FOLDER = 'KetebeEngine';

// --- HELPER FUNCTIONS ---

async function ensureBaseDirs() {
    try {
        await Filesystem.mkdir({
            path: BASE_FOLDER,
            directory: ROOT_DIR,
            recursive: true
        });
        console.log("Base directory ensured");
    } catch (e) {
        // Only log if it's NOT a "directory already exists" error
        if (!e.message?.includes('already exist')) {
            console.error("Error creating base dir", e);
        }
    }
}

async function getActiveProject() {
    const { value } = await Preferences.get({ key: 'active_project' });
    return value || 'Default Project';
}

async function getProjectPath() {
    const project = await getActiveProject();
    return `${BASE_FOLDER}/${project}`;
}

// Convert a web path (e.g., 'dunyalar/level1.json') to a filesystem path
async function resolvePath(relativePath) {
    const projectPath = await getProjectPath();
    // Clean path
    return `${projectPath}/${relativePath}`.replace(/\/\//g, '/');
}

// --- API HANDLERS ---

const apiHandlers = {
    // GET /api/projects
    'api/projects': async (url, options) => {
        try {
            await ensureBaseDirs();
            const res = await Filesystem.readdir({
                path: BASE_FOLDER,
                directory: ROOT_DIR
            });
            // Filter only directories (simplification: assume no files in root)
            const projects = res.files.map(f => ({
                name: f.name,
                path: f.uri // Use URI or just name
            }));
            return new Response(JSON.stringify(projects), { status: 200 });
        } catch (e) {
            return new Response(JSON.stringify([]), { status: 200 });
        }
    },

    // GET /api/files/levels
    'api/files/levels': async (url, options) => {
        try {
            const projectPath = await getProjectPath();
            const levelsPath = `${projectPath}/dunyalar`;
            
            // Ensure dir exists
            try {
                await Filesystem.mkdir({ path: levelsPath, directory: ROOT_DIR, recursive: true });
            } catch (e) {}

            const res = await Filesystem.readdir({
                path: levelsPath,
                directory: ROOT_DIR
            });
            
            // Filter JSON files
            const files = res.files.filter(f => f.name.endsWith('.json')).map(f => f.name);
            return new Response(JSON.stringify(files), { status: 200 });
        } catch (e) {
            console.error("List levels error", e);
            return new Response(JSON.stringify([]), { status: 200 });
        }
    },

    // POST /api/levels/:filename
    'api/levels/': async (url, options) => {
        // Extract filename from URL
        // url format: /api/levels/level1.json
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        
        if (!options.body) return new Response("No body", { status: 400 });

        try {
            const projectPath = await getProjectPath();
            const fullPath = `${projectPath}/dunyalar/${filename}`;
            
            await Filesystem.writeFile({
                path: fullPath,
                data: options.body, // Assume body is stringified JSON
                directory: ROOT_DIR,
                encoding: Encoding.UTF8,
                recursive: true
            });
            
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        } catch (e) {
            console.error("Save level error", e);
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    },

    // GET /dunyalar/:filename (Serving level files)
    'dunyalar/': async (url, options) => {
        const parts = url.split('/');
        const filename = parts[parts.length - 1]; // e.g. level1.json
        
        // Remove query params
        const cleanName = filename.split('?')[0];

        try {
            const projectPath = await getProjectPath();
            const fullPath = `${projectPath}/dunyalar/${cleanName}`;
            
            const file = await Filesystem.readFile({
                path: fullPath,
                directory: ROOT_DIR,
                encoding: Encoding.UTF8
            });
            
            return new Response(file.data, { status: 200 });
        } catch (e) {
            // If not found in device, try to fetch from assets (the bundled web files)
            // This is tricky. If the user calls fetch('dunyalar/level1.json'), it usually goes to the server.
            // In Capacitor, relative paths go to the web asset folder.
            // So if we fail to find it in Documents, we should fall back to the original fetch 
            // BUT, the original fetch in the monkey patch logic might be circular if we aren't careful.
            // We should let the original fetch handle 'dunyalar/' if it's not in Documents?
            // Actually, for a game engine, we want 'dunyalar' to always be mutable.
            // Let's return 404 here and let the fallback handle it? 
            // No, the fallback calls 'originalFetch', which requests the URL relative to index.html.
            // If the file exists in the APK assets, it will load.
            return new Response(null, { status: 404, statusText: "Not found in Docs" });
        }
    }
};

// --- INTERCEPTOR ---

const originalFetch = window.fetch;

window.fetch = async (url, options) => {
    // Only intercept if running on native platform
    if (!Capacitor.isNativePlatform()) {
        return originalFetch(url, options);
    }

    // Normalize URL
    const urlString = url.toString();
    
    // Check for API calls
    if (urlString.includes('/api/projects')) return apiHandlers['api/projects'](urlString, options);
    if (urlString.includes('/api/files/levels')) return apiHandlers['api/files/levels'](urlString, options);
    if (urlString.includes('/api/levels/')) {
        // Determine if GET or POST (POST is save)
        if (options && options.method === 'POST') {
             return apiHandlers['api/levels/'](urlString, options);
        }
    }
    
    // Intercept Level Loads from Documents
    if (urlString.includes('dunyalar/') && urlString.endsWith('.json')) {
        const res = await apiHandlers['dunyalar/'](urlString, options);
        if (res.status === 200) return res;
        // If 404, fall through to original fetch (loads from APK assets)
    }

    console.log(`[Adapter] Passthrough: ${urlString}`);
    return originalFetch(url, options);
};

// Initialize
if (Capacitor.isNativePlatform()) {
    ensureBaseDirs();
}
