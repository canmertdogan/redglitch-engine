export const NAMESPACE_ALIAS = {
            'isopixel': 'pixel',
            'iso': 'pixel',
            'worldbuilder': 'world',
            'topdown': 'world',
            'rpg': 'world',
            'codeforge': 'code',
            'platform': 'platformer'
        };

export function resolveNamespaceAlias(namespace) {
    return NAMESPACE_ALIAS[namespace] || namespace;
}

export function knownNamespaces() {
    return Array.from(new Set([
        ...Object.keys(NAMESPACE_ALIAS),
        ...Object.values(NAMESPACE_ALIAS)
    ]));
}
