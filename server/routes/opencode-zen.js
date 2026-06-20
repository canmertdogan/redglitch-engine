const express = require('express');

const router = express.Router();
const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const REQUEST_TIMEOUT_MS = 120000;

function getProtocol(model) {
    if (/^gpt-/i.test(model)) return 'responses';
    if (/^(claude-|qwen)/i.test(model)) return 'messages';
    if (/^gemini-/i.test(model)) return 'google';
    return 'chat-completions';
}

function extractText(protocol, payload) {
    if (protocol === 'responses') {
        if (typeof payload.output_text === 'string') return payload.output_text;
        return (payload.output || [])
            .flatMap(item => item.content || [])
            .filter(item => item.type === 'output_text' || typeof item.text === 'string')
            .map(item => item.text || '')
            .join('');
    }

    if (protocol === 'messages') {
        return (payload.content || [])
            .filter(item => item.type === 'text')
            .map(item => item.text || '')
            .join('');
    }

    if (protocol === 'google') {
        return (payload.candidates || [])
            .flatMap(candidate => candidate.content && candidate.content.parts || [])
            .map(part => part.text || '')
            .join('');
    }

    const content = payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content
        : '';
    if (typeof content === 'string') return content;
    return Array.isArray(content) ? content.map(part => part.text || '').join('') : '';
}

function buildRequest(model, messages, settings) {
    const protocol = getProtocol(model);
    const maxTokens = Math.max(1, Math.min(Number(settings.maxTokens) || 1024, 32768));

    if (protocol === 'responses') {
        return {
            protocol,
            url: `${ZEN_BASE_URL}/responses`,
            body: { model, input: messages, max_output_tokens: maxTokens },
        };
    }

    if (protocol === 'messages') {
        const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
        return {
            protocol,
            url: `${ZEN_BASE_URL}/messages`,
            body: {
                model,
                system,
                messages: messages.filter(message => message.role !== 'system'),
                max_tokens: maxTokens,
                temperature: settings.temperature,
                top_p: settings.topP,
            },
        };
    }

    if (protocol === 'google') {
        const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
        return {
            protocol,
            url: `${ZEN_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
            body: {
                systemInstruction: system ? { parts: [{ text: system }] } : undefined,
                contents: messages.filter(message => message.role !== 'system').map(message => ({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }],
                })),
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature: settings.temperature,
                    topP: settings.topP,
                },
            },
        };
    }

    return {
        protocol,
        url: `${ZEN_BASE_URL}/chat/completions`,
        body: {
            model,
            messages,
            max_tokens: maxTokens,
            temperature: settings.temperature,
            top_p: settings.topP,
        },
    };
}

function buildHeaders(protocol, apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (protocol === 'messages') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else if (protocol === 'google') {
        headers['x-goog-api-key'] = apiKey;
    } else {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
}

router.get('/models', async (_req, res) => {
    try {
        const response = await fetch(`${ZEN_BASE_URL}/models`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const payload = await response.json();
        res.status(response.status).json(payload);
    } catch (error) {
        res.status(502).json({ error: 'Unable to load the OpenCode Zen model catalog.' });
    }
});

router.post('/chat', async (req, res) => {
    const apiKey = req.get('x-opencode-zen-key') || process.env.OPENCODE_API_KEY;
    const model = String(req.body.model || '').trim();
    const messages = req.body.messages;

    if (!apiKey) return res.status(400).json({ error: 'OpenCode Zen API key is required.' });
    if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(model)) return res.status(400).json({ error: 'Invalid OpenCode Zen model ID.' });
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
        return res.status(400).json({ error: 'A valid message history is required.' });
    }

    const normalizedMessages = messages.map(message => ({
        role: ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user',
        content: String(message.content || '').slice(0, 50000),
    }));
    const request = buildRequest(model, normalizedMessages, {
        maxTokens: req.body.maxTokens,
        temperature: Math.max(0, Math.min(Number(req.body.temperature) || 0.7, 2)),
        topP: Math.max(0, Math.min(Number(req.body.topP) || 0.9, 1)),
    });

    try {
        const response = await fetch(request.url, {
            method: 'POST',
            headers: buildHeaders(request.protocol, apiKey),
            body: JSON.stringify(request.body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = payload.error && (payload.error.message || payload.error.code);
            return res.status(response.status).json({ error: message || 'OpenCode Zen request failed.' });
        }

        const text = extractText(request.protocol, payload);
        if (!text) return res.status(502).json({ error: 'OpenCode Zen returned an empty response.' });
        return res.json({ response: text, model, protocol: request.protocol });
    } catch (error) {
        const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return res.status(timedOut ? 504 : 502).json({
            error: timedOut ? 'OpenCode Zen request timed out.' : 'Unable to reach OpenCode Zen.',
        });
    }
});

module.exports = router;
module.exports.getProtocol = getProtocol;
module.exports.extractText = extractText;
module.exports.buildRequest = buildRequest;
module.exports.buildHeaders = buildHeaders;
