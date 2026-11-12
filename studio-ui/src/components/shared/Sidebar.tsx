import React from 'react';

interface SidebarProps {
    title: string;
    items: any[];
    currentIndex: number;
    onSelect: (index: number) => void;
    renderItem: (item: any, active: boolean) => React.ReactNode;
    headerAction?: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({ title, items, currentIndex, onSelect, renderItem, headerAction }) => {
    return (
        <div className="panel" style={{ width: '260px', flexShrink: 0 }}>
            <div className="panel-header">
                {title}
                {headerAction}
            </div>
            <div className="panel-content" style={{ padding: 0 }}>
                {items.length === 0 ? (
                    <div style={{ padding: '15px', color: '#555', fontSize: '0.85rem', textAlign: 'center' }}>
                        NO MATCHING ENTRIES
                    </div>
                ) : items.map((item, idx) => (
                    <div key={idx} onClick={() => onSelect(idx)}>
                        {renderItem(item, currentIndex === idx)}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
