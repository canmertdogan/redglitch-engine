// Single, provider-agnostic LLM client. Replaces the old irabClient.js
// (local Cortex) entirely — no local process, no persistent state, every
// call is a plain stateless HTTP request, which is what makes this safe to
// run on Vercel (or anywhere else with no long-lived process).
//
// Provider is selected via env vars (server-side only — API keys never
// reach the browser):
//   LLM_PROVIDER   'opencode-zen' | 'openrouter' | 'cerebras'  (default: whichever has a key configured)
//   LLM_MODEL      model id (provider-specific default if unset)
//   OPENCODE_API_KEY / OPENROUTER_API_KEY / CEREBRAS_API_KEY
const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

// Hard cap on how long a single provider request may run before it is aborted
// and reported as a clear 504 (retryable) error. Without this, a provider
// that stalls leaves the phase route hanging indefinitely and the browser
// eventually surfaces it as a bare "Failed to fetch" (connection dropped with
// no response) instead of a message anyone can act on. Generous default:
// world-level legitimately takes ~90s+ at its 32k-token budget, so this is a
// safety net against infinite stalls, not a tight SLA. Callers can override
// per call (world-level passes a larger window; small phases could pass less).
const DEFAULT_TIMEOUT_MS = 240000;

function timeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function timeoutError(provider, timeoutMs) {
    return Object.assign(new Error(`${provider} request timed out after ${Math.round(timeoutMs / 1000)}s — the provider is not responding; retrying.`), { status: 504 });
}

// OpenCode Zen's protocol logic, inlined rather than required from
// ../../server/routes/opencode-zen.js: that file lives outside
// projectvertex/, and if this app is deployed to Vercel with the project
// root set to projectvertex/ (rather than the whole monorepo), anything
// reached via `../../` wouldn't exist in the deployed file tree at all.
// projectvertex must stay fully self-contained for Vercel to work
// regardless of how the project root is configured. (Logic matches
// server/routes/opencode-zen.js's getProtocol/buildRequest/buildHeaders/
// extractText — kept in sync manually if that file changes.)
function getZenProtocol(model) {
    if (/^gpt-/i.test(model)) return 'responses';
    if (/^(claude-|qwen)/i.test(model)) return 'messages';
    if (/^gemini-/i.test(model)) return 'google';
    return 'chat-completions';
}

