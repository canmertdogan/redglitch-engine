import { useEffect, useState } from 'react';
import { fetchConfig, ServerConfig } from './api';
import PipelineView from './components/PipelineView';
import ChatPanel from './components/ChatPanel';
import Sidebar from './components/Sidebar';

const PROVIDER_LABEL: Record<string, string> = {
    'opencode-zen': 'OpenCode Zen',
    openrouter: 'OpenRouter',
    cerebras: 'Cerebras',
};

const CREW_LABEL: Record<string, string> = {
    pipeline: 'Oyun Üret',
    chat: 'Sohbet',
};

function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

export default function App() {
    const [tab, setTab] = useState<'pipeline' | 'chat'>('pipeline');
    const [cfg, setCfg] = useState<ServerConfig | null>(null);
    const now = useClock();

    useEffect(() => {
        fetchConfig().then(setCfg).catch(() => {});
    }, []);

    const providerReady = !!cfg && cfg.availableProviders.length > 0;
    const clock = now.toISOString().slice(11, 19) + ' UTC';

    return (
        <div className="app-shell">
            <Sidebar tab={tab} onSelect={setTab} />
            <div className="app-main">
                <div className="topbar">
                    <div className="breadcrumb">
                        <span className="breadcrumb-root">
                            <span className="brand-accent">▚</span> PROJECTVERTEX
                        </span>
                        <span className="breadcrumb-sep">/</span>
                        <span className="breadcrumb-leaf">{CREW_LABEL[tab]}</span>
                    </div>
                    <div className="topbar-right">
                        <span className="topbar-clock">{clock}</span>
                        <div className="status-pill">
                            <span className={`status-dot ${providerReady ? 'ready' : 'crashed'}`} />
                            {cfg
                                ? providerReady
                                    ? `${PROVIDER_LABEL[cfg.defaultProvider] || cfg.defaultProvider} · ${cfg.defaultModel}`
                                    : 'Sağlayıcı yapılandırılmadı'
                                : '…'}
                        </div>
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
            </div>
        </div>
    );
}
