import { useEffect, useRef, useState } from 'react';
import { sendChat } from '../api';
import RetroBackground from './RetroBackground';

interface Message {
    role: 'user' | 'assistant';
    text: string;
}

export default function ChatPanel() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages.length, sending]);

    async function handleSend() {
        const text = input.trim();
        if (!text || sending) return;
        setMessages((prev) => [...prev, { role: 'user', text }]);
        setInput('');
        setSending(true);
        setError(null);
        try {
            const { response } = await sendChat(text);
            setMessages((prev) => [...prev, { role: 'assistant', text: response }]);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    if (messages.length === 0) {
        return (
            <div className="view">
                <div className="hero">
                    <RetroBackground />
                    <div className="hero-content">
                        <div className="hero-title">Sohbet</div>
                        <div className="hero-subtitle">Dil modeliyle doğrudan konuş (streaming yok).</div>
                        <div className="composer">
                            <textarea
                                autoFocus
                                rows={1}
                                value={input}
                                placeholder="Bir şey sor…"
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                                }}
                            />
                            <button className="send-btn" disabled={!input.trim() || sending} onClick={handleSend}>➤</button>
                        </div>
                        {error && <div className="error-banner">{error}</div>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="view">
            <div className="chat-wrap">
                <div className="chat-messages" ref={scrollRef}>
                    <div className="chat-messages-inner">
                        {messages.map((m, i) => (
                            <div key={i} className={`msg ${m.role}`}>
                                <div className="msg-bubble">{m.text}</div>
                            </div>
                        ))}
                        {sending && (
                            <div className="msg assistant">
                                <div className="msg-bubble">
                                    <span className="typing-dots"><span /><span /><span /></span>
                                </div>
                            </div>
                        )}
                        {error && <div className="error-banner">{error}</div>}
                    </div>
                </div>
                <div className="bottom-composer-wrap">
                    <div className="composer">
                        <textarea
                            rows={1}
                            value={input}
                            placeholder="Bir şey sor…"
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            }}
                        />
                        <button className="send-btn" disabled={!input.trim() || sending} onClick={handleSend}>➤</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
