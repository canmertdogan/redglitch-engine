const TEXT_EXTENSIONS = /\.(?:c?js|mjs|ts|tsx|json|md|txt|html|css|glsl|wgsl|yaml|yml)$/i;
const EXCLUDED = /(?:^|\/)(?:node_modules|studio-dist|dist|builds?|coverage|\.git|\.env|secrets?)(?:\/|$)/i;
const SENSITIVE_FILE = /(?:credential|secret|token|api[-_]?key|private[-_]?key|\.pem$|\.key$)/i;
const PRIORITY = /(?:MANIFESTO|project|game|campaign|quest|npc|enemy|item|level|world|dialogue|script)/i;

function flatten(node, output = []) {
    if (!node) return output;
    if (node.type === 'file') output.push(node.path);
    for (const child of node.children || []) flatten(child, output);
    return output;
}

function terms(query) {
    return new Set(String(query || '').toLowerCase().match(/[a-z0-9_]{3,}/g) || []);
}

function rankPath(filePath, queryTerms) {
    const lower = filePath.toLowerCase();
    let score = PRIORITY.test(filePath) ? 5 : 0;
    for (const term of queryTerms) if (lower.includes(term)) score += 3;
    if (/manifesto\.md$/i.test(filePath)) score += 20;
    if (/\.(?:json|md)$/i.test(filePath)) score += 2;
    return score;
}

export class ProjectContextRetriever {
    constructor({ maxFiles = 8, maxFileChars = 6000, maxContextChars = 18000 } = {}) {
        this.maxFiles = maxFiles;
        this.maxFileChars = maxFileChars;
        this.maxContextChars = maxContextChars;
        this.cache = null;
    }

    async retrieve(query) {
        const [projectResponse, treeResponse] = await Promise.all([
            fetch('/api/projects/current'),
            fetch('/api/ide/tree')
        ]);
        if (!projectResponse.ok || !treeResponse.ok) return '';
        const project = await projectResponse.json();
        const tree = await treeResponse.json();
        const projectRoot = tree.find((node) => node.name === `Project: ${project.name}`);
        if (!projectRoot) return '';

        const queryTerms = terms(query);
        const candidates = flatten(projectRoot)
            .filter((filePath) => TEXT_EXTENSIONS.test(filePath) && !EXCLUDED.test(filePath) && !SENSITIVE_FILE.test(filePath))
            .sort((left, right) => rankPath(right, queryTerms) - rankPath(left, queryTerms) || left.localeCompare(right))
            .slice(0, this.maxFiles);

        const documents = await Promise.all(candidates.map(async (filePath) => {
            try {
                const response = await fetch(`/api/ide/read?file=${encodeURIComponent(filePath)}`);
                if (!response.ok) return null;
                const content = (await response.text()).slice(0, this.maxFileChars);
                return `[Project source: ${filePath}]\n${content}`;
            } catch (_) {
                return null;
            }
        }));
        return documents.filter(Boolean).join('\n\n').slice(0, this.maxContextChars);
    }
}
