const assert = require('assert');
const { getProtocol, extractText, buildRequest, buildHeaders } = require('../server/routes/opencode-zen');

assert.strictEqual(getProtocol('gpt-5.4'), 'responses');
assert.strictEqual(getProtocol('qwen3.7-max'), 'messages');
assert.strictEqual(getProtocol('gemini-3.1-pro'), 'google');
assert.strictEqual(getProtocol('kimi-k2.5'), 'chat-completions');

assert.strictEqual(extractText('responses', {
    output: [{ content: [{ type: 'output_text', text: 'hello' }] }],
}), 'hello');
assert.strictEqual(extractText('messages', { content: [{ type: 'text', text: 'hello' }] }), 'hello');
assert.strictEqual(extractText('chat-completions', {
    choices: [{ message: { content: 'hello' } }],
}), 'hello');

const request = buildRequest('kimi-k2.5', [{ role: 'user', content: 'hello' }], {
    maxTokens: 512,
    temperature: 0.7,
    topP: 0.9,
});
assert.strictEqual(request.url, 'https://opencode.ai/zen/v1/chat/completions');
assert.strictEqual(request.body.max_tokens, 512);
assert.strictEqual(buildHeaders('responses', 'secret').Authorization, 'Bearer secret');
assert.strictEqual(buildHeaders('messages', 'secret')['x-api-key'], 'secret');
assert.strictEqual(buildHeaders('google', 'secret')['x-goog-api-key'], 'secret');

console.log('OpenCode Zen integration validation passed.');
