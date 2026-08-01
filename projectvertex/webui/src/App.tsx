import { useEffect, useState } from 'react';
import { fetchConfig, ServerConfig } from './api';
import PipelineView from './components/PipelineView';
import ChatPanel from './components/ChatPanel';

const PROVIDER_LABEL: Record<string, string> = {
    'opencode-zen': 'OpenCode Zen',
    openrouter: 'OpenRouter',
    cerebras: 'Cerebras',
};

export default function App() {
    const [tab, setTab] = useState<'pipeline' | 'chat'>('pipeline');
    const [cfg, setCfg] = useState<ServerConfig | null>(null);

    useEffect(() => {
        fetchConfig().then(setCfg).catch(() => {});
    }, []);

    const providerReady = !!cfg && cfg.availableProviders.length > 0;

    return (
        <>
            <div className="status-bar">
                <div className="brand">
                    <span className="brand-accent">▚</span> ProjectVertex
                </div>
                <div className="tabs">
                    <button className={`tab-btn ${tab === 'pipeline' ? 'active' : ''}`} onClick={() => setTab('pipeline')}>
                        Oyun Üret
                    </button>
                    <button className={`tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
                        Sohbet
                    </button>
                </div>
                <div className="status-pill">
                    <span className={`status-dot ${providerReady ? 'ready' : 'crashed'}`} />
                    {cfg
                        ? providerReady
                            ? `${PROVIDER_LABEL[cfg.defaultProvider] || cfg.defaultProvider} · ${cfg.defaultModel}`
                            : 'Sağlayıcı yapılandırılmadı'
                        : '…'}
                </div>
            </div>
            {tab === 'pipeline' ? <PipelineView cfg={cfg} /> : <ChatPanel />}
            <footer className="app-footer">
                <span>
                    ProjectVertex, {' '}
                    <a href="https://github.com/canmertdogan/redglitch-engine" target="_blank" rel="noopener noreferrer" className="engine-link">
                        Redglitch Engine
                    </a>
                    {' '}üzerine inşa edilmiştir — üretilen oyunlar gerçek Redglitch motorlarıyla çalışır.
                </span>
            </footer>
        </>
    );
}
