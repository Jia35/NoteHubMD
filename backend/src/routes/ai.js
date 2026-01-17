const express = require('express');
const router = express.Router();
const db = require('../models');
const { encrypt, decrypt, mask } = require('../utils/encryption');
// Node.js 22+ has built-in fetch with Web Streams API support
// For proxy support, we use undici's ProxyAgent (built into Node.js)

// Helper: Get fetch implementation (with proxy if env vars set)
const getFetchImplementation = () => {
    const hasProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

    if (hasProxy) {
        // Use undici's ProxyAgent for Node.js built-in fetch
        const { ProxyAgent } = require('undici');
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        const dispatcher = new ProxyAgent(proxyUrl);

        return async (url, init) => {
            // Debug: Log outgoing request headers
            const headers = init?.headers || {};
            const auth = headers['Authorization'] || headers['authorization'];
            console.log(`[Fetch] ${init?.method || 'GET'} ${url}`);
            console.log(`[Fetch] Headers:`, {
                ...Object.fromEntries(headers.entries ? headers.entries() : Object.entries(headers)),
                Authorization: auth ? `Bearer ${auth.substring(7, 12)}...` : 'MISSING'
            });

            return fetch(url, { ...init, dispatcher });
        };
    }

    // No proxy: use built-in fetch directly with debug logging
    return async (url, init) => {
        const headers = init?.headers || {};
        const auth = headers['Authorization'] || headers['authorization'];
        console.log(`[Fetch] ${init?.method || 'GET'} ${url}`);
        console.log(`[Fetch] Headers:`, {
            ...Object.fromEntries(headers.entries ? headers.entries() : Object.entries(headers)),
            Authorization: auth ? `Bearer ${auth.substring(7, 12)}...` : 'MISSING'
        });

        return fetch(url, init);
    };
};

// Default AI config
const DEFAULT_AI_CONFIG = {
    enabled: false,
    provider: 'openai',
    apiUrl: '',
    apiKey: '',
    model: 'gpt-5-mini',
    systemPrompt: 'You are a helpful AI assistant. Answer questions based on the provided note content.',
    temperature: 0.7,
    maxTokens: 2000,
    welcomeMessage: '向 AI 詢問關於此筆記的問題',
    suggestedQuestions: [
        { displayText: '重點摘要', promptText: '為這篇筆記生成重點摘要', autoGenerate: false },
        { displayText: '潤飾此筆記', promptText: '潤飾這篇筆記的文字，使其更通順、專業', autoGenerate: false },
        { displayText: '檢查文法錯誤', promptText: '檢查這篇筆記中的文法錯誤並提供修正建議', autoGenerate: false },
    ]
};

// Helper: Get AI config from DB
async function getAiConfig() {
    try {
        const setting = await db.SystemSetting.findByPk('ai_config');
        if (!setting) {
            return { ...DEFAULT_AI_CONFIG };
        }
        const config = JSON.parse(setting.value);
        // API Key is stored as plain text (no encryption)
        return { ...DEFAULT_AI_CONFIG, ...config };
    } catch (e) {
        console.error('Failed to get AI config:', e);
        return { ...DEFAULT_AI_CONFIG };
    }
}

// Helper: Save AI config to DB
async function saveAiConfig(config) {
    // Save config directly (no encryption for API Key)
    await db.SystemSetting.upsert({
        key: 'ai_config',
        value: JSON.stringify(config)
    });
}