function buildZenRequest(model, messages, settings) {
    const protocol = getZenProtocol(model);
    const maxTokens = Math.max(1, Math.min(Number(settings.maxTokens) || 1024, 32768));

    if (protocol === 'responses') {
        return { protocol, url: `${ZEN_BASE_URL}/responses`, body: { model, input: messages, max_output_tokens: maxTokens } };
    }
    if (protocol === 'messages') {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
        return {
            protocol,
            url: `${ZEN_BASE_URL}/messages`,
            body: { model, system, messages: messages.filter((m) => m.role !== 'system'), max_tokens: maxTokens, temperature: settings.temperature, top_p: settings.topP },
        };
    }
    if (protocol === 'google') {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
        return {
            protocol,
            url: `${ZEN_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
            body: {
                systemInstruction: system ? { parts: [{ text: system }] } : undefined,
                contents: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                generationConfig: { maxOutputTokens: maxTokens, temperature: settings.temperature, topP: settings.topP },
            },
        };
    }
    return {
        protocol,
        url: `${ZEN_BASE_URL}/chat/completions`,
        body: { model, messages, max_tokens: maxTokens, temperature: settings.temperature, top_p: settings.topP },
    };
}

function buildZenHeaders(protocol, apiKey) {
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

function extractZenText(protocol, payload) {
    if (protocol === 'responses') {
        if (typeof payload.output_text === 'string') return payload.output_text;
        return (payload.output || []).flatMap((item) => item.content || [])
            .filter((item) => item.type === 'output_text' || typeof item.text === 'string')
            .map((item) => item.text || '').join('');
    }
    if (protocol === 'messages') {
        return (payload.content || []).filter((item) => item.type === 'text').map((item) => item.text || '').join('');
    }
    if (protocol === 'google') {
        return (payload.candidates || []).flatMap((c) => (c.content && c.content.parts) || []).map((p) => p.text || '').join('');
    }
    const content = payload.choices && payload.choices[0] && payload.choices[0].message ? payload.choices[0].message.content : '';
    if (typeof content === 'string') return content;
    return Array.isArray(content) ? content.map((p) => p.text || '').join('') : '';
}

const DEFAULT_MODELS = {
    'opencode-zen': 'big-pickle',
    openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free', // free tier, no cost
    cerebras: 'llama-3.3-70b',
};

const PROVIDER_KEY_ENV = {
    'opencode-zen': 'OPENCODE_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
};

const PROVIDER_BASE_URL = {
    openrouter: 'https://openrouter.ai/api/v1',
    cerebras: 'https://api.cerebras.ai/v1',
};

// Which providers have an API key configured in this environment — used by
// /api/config so the UI can only offer providers that will actually work,
// and to pick a sane default if LLM_PROVIDER isn't set explicitly.
function listAvailableProviders() {
    return Object.entries(PROVIDER_KEY_ENV)
        .filter(([, envVar]) => !!process.env[envVar])
        .map(([provider]) => provider);
}

function resolveProvider() {
    const requested = process.env.LLM_PROVIDER;
    if (requested && PROVIDER_KEY_ENV[requested]) return requested;
    const available = listAvailableProviders();
    return available[0] || 'opencode-zen';
}

function resolveModel(provider) {
    return process.env.LLM_MODEL || DEFAULT_MODELS[provider];
}

// Get API key for a provider, with optional client-provided override
function getApiKey(provider, clientKeys = {}) {
    const envVar = PROVIDER_KEY_ENV[provider];
    return clientKeys[provider] || process.env[envVar];
}

// Plain OpenAI-compatible chat/completions call — covers both OpenRouter
// and Cerebras, which use the exact same request/response shape.
async function chatCompletionsRequest(baseUrl, apiKey, model, messages, { maxTokens, temperature, extraBody, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const { signal, done } = timeoutSignal(timeoutMs);
    let res;
    try {
        res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            signal,
            body: JSON.stringify({
                model,
                messages,
                max_tokens: maxTokens,
                temperature,
                ...extraBody,
            }),
        });
    } catch (err) {
        if (err && err.name === 'AbortError') throw timeoutError(baseUrl, timeoutMs);
        throw err;
    } finally {
        done();
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = payload.error && (payload.error.message || payload.error.code);
        const err = new Error(message || `${baseUrl} request failed: HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const content = payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content
        : '';
    return typeof content === 'string' ? content : (Array.isArray(content) ? content.map((p) => p.text || '').join('') : '');
}

async function chatViaZen(apiKey, model, messages, opts) {
    const request = buildZenRequest(model, messages, opts);
    const { signal, done } = timeoutSignal(opts.timeoutMs || DEFAULT_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(request.url, {
            method: 'POST',
            headers: buildZenHeaders(request.protocol, apiKey),
            signal,
            body: JSON.stringify(request.body),
        });
    } catch (err) {
        if (err && err.name === 'AbortError') throw timeoutError('OpenCode Zen', opts.timeoutMs || DEFAULT_TIMEOUT_MS);
        throw err;
    } finally {
        done();
    }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = payload.error && (payload.error.message || payload.error.code);
        const err = new Error(message || `OpenCode Zen request failed: HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const text = extractZenText(request.protocol, payload);
    if (!text) {
        // Reasoning models routed through Zen (e.g. big-pickle -> deepseek
        // variants) write a chain-of-thought into message.reasoning_content
        // BEFORE message.content, and both count against the same
        // max_tokens budget. If the budget runs out mid-thought,
        // finish_reason is "length" and content is "" even though the
        // request itself succeeded (HTTP 200) — confirmed directly against
        // the API. That's a maxTokens-too-low bug in the caller, not a
        // transient failure, so say so explicitly instead of just "empty".
        const choice = payload.choices && payload.choices[0];
        if (choice && choice.finish_reason === 'length' && choice.message && choice.message.reasoning_content) {
            throw new Error(`OpenCode Zen exhausted maxTokens (${opts.maxTokens}) on reasoning before writing an answer — raise maxTokens for this call.`);
        }
        throw new Error('OpenCode Zen returned an empty response.');
    }
    return text;
}

// Single non-streaming chat call. Builds a system+user message pair from
// personalityText/message, matching the shape every provider here expects.
// Optional clientKeys allows browser-provided API keys to override env vars.
// timeoutMs caps a single provider request (see DEFAULT_TIMEOUT_MS above).
async function chat({ message, personalityText, maxTokens = 600, temperature = 0.4, reasoningEffort = 'low', clientKeys = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const provider = resolveProvider();
    const apiKey = getApiKey(provider, clientKeys);
    if (!apiKey) {
        throw new Error(`No API key configured for provider "${provider}" (expected env var ${PROVIDER_KEY_ENV[provider]}).`);
    }
    const model = resolveModel(provider);
    const messages = [
        { role: 'system', content: personalityText || '' },
        { role: 'user', content: message },
    ];

    if (provider === 'opencode-zen') {
        return chatViaZen(apiKey, model, messages, { maxTokens, temperature, topP: 0.9, timeoutMs });
    }
    // OpenRouter proxies reasoning-capable models (e.g. free Nemotron
    // models) that emit a long internal chain-of-thought BEFORE the actual
    // answer — confirmed directly: with reasoning left uncapped, a model
    // burned its entire max_tokens budget on the "reasoning" field and hit
    // finish_reason:"length" before ever writing the JSON, so extractJson
    // saw a truncated fragment ("No JSON found"). `reasoning.effort` is
    // OpenRouter's unified control for this across reasoning models —
    // callers doing harder spatial/structural reasoning (e.g. a maze
    // layout) can raise it to 'high' via askForJson's reasoningEffort
    // option; everything else keeps the safe 'low' default. Cerebras
    // doesn't use this field but silently ignores unknown JSON keys, so
    // it's safe to always include.
    const extraBody = provider === 'openrouter' ? { reasoning: { effort: reasoningEffort } } : undefined;
    return chatCompletionsRequest(PROVIDER_BASE_URL[provider], apiKey, model, messages, { maxTokens, temperature, extraBody, timeoutMs });
}

// Pulls the first ```json ... ``` fenced block out of a free-text
// completion, falling back to the first balanced {...} span — capable
// cloud models reliably follow "return only JSON" instructions, but a
// fallback costs nothing.
function extractJson(text) {
    const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
    const candidate = fenceMatch ? fenceMatch[1] : findBalancedBraces(text);
    if (!candidate) {
        throw new Error('No JSON found in model output');
    }
    return JSON.parse(candidate);
}

function findBalancedBraces(text) {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

// Drives a phase's prompt through the model, parses+validates the JSON
// output, and retries with a correction note appended when parsing or
// validation fails. `validate(obj)` should throw with a descriptive message
// on failure; its return value (possibly normalized) is what gets returned.
// Optional clientKeys allows browser-provided API keys to override env vars.
async function askForJson({
    systemPrompt,
    userPrompt,
    maxTokens = 700,
    temperature = 0.3,
    maxRetries = 3,
    reasoningEffort = 'low',
    validate = (obj) => obj,
    clientKeys = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
    let lastError = null;
    let prompt = userPrompt;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        attemptsMade = attempt;
        try {
            const raw = await chat({ message: prompt, personalityText: systemPrompt, maxTokens, temperature, reasoningEffort, clientKeys, timeoutMs });
            const parsed = extractJson(raw);
            return validate(parsed);
        } catch (err) {
            lastError = err;
            // Permanent account/config problems — missing API key, or any
            // 4xx from the provider other than 429 (rate limit, worth
            // retrying) — will never succeed no matter how many times we
            // retry (e.g. "No payment method" from a provider's billing
            // check, confirmed directly against OpenCode Zen). Fail
            // immediately instead of burning attempts and appending a
            // nonsensical "fix your JSON" correction note to an error
            // that has nothing to do with the model's output.
            // "exhausted maxTokens" is also permanent in practice: maxTokens
            // is a fixed call-site setting, not something that changes
            // between retries or reacts to a correction note, so retrying
            // just repeats the identical failure 5 times for nothing.
            const isPermanent = /No API key configured/.test(err.message || '') || /exhausted maxTokens/.test(err.message || '') || (err.status && err.status >= 400 && err.status < 500 && err.status !== 429);
            if (isPermanent) break;

            // Otherwise, default assumption is "the model's output was
            // wrong" (JSON parse failure or a validate() rejection) — those
            // get a correction note appended so the retry actually has a
            // chance to fix the specific problem. Only genuine transport
            // failures (fetch throws TypeError, a 429, or a 5xx) get a
            // plain backoff-retry with the same prompt instead, since
            // there's nothing about the prompt to "correct".
            const isRetryableError = err instanceof TypeError || err.status === 429 || (err.status && err.status >= 500) || /returned an empty response/.test(err.message || '');
            if (isRetryableError) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
            } else {
                prompt = `${userPrompt}\n\n[DÜZELTME NOTU] Önceki cevabın şu hatayı içeriyordu: "${err.message}". Sadece geçerli, düzeltilmiş JSON döndür, başka açıklama ekleme.`;
            }
        }
    }

    throw new Error(`askForJson failed after ${attemptsMade} attempt${attemptsMade === 1 ? '' : 's'}: ${lastError && lastError.message}`);
}

module.exports = { chat, askForJson, extractJson, listAvailableProviders, resolveProvider, resolveModel, DEFAULT_MODELS };
