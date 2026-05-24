import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface ToastHandle {
    show: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const Toast = forwardRef<ToastHandle>((_, ref) => {
    const [msg, setMsg] = useState<string | null>(null);
    const [type, setType] = useState<'success' | 'error' | 'info'>('info');

    useImperativeHandle(ref, () => ({
        show: (message, t = 'info') => {
            setMsg(message);
            setType(t);
            setTimeout(() => setMsg(null), 3000);
        }
    }));

    if (!msg) return null;

    const colors = {
        success: '#2ecc71',
        error: '#e74c3c',
        info: '#3498db'
    };

    return (
        <div style={{
            position: 'fixed', bottom: '20px', right: '20px',
            background: '#0a0a0f', border: `2px solid ${colors[type]}`,
            color: colors[type], padding: '12px 25px', borderRadius: '4px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 10000,
            fontFamily: 'VT323, monospace', fontSize: '1.1rem',
            animation: 'slideIn 0.3s ease-out'
        }}>
            {msg.toUpperCase()}
            <style>{`
                @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            `}</style>
        </div>
    );
});

export default Toast;
