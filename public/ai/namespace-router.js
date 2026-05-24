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