// Middleware: Check if user is admin
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Login required' });
    }

    db.User.findByPk(req.session.userId).then(user => {
        if (!user || (user.role !== 'admin' && user.role !== 'super-admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.user = user;
        next();
    }).catch(e => {
        res.status(500).json({ error: e.message });
    });
}

// GET /api/ai/settings - Get AI settings
// Admin: returns full config (with masked apiKey)
// User: returns only enabled status
router.get('/settings', async (req, res) => {
    try {
        const config = await getAiConfig();

        // Check if admin
        const isAdmin = req.session?.userId && await db.User.findByPk(req.session.userId)
            .then(u => u && (u.role === 'admin' || u.role === 'super-admin'));

        if (isAdmin) {
            // Return full config with masked apiKey
            res.json({
                ...config,
                apiKey: config.apiKey ? mask(config.apiKey, 10) : '',
                hasApiKey: !!config.apiKey
            });
        } else {
            // Return enabled status and suggested questions for non-admin users
            res.json({
                enabled: config.enabled,
                welcomeMessage: config.welcomeMessage || '',
                suggestedQuestions: config.suggestedQuestions || []
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/ai/settings - Update AI settings (Admin only)
router.put('/settings', requireAdmin, async (req, res) => {
    try {
        const currentConfig = await getAiConfig();
        const newConfig = { ...currentConfig };

        // Update allowed fields
        const allowedFields = ['enabled', 'provider', 'apiUrl', 'apiKey', 'model', 'systemPrompt', 'temperature', 'maxTokens', 'welcomeMessage', 'suggestedQuestions'];
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                // Special handling for apiKey - only update if not empty
                if (field === 'apiKey') {
                    if (req.body.apiKey && req.body.apiKey.trim() !== '') {
                        newConfig.apiKey = req.body.apiKey;
                    }
                    // If empty, keep existing key
                } else {
                    newConfig[field] = req.body[field];
                }
            }
        }

        await saveAiConfig(newConfig);

        res.json({
            ...newConfig,
            apiKey: newConfig.apiKey ? mask(newConfig.apiKey, 10) : '',
            hasApiKey: !!newConfig.apiKey
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/ai/chat - Chat with AI (streaming response)
router.post('/chat', async (req, res) => {
    try {
        const config = await getAiConfig();

        // Check if API key is valid (simple check)
        if (!config.apiKey) {
            return res.status(500).json({ error: 'AI API key not configured' });
        }

        const { messages, noteContent } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid messages format' });
        }

        // Dynamically import AI SDK (ESM modules)
        const { streamText } = await import('ai');

        let model;

        if (config.provider === 'openai') {
            const { createOpenAI } = await import('@ai-sdk/openai');
            const openai = createOpenAI({
                apiKey: config.apiKey,
                baseURL: config.apiUrl || undefined,
                compatibility: 'compatible', // Use Chat Completions API for OpenRouter/third-party
                fetch: getFetchImplementation(),
            });
            model = openai.chat(config.model); // Force Chat Completions API, not Responses API
        } else if (config.provider === 'ollama') {
            const { createOllama } = await import('ollama-ai-provider');
            const ollama = createOllama({
                baseURL: config.apiUrl || 'http://localhost:11434/api',
                fetch: getFetchImplementation()
            });
            model = ollama(config.model);
        } else {
            return res.status(400).json({ error: 'Unsupported provider' });
        }

        // Build system prompt with note context
        let systemPrompt = config.systemPrompt || DEFAULT_AI_CONFIG.systemPrompt;
        if (noteContent) {
            systemPrompt += `\n\n---\nNote Content:\n${noteContent}\n---`;
        }

        // Stream the response
        const result = streamText({
            model,
            messages,
            system: systemPrompt,
            maxTokens: config.maxTokens || 2000,
            temperature: config.temperature || 0.7
        });

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if behind proxy
        res.flushHeaders(); // Send headers immediately

        // Stream text chunks to response
        for await (const chunk of result.textStream) {
            // Send in AI SDK data stream format
            res.write(`0:${JSON.stringify(chunk)}\n`);
            // Flush immediately for real-time streaming
            if (res.flush) res.flush();
        }

        res.end();

    } catch (e) {
        console.error('AI chat error:', e);
        // Check if headers already sent (streaming started)
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        }
    }
});

// GET /api/ai/models - Get available models (Admin only, for Ollama)
router.get('/models', requireAdmin, async (req, res) => {
    try {
        const config = await getAiConfig();

        if (config.provider === 'ollama') {
            const baseUrl = config.apiUrl || 'http://localhost:11434';
            const fetchImpl = getFetchImplementation();
            const response = await fetchImpl(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error('Failed to fetch Ollama models');
            }
            const data = await response.json();
            res.json({ models: data.models || [] });
        } else {
            // For OpenAI, return common models
            res.json({
                models: [
                    { name: 'gpt-5.2', description: 'GPT-5.2' },
                    { name: 'gpt-5', description: 'GPT-5' },
                    { name: 'gpt-5-mini', description: 'GPT-5 Mini' },
                    { name: 'gpt-5-nano', description: 'GPT-5 Nano' },
                    { name: 'gpt-4.1', description: 'GPT-4.1' }
                ]
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/ai/test - Test AI connection (Admin only)
router.post('/test', requireAdmin, async (req, res) => {
    try {
        const testConfig = req.body;

        if (!testConfig.apiKey && !testConfig.hasApiKey) {
            return res.status(400).json({ error: 'API key required for testing' });
        }

        // If no new apiKey provided but hasApiKey is true, use existing key
        let apiKey = testConfig.apiKey;
        if (!apiKey && testConfig.hasApiKey) {
            const currentConfig = await getAiConfig();
            apiKey = currentConfig.apiKey;
        }

        // Debug: check if apiKey is properly retrieved
        // console.log('[AI Test] Provider:', testConfig.provider);
        // console.log('[AI Test] API URL:', testConfig.apiUrl);
        // console.log('[AI Test] Has API Key:', !!apiKey, 'Length:', apiKey?.length || 0);

        // Sanitize API Key
        apiKey = apiKey?.trim();

        // Debug: check apiKey details
        console.log('[AI Test] API Key Length:', apiKey?.length);
        console.log('[AI Test] API Key Start:', apiKey?.substring(0, 10));
        console.log('[AI Test] API Key End:', apiKey?.substring(apiKey.length - 5));

        if (!apiKey) {
            return res.status(400).json({ error: 'API key is empty or could not be retrieved' });
        }

        // --- DEBUG: Raw Fetch Test Start ---
        if (testConfig.provider === 'openai') {
            console.log('[AI Test] Running Raw Fetch Test...');
            try {
                const rawResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:3000',
                        'X-Title': 'NoteHubMD'
                    },
                    body: JSON.stringify({
                        model: testConfig.model || 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: 'Test' }]
                    })
                });

                if (rawResponse.ok) {
                    console.log('[AI Test] Raw Fetch Success!');
                    const rawData = await rawResponse.json();
                    console.log('[AI Test] Response sample:', JSON.stringify(rawData).substring(0, 50) + '...');
                } else {
                    console.error('[AI Test] Raw Fetch Failed:', rawResponse.status, await rawResponse.text());
                }
            } catch (rawErr) {
                console.error('[AI Test] Raw Fetch Error:', rawErr);
            }
        }
        // --- DEBUG: Raw Fetch Test End ---

        const { generateText } = await import('ai');

        let model;

        if (testConfig.provider === 'openai') {
            const { createOpenAI } = await import('@ai-sdk/openai');
            const openai = createOpenAI({
                apiKey: apiKey,
                baseURL: testConfig.apiUrl || undefined,
                compatibility: 'compatible', // Use Chat Completions API for OpenRouter/third-party
                fetch: getFetchImplementation(),
                headers: {
                    'HTTP-Referer': 'http://localhost:3000', // Required by OpenRouter
                    'X-Title': 'NoteHubMD',
                }
            });
            model = openai.chat(testConfig.model || 'gpt-3.5-turbo'); // Force Chat Completions API, not Responses API
        } else if (testConfig.provider === 'ollama') {
            const { createOllama } = await import('ollama-ai-provider');
            const ollama = createOllama({
                baseURL: testConfig.apiUrl || 'http://localhost:11434/api',
                fetch: getFetchImplementation()
            });
            model = ollama(testConfig.model || 'llama2');
        } else {
            return res.status(400).json({ error: 'Unsupported provider' });
        }

        // Simple test: generate a short response
        const result = await generateText({
            model,
            prompt: 'Say "Hello" in one word.',
            maxTokens: 10
        });

        res.json({
            success: true,
            message: 'Connection successful',
            response: result.text
        });

    } catch (e) {
        console.error('AI test error:', e);
        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});

// POST /api/ai/suggest - Generate suggested questions using AI
router.post('/suggest', async (req, res) => {
    try {
        const { noteContent } = req.body;
        const config = await getAiConfig();

        if (!config.enabled) {
            return res.status(400).json({ error: 'AI is not enabled' });
        }

        if (!config.apiKey) {
            return res.status(400).json({ error: 'API key not configured' });
        }

        const { generateText } = await import('ai');
        let model;

        if (config.provider === 'openai') {
            const { createOpenAI } = await import('@ai-sdk/openai');
            const openai = createOpenAI({
                apiKey: config.apiKey,
                baseURL: config.apiUrl || undefined,
                compatibility: 'compatible',
                fetch: getFetchImplementation()
            });
            model = openai.chat(config.model);
        } else if (config.provider === 'ollama') {
            const { createOllama } = await import('ollama-ai-provider');
            const ollama = createOllama({
                baseURL: config.apiUrl || 'http://localhost:11434/api',
                fetch: getFetchImplementation()
            });
            model = ollama(config.model);
        } else {
            return res.status(400).json({ error: 'Unsupported provider' });
        }

        const result = await generateText({
            model,
            system: '你是一個筆記助手。根據提供的筆記內容，生成 2-3 個使用者可能想問的問題。回傳 JSON 格式：[{"displayText": "簡短顯示文字", "promptText": "完整的提示詞"}]。只回傳 JSON，不要有其他文字。',
            prompt: `筆記內容：\n${noteContent?.substring(0, 2000) || '(無內容)'}`,
            maxTokens: 500
        });

        // Parse AI response
        let questions = [];
        try {
            const jsonMatch = result.text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                questions = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            console.error('Failed to parse AI suggestions:', parseErr);
        }

        res.json({ questions });

    } catch (e) {
        console.error('AI suggest error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
