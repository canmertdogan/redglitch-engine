// Palantir-style icon rail: fixed-width vertical nav that persists across
// every screen, instead of the old inline tab buttons living in the top bar.
type Tab = 'pipeline' | 'chat';

const NAV_ITEMS: { tab: Tab; icon: string; label: string }[] = [
    { tab: 'pipeline', icon: '▚', label: 'Oyun Üret' },
    { tab: 'chat', icon: '◈', label: 'Sohbet' },
];

export default function Sidebar({ tab, onSelect }: {
    tab: Tab;
    onSelect: (t: Tab) => void;
}) {
    return (
        <nav className="sidebar">
            <div className="sidebar-mark" title="ProjectVertex">V</div>
            <div className="sidebar-nav">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.tab}
                        className={`sidebar-item ${tab === item.tab ? 'active' : ''}`}
                        onClick={() => onSelect(item.tab)}
                        title={item.label}
                    >
                        <span className="sidebar-item-icon">{item.icon}</span>
                        <span className="sidebar-item-label">{item.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
}
