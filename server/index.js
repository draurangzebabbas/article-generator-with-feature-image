//Removed Models
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';

// Initialize Express app
const app = express();
app.use(helmet());

// Configure CORS
const corsOptions = {
    origin: true, // Allow all origins for now to ensure Make.com and other tools work
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increased limit for large payloads

// Static Authentication Token
const STATIC_AUTH_TOKEN = 'c242ba7778264234913517e4ce5b5348';

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'article-generator-backend',
        version: '2.0.0 (No-DB)'
    });
});

// Auth Middleware
export const authMiddleware = (req, res, next) => {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;

        if (!token || token !== STATIC_AUTH_TOKEN) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing token' });
        }

        req.user = { id: 'static-user' }; // Dummy user for compatibility
        next();
    } catch (err) {
        next(err);
    }
};

// OpenRouter configuration
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || 'https://your-app.com';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || 'Article Generator';

// Model fallback system
const MODEL_FALLBACKS = [
    "xiaomi/mimo-v2-flash:free",
    "mistralai/devstral-2512:free",
    "kwaipilot/kat-coder-pro:free",
    "deepseek/deepseek-r1-0528:free",
    "nex-agi/deepseek-v3.1-nex-n1:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "qwen/qwen3-235b-a22b:free",
    "qwen/qwen3-coder:free",
    "z-ai/glm-4.5-air:free",
    "xiaomi/mimo-v2-flash:free",
    "tngtech/tng-r1t-chimera:free",
    "tngtech/deepseek-r1t-chimera:free",
    "google/gemma-3-27b-it:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "openai/gpt-oss-20b:free",
    "allenai/olmo-3-32b-think:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "kwaipilot/kat-coder-pro:free",
    "google/gemini-2.0-flash-exp:free"
];

// Helper: Call OpenRouter API
async function callOpenRouterAPI(messages, model, apiKey, retryCount = 0, options = {}) {
    const { timeoutMs = 90000, maxTokens = 4000 } = options;
    const maxRetries = 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        console.log(`🤖 Calling OpenRouter API with model: ${model}`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': OPENROUTER_REFERER,
                'X-Title': OPENROUTER_TITLE
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7, // Slightly reduced for stability
                max_tokens: maxTokens
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ OpenRouter API error: ${response.status}`, errorText);

            if (response.status === 401) throw new Error('Invalid API key');
            if (response.status === 429) throw new Error('Rate limited');
            if (response.status === 402) throw new Error('Insufficient credits');
            if (response.status === 404 && errorText.includes('No endpoints found')) throw new Error('404: No endpoints found for model');
            if (response.status === 404) throw new Error('404: Not Found');


            throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;

        if (content) {
            content = content.trim();
        }

        return content;

    } catch (error) {
        console.error(`❌ Error with OpenRouter API:`, error.message);

        // Propagate specific errors to allow key rotation
        if (error.message.includes('Rate limited') || error.message.includes('Insufficient credits') || error.message.includes('Invalid API key') || error.message.includes('404')) {
            throw error;
        }

        // Handle network/timeout retries
        if (retryCount < maxRetries) {
            console.log(`🔄 Retrying OpenRouter API call (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return callOpenRouterAPI(messages, model, apiKey, retryCount + 1, options);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Function to parse JSON safely
function safeParseJSON(jsonString) {
    try {
        if (!jsonString) return null;
        let cleaned = jsonString.trim();
        // Remove markdown code blocks
        cleaned = cleaned.replace(/```(?:json)?|```/g, '');
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace >= 0) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
            return JSON.parse(cleaned);
        }
        return null;
    } catch (e) {
        console.error('JSON Parse Error:', e.message);
        return null;
    }
}

// Image Prompt Generator
async function generateImagePrompts(mainKeyword, title, headings, imageCount, userPrompt, width, height, openrouterApiKey, model) {
    // Simplified version for the refactor
    console.log('🖼️ Generating image prompts...');
    const prompts = [];

    // Basic fallback prompt logic if AI fails or just simple construction
    // Here we will try to use AI but fallback gracefully

    try {
        const messages = [
            {
                role: "system",
                content: "You are an expert visual content strategist. Create highly descriptive, hyper-detailed AI image prompts for article illustrations. Return ONLY the prompt text."
            },
            {
                role: "user",
                content: `Create an image prompt for an article titled "${title}" with main keyword "${mainKeyword}". This is image 1 of ${imageCount}.`
            }
        ];

        // Only generate one AI prompt for the main image to save tokens/time, or loop if needed.
        // For efficiency in this refactor, let's create prompts based on headings logic locally or simple AI calls.

        // Let's loop for count
        for (let i = 0; i < imageCount; i++) {
            let context = i === 0 ? "Main hero image" : `Content image for section related to ${headings?.section_1?.[i - 1] || mainKeyword}`;
            if (userPrompt && i === 0) {
                prompts.push(userPrompt);
                continue;
            }

            const promptMsg = [
                {
                    role: "system",
                    content: "Create a photorealistic, professional image prompt for a website article. Return ONLY the prompt."
                },
                {
                    role: "user",
                    content: `Context: ${context}. Main Keyword: ${mainKeyword}.`
                }
            ];

            // We use the same API call function
            const aiPrompt = await callOpenRouterAPI(promptMsg, model, openrouterApiKey, 0, { maxTokens: 150 });
            prompts.push(aiPrompt || `Professional image of ${mainKeyword}`);
        }

        return { prompts, mainPrompt: prompts[0], success: true };

    } catch (e) {
        console.error('Image prompt generation failed, using fallbacks', e);
        const fallbackPrompts = Array(imageCount).fill(`Professional photograph of ${mainKeyword}, high quality`);
        return { prompts: fallbackPrompts, mainPrompt: fallbackPrompts[0], success: false };
    }
}

// Format Article HTML
const formatCompleteArticle = (title, excerpt, toolResult, guideResult, section1Result, section2Result, faqResult, imagePlacement, metaData) => {
    let article = '';
    const safeImagePlacement = Array.isArray(imagePlacement) ? imagePlacement : [];

    // Featured Image
    if (safeImagePlacement.length > 0 && safeImagePlacement[0].type === 'featured' && title) {
        article += `<div class="featured-image" style="margin: 2rem 0; text-align: center;"><img src="${safeImagePlacement[0].url}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);" /></div>`;
    }

    if (toolResult) article += `<section style="margin-bottom: 3rem;">${toolResult}</section>`;
    if (guideResult) article += `<section style="margin-bottom: 3rem;">${guideResult}</section>`;

    // Section 1 with images
    if (section1Result) {
        article += `<section style="margin-bottom: 3rem;">${section1Result}</section>`;
        // Simple injection of images for Section 1
        const s1Images = safeImagePlacement.filter(img => img.type === 'content' && img.position <= (metaData?.headings?.section_1?.length || 0));
        s1Images.forEach(img => {
            article += `<div style="margin: 2rem 0; text-align: center;"><img src="${img.url}" alt="Illustration" style="max-width: 100%; height: auto; border-radius: 8px;" /></div>`;
        });
    }

    // Section 2 with images
    if (section2Result) {
        article += `<section style="margin-bottom: 3rem;">${section2Result}</section>`;
        const s1Len = metaData?.headings?.section_1?.length || 0;
        const s2Images = safeImagePlacement.filter(img => img.type === 'content' && img.position > s1Len);
        s2Images.forEach(img => {
            article += `<div style="margin: 2rem 0; text-align: center;"><img src="${img.url}" alt="Illustration" style="max-width: 100%; height: auto; border-radius: 8px;" /></div>`;
        });
    }

    if (faqResult) article += `<section style="margin-bottom: 3rem;">${faqResult}</section>`;

    return article;
};

// Main Endpoint
app.post('/api/generate-article', authMiddleware, async (req, res) => {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
        const {
            mainKeyword,
            top10Articles,
            relatedKeywords,
            guidelines,
            generateImage = false,
            imagePrompt = '',
            imageWidth = 1200,
            imageHeight = 630,
            createTool = true,
            competitorResearch = false,
            imageCount = 1,
            serpCountry = 'US',
            serpPage = 1,
            openRouterApiKey,  // Expecting comma-separated keys
            apifyApiKey        // Optional
        } = req.body;

        if (!mainKeyword) return res.status(400).json({ error: 'mainKeyword is required' });
        if (!openRouterApiKey) return res.status(400).json({ error: 'openRouterApiKey is required (comma-separated for rotation)' });

        // Parse Keys
        const apiKeys = String(openRouterApiKey).split(',').map(k => k.trim()).filter(Boolean);
        if (apiKeys.length === 0) return res.status(400).json({ error: 'No valid OpenRouter API keys provided' });

        // Key Manager Logic
        const keyManager = {
            keys: apiKeys.map(k => ({ key: k, status: 'active' })),
            currentIndex: 0,
            getKey: function () {
                // Check if any active keys remain
                const activeCount = this.keys.filter(k => k.status === 'active').length;
                if (activeCount === 0) throw new Error('All provided API keys are rate limited or failed.');

                // Round-Robin Rotation: Find next active key
                let attempts = 0;
                while (attempts < this.keys.length) {
                    const k = this.keys[this.currentIndex % this.keys.length];
                    this.currentIndex++; // Move index for next call

                    if (k.status === 'active') {
                        return k;
                    }
                    attempts++;
                }
                throw new Error('All keys failed during selection.');
            },
            markFailed: function (keyStr, reason) {
                const k = this.keys.find(x => x.key === keyStr);
                if (k && k.status === 'active') {
                    console.log(`⚠️ Key ...${keyStr.slice(-4)} marked as failed: ${reason}`);
                    k.status = 'failed';
                }
            }
        };

        // Execute Module with Robust Model & Key Rotation
        const executeModule = async (moduleName, messages, initialModel, options = {}) => {
            // Prepare list of models to try: [initialModel, ...fallbacks] (unique)
            const modelsToTry = [initialModel, ...MODEL_FALLBACKS.filter(m => m !== initialModel)];
            let lastError;

            // OUTER LOOP: Models
            for (const model of modelsToTry) {

                // INNER LOOP: Attempts on this model
                // We assume multiple keys are available. We try up to 3 keys per model if valid.
                // If we hit a "Model Error", we break immediately.
                let retriesOnModel = 0;
                const maxRetriesOnModel = 3;

                while (retriesOnModel < maxRetriesOnModel) {
                    let currentKeyObj;
                    try {
                        currentKeyObj = keyManager.getKey();
                    } catch (e) {
                        throw e; // No keys left
                    }

                    try {
                        console.log(`🚀 Executing ${moduleName} using Model: ${model} | Key: ...${currentKeyObj.key.slice(-4)}`);
                        // Internal Loop for 5xx Retries (Backoff)
                        let serverRetries = 0;
                        while (serverRetries < 2) {
                            try {
                                const result = await callOpenRouterAPI(messages, model, currentKeyObj.key, 0, options);
                                return result;
                            } catch (err) {
                                if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503') || err.message.includes('504')) {
                                    console.warn(`Server error ${err.message}. Retrying same key/model...`);
                                    await new Promise(r => setTimeout(r, 2000)); // Backoff
                                    serverRetries++;
                                    continue;
                                }
                                throw err; // Throw non-5xx to outer catch
                            }
                        }
                        // If 5xx persists after local retries, throw it to handle as generic failure (or rotate key)
                        throw new Error('Persistent Server Error');

                    } catch (error) {
                        lastError = error;
                        const errMsg = error.message || '';
                        const errData = JSON.stringify(error); // rough check

                        // --- CLASSIFY ERROR ---

                        // 1. KEY PROBLEM -> Rotate Key
                        // 401, 402, 429 (without upstream/provider text)
                        const isKeyProblem =
                            errMsg.includes('401') ||
                            errMsg.includes('402') ||
                            errMsg.includes('Insufficient credits') ||
                            errMsg.includes('Invalid API key') ||
                            (errMsg.includes('429') && !errMsg.includes('upstream') && !errMsg.includes('Provider') && !errMsg.includes('Chutes'));

                        if (isKeyProblem) {
                            console.warn(`⚠️ Key ...${currentKeyObj.key.slice(-4)} failed: ${errMsg}. Rotating key.`);
                            keyManager.markFailed(currentKeyObj.key, errMsg);
                            retriesOnModel++;
                            continue; // Next attempt (different key)
                        }

                        // 2. MODEL PROBLEM -> Rotate Model
                        // 429 + upstream/provider, or explicit provider error
                        const isModelProblem =
                            errMsg.includes('rate-limited upstream') ||
                            errMsg.includes('Provider returned error') ||
                            errMsg.includes('No endpoints found') ||
                            errMsg.includes('Chutes') ||
                            errMsg.includes('Together');

                        if (isModelProblem) {
                            console.warn(`⚠️ Model ${model} failed (Model Issue): ${errMsg}. Switching Model.`);
                            break; // BREAK inner loop -> Next Model
                        }

                        // 3. OTHER / UNKNOWN -> Default retry (rotate key to be safe)
                        console.warn(`⚠️ Unknown error with ${model}: ${errMsg}. Retrying...`);
                        retriesOnModel++;
                        continue;
                    }
                }
            }

            throw new Error(`ExecuteModule failed after trying all models. Last error: ${lastError?.message}`);
        };

        // Sanitization (keeping simple)
        const sanitizedMainKeyword = String(mainKeyword).trim();
        const sanitizedRelatedKeywords = Array.isArray(relatedKeywords) ? relatedKeywords : String(relatedKeywords || '').split(',').filter(Boolean);
        const sanitizedImageCount = Math.min(Math.max(1, Number(imageCount) || 1), 5);

        // --- SERP Research (Apify) ---
        let finalTop10Articles = top10Articles || '';
        let serpResultsForResponse = [];

        if (competitorResearch && apifyApiKey) {
            console.log('🕵️‍♂️ Starting SERP Research with Apify...');
            try {
                // Support comma-separated keys for rotation
                const apifyKeys = String(apifyApiKey).split(',').map(k => k.trim()).filter(Boolean);
                const activeApifyKey = apifyKeys[0]; // Simple logic: take first one

                const serpCountryCode = (serpCountry || 'US').toUpperCase();

                // 1. Start Crawler
                const run = await fetch('https://api.apify.com/v2/acts/scraperlink~google-search-results-serp-scraper/runs', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${activeApifyKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ country: serpCountryCode, keyword: sanitizedMainKeyword, page: Number(serpPage) || 1 })
                });

                if (!run.ok) throw new Error(`Apify start failed: ${run.status}`);
                const runData = await run.json();
                const runId = runData.data.id;

                // 2. Poll for results
                let attempts = 0;
                while (attempts < 30) {
                    await new Promise(r => setTimeout(r, 5000));
                    const check = await fetch(`https://api.apify.com/v2/acts/scraperlink~google-search-results-serp-scraper/runs/${runId}`, {
                        headers: { 'Authorization': `Bearer ${activeApifyKey}` }
                    });
                    const checkData = await check.json();
                    if (checkData.data.status === 'SUCCEEDED') break;
                    if (checkData.data.status === 'FAILED') throw new Error('Apify run failed');
                    attempts++;
                }

                // 3. Get Dataset
                const datasetRes = await fetch(`https://api.apify.com/v2/acts/scraperlink~google-search-results-serp-scraper/runs/${runId}/dataset/items`, {
                    headers: { 'Authorization': `Bearer ${activeApifyKey}` }
                });
                const items = await datasetRes.json();

                if (Array.isArray(items) && items.length > 0) {
                    const results = items[0].results || [];
                    serpResultsForResponse = results.slice(0, 10).map(r => ({ title: r.title, url: r.url, desc: r.description }));

                    // Format for LLM
                    const lines = results.slice(0, 10).map(r => `Title: ${r.title}\nDescription: ${r.description}`).join('\n\n');
                    if (lines) finalTop10Articles = lines;

                    // Append related keywords from SERP if available
                    if (items[0].related_keywords?.keywords) {
                        const serpKeywords = items[0].related_keywords.keywords;
                        if (serpKeywords.length) {
                            // Add to related keywords if not already present
                            sanitizedRelatedKeywords.push(...serpKeywords);
                        }
                    }
                    console.log(`✅ SERP Research complete. Found ${results.length} results.`);
                }

            } catch (e) {
                console.error('⚠️ SERP Research failed:', e.message);
                // Continue without it
            }
        }

        // --- Steps ---

        // Helper to get formatted string for arrays
        const relatedKeywordsString = sanitizedRelatedKeywords.join(', ');

        // --- Step 1: Meta & Toc Generator ---
        console.log(`🚀 Starting Meta & Toc Generator for keyword: ${sanitizedMainKeyword}`);
        const defaultModel = MODEL_FALLBACKS[0];

        const metaGeneratorMessages = [
            {
                role: "system",
                content: "You are an expert SEO copywriter trained to create high-performing, keyword-optimized content for websites. Your task is to analyze the given main keyword, top 10 competing articles, and related keywords — then return an SEO-optimized title and excerpt (meta description) that will improve CTR, topical relevance, and keyword targeting.\\n\\n### Your goals:\\n- Outperform the top 10 competitors in search\\n- Maximize relevance for both search engines and users\\n- Match Google's SERP formatting best practices\\n\\n### Strongly Follow These Rules:\\n\\n1. SEO Title\\n   - Must include the main keyword, preferably at the beginning\\n   - Strictly limited to less than 60 characters\\n   - Must be compelling and CTR-optimized\\n   - Use Title Case (Capitalize Major Words)\\n   - Include a unique differentiator (like 'Free', 'Best', 'Instant', etc.)\\n   - Avoid clickbait, vague terms, or filler words\\n\\n2. SEO Meta Description / Excerpt\\n   - Strictly between 150 and 160 characters\\n   - Clearly explain what the user will get\\n   - Must include the main keyword and 1–2 related keywords naturally\\n   - Informative and benefit-driven tone (no hype or fluff)\\n\\n3. Do not include filler words, generic content, or overly promotional language\\n\\n### Headings Instructions:\\n\\n4. Structured H2 Headings Generation\\n   - Generate 10 to 14 unique, non-overlapping H2 headings\\n   - Divide them into two clearly labeled sections:\\n     - section_1: Core Informational Topics (definitions, how-tos, key guides)\\n     - section_2: Supporting & Secondary Topics (tips, examples, context) (dont include faq and conclusion heading ever in any of section)\\n   - All headings must be:\\n     - Relevant to the main keyword and context\\n     - Clear, value-driven, and highly specific\\n     - SEO-optimized and free from duplicate phrasing\\n     - Avoid keyword stuffing or vague generalities\\n   - Strictly do not add any heading in the form of `What is [main keyword]` or `How to Use [main keyword]`\\n\\n### Final Output Format:\\nReturn a valid JSON object with these exact fields:\\n- title: SEO-optimized title (less than 60 characters)\\n- excerpt: SEO-optimized meta description (150-160 characters)\\n- headings: object with section_1 and section_2 arrays containing H2 headings\\n- faq: array of 5-8 FAQ questions\\n- feature_image_prompt: string only when image generation is requested (omit otherwise)"
            },
            {
                role: "user",
                content: `Here is our main keyword \\n"${sanitizedMainKeyword}"\\n\\n\\nTop 10 ranking  articles\\n${finalTop10Articles}\\n\\n\\nRelated Keywords\\n${relatedKeywordsString}\\n\\n- generate_image: ${generateImage}\\n- desired_dimensions: { width: ${imageWidth}, height: ${imageHeight} }\\n- provided_image_prompt: ${imagePrompt || '(none)'}\\n`
            },
            {
                role: "system",
                content: "CRITICAL: Return ONLY a valid JSON object. Do NOT use markdown formatting, code blocks, or any text outside the JSON braces.\\n\\n- NO ```json\\n- NO ```\\n- NO text before or after the JSON\\n- ONLY the JSON object starting with { and ending with }\\n- Ensure the JSON is properly formatted and valid\\n\\nExample of CORRECT output:\\n{\\\"title\\\": \\\"Example Title\\\", \\\"excerpt\\\": \\\"Example excerpt\\\"}\\n\\nExample of INCORRECT output:\\n```json\\n{\\\"title\\\": \\\"Example Title\\\"}\\n```\\n\\nReturn ONLY the JSON object, nothing else."
            }
        ];

        let metaResult = await executeModule('Meta & Toc Generator', metaGeneratorMessages, defaultModel, { maxTokens: 3000 });

        // Debug logging for JSON parsing
        console.log('🔍 Meta & Toc Generator raw result (first 200 chars):', metaResult.substring(0, 200));

        let metaData = safeParseJSON(metaResult);

        if (!metaData) {
            console.error('❌ Meta & Toc Generator returned invalid JSON. Attempting manual extraction...');
            const manualExtraction = metaResult.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');
            const firstBrace = manualExtraction.indexOf('{');
            const lastBrace = manualExtraction.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                try {
                    metaData = JSON.parse(manualExtraction.substring(firstBrace, lastBrace + 1));
                } catch (e) {
                    console.error('Manual extraction failed');
                }
            }
        }

        if (!metaData) {
            throw new Error('Failed to parse Meta & Toc Generator result - invalid JSON format');
        }

        // Validate required fields
        if (!metaData.title || !metaData.excerpt || !metaData.headings) {
            // Fallback if AI fails to give strict structure, though prompt is strong
            console.warn('Meta data missing fields, patching...');
            metaData.headings = metaData.headings || {};
            metaData.headings.section_1 = metaData.headings.section_1 || [`Guide to ${sanitizedMainKeyword}`];
            metaData.headings.section_2 = metaData.headings.section_2 || [`More about ${sanitizedMainKeyword}`];
            metaData.title = metaData.title || `${sanitizedMainKeyword}: Complete Guide`;
            metaData.excerpt = metaData.excerpt || `Learn about ${sanitizedMainKeyword} in this comprehensive guide.`;
        }

        console.log(`✅ Meta & Toc Generator completed:`, {
            title: metaData.title,
            headings_count: (metaData.headings?.section_1?.length || 0) + (metaData.headings?.section_2?.length || 0)
        });

        // --- Branch A: Tool -> Validator -> Guide ---
        const branchA = createTool ? (async () => {
            console.log(`🚀 Starting Branch A: Tool -> Validator -> Guide`);

            // Tool Generator
            const toolGeneratorMessages = [
                {
                    role: "system",
                    content: "You are a professional HTML + JavaScript tool generator trained to produce tools that **work perfectly inside WordPress** and **always show the correct output after clicking the button**.\\n\\n# PURPOSE:\\nYour job is to generate **ready-to-paste HTML tools** (with inline CSS and JS) that:\\n- Visually display inside WordPress posts/pages\\n- Are fully responsive and mobile-friendly\\n- Show output **only after clicking a button**\\n- Always produce **correct and validated output** without errors\\n- DO NOT break Gutenberg or Classic Editor rendering\\n\\n---\\n\\n## ✅ STRUCTURE RULES (WordPress-Safe):\\n\\n1. All HTML must be wrapped in **one parent**:\\n   `<div class=\\\"tool-wrapper\\\">…</div>`\\n\\n2. Add a `<style>` block **inside or after** the `.tool-wrapper`  \\r\\n   (Inline only — never linked, never external.)\\n\\n3. Add a `<script type=\\\"text/javascript\\\">` block **after the wrapper**, never inside it.\\n\\n4. DO NOT include any of the following:\\n   - `<html>`, `<head>`, `<body>`\\n   - `<script src>` or external JS libraries\\n   - Markdown formatting (no backticks or triple-quotes)\\n   - Comments, explanations, or non-code text\\n\\n---\\n\\n## ✅ JAVASCRIPT RULES:\\n\\n- Wrap all JS inside:\\n  `document.addEventListener(\\\"DOMContentLoaded\\\", function () { … });`\\n\\n- Use `getElementById()` for inputs\\n- Use `parseFloat()` and **validate all inputs rigorously to avoid `NaN` or incorrect calculations**\\n- Output must appear in a styled box using `<div id=\\\"result\\\">` or `.result-container`\\n- Handle errors gracefully (e.g., show clear error messages if input is invalid or missing)\\n- NO `onclick=\\\"\\\"` — always use `addEventListener()`\\n- **Force correctness: calculations must be accurate and reflect expected results precisely**\\n- Ensure **output updates only after clicking the button**\\n- Prevent empty or broken output states in all cases\\n\\n---\\n\\n## ✅ DESIGN STANDARDS (Visual Quality):\\n\\n- Responsive layout (mobile & desktop)\\n- Use clean fonts, padding, spacing, borders\\n- Inputs should be user-friendly (large, styled)\\n- Buttons must be modern (rounded, hover effect)\\n- Result must show clearly after calculation (in a box with padding)\\n- Use soft shadows, border-radius, subtle animations if needed\\n\\n---\\n\\n## ✅ OUTPUT FORMAT:\\n\\nYour output must be a **single code block** containing:\\n- ✅ HTML structure\\n- ✅ `<style>` with all CSS\\n- ✅ `<script>` with JavaScript logic\\n\\nNO:\\n- Markdown syntax\\n- Comments\\n- Descriptions\\n- External links or resources\\n\\n✅ YES:\\n- Clean UI\\n- Reliable logic with **correct output guaranteed**\\n- Fully WordPress-compatible display\\n- Accurate result shown only on button click\\n\\n---\\n\\n## ✅ CRITICAL RULES:\\n\\n✔️ Must work in:\\n- Gutenberg (Custom HTML block)\\n- Classic Editor (\\\"Text\\\" mode)\\n- Make.com automations\\n\\n❌ Must NOT require:\\n- jQuery\\n- React, Vue, or external frameworks\\n- External CSS or JS files\\n\\n---\\n\\n## ✅ VISUAL + FUNCTIONAL GOAL:\\n\\nThe tool must:\\n- Look clean and modern\\n- Be intuitive and mobile-friendly\\n- Show calculated result only after clicking the button\\n- Never appear broken, empty, or produce wrong output in WordPress post preview\\n\\n---\\n\\n## ✅ SAMPLE OUTPUT STRUCTURE (FOR TRAINING)\\n\\n<div class=\\\"tool-wrapper\\\">\\r\\n  <h2>Sample Tool</h2>\\r\\n  <input type=\\\"number\\\" id=\\\"value1\\\" placeholder=\\\"Enter first value\\\">\\r\\n  <input type=\\\"number\\\" id=\\\"value2\\\" placeholder=\\\"Enter second value\\\">\\r\\n  <button id=\\\"calcBtn\\\">Calculate</button>\\r\\n  <div class=\\\"result-container\\\" id=\\\"result\\\"></div>\\r\\n</div>\\r\\n<style>\\r\\n  .tool-wrapper {\\r\\n    max-width: 500px;\\r\\n    margin: 40px auto;\\r\\n    padding: 20px;\\r\\n    background: #f9f9f9;\\r\\n    border-radius: 12px;\\r\\n    box-shadow: 0 4px 10px rgba(0,0,0,0.1);\\r\\n    font-family: Arial, sans-serif;\\r\\n  }\\r\\n  .tool-wrapper input {\\r\\n    width: 100%;\\r\\n    padding: 10px;\\r\\n    margin-bottom: 12px;\\r\\n    font-size: 16px;\\r\\n    border: 1px solid #ccc;\\r\\n    border-radius: 6px;\\r\\n  }\\r\\n  .tool-wrapper button {\\r\\n    width: 100%;\\r\\n    padding: 12px;\\r\\n    background: #007bff;\\r\\n    color: #fff;\\r\\n    border: none;\\r\\n    border-radius: 6px;\\r\\n    font-size: 16px;\\r\\n    cursor: pointer;\\r\\n    transition: background 0.3s;\\r\\n  }\\r\\n  .tool-wrapper button:hover {\\r\\n    background: #0056b3;\\r\\n  }\\r\\n  .result-container {\\r\\n    margin-top: 20px;\\r\\n    padding: 15px;\\r\\n    background: #e9ecef;\\r\\n    border-radius: 6px;\\r\\n    text-align: center;\\r\\n    font-size: 18px;\\r\\n    font-weight: bold;\\r\\n    color: #333;\\r\\n  }\\r\\n</style>\\r\\n<script type=\\\"text/javascript\\\">\\r\\n  document.addEventListener(\\\"DOMContentLoaded\\\", function () {\\r\\n    document.getElementById(\\\"calcBtn\\\").addEventListener(\\\"click\\\", function () {\\r\\n      const val1 = parseFloat(document.getElementById(\\\"value1\\\").value);\\r\\n      const val2 = parseFloat(document.getElementById(\\\"value2\\\").value);\\r\\n      const resultBox = document.getElementById(\\\"result\\\");\\r\\n\\r\\n      if (isNaN(val1) || isNaN(val2)) {\\r\\n        resultBox.textContent = \\\"Please enter valid numbers.\\\";\\r\\n      } else {\\r\\n        const total = val1 + val2;\\r\\n        resultBox.textContent = \\\"Result: \\\" + total.toFixed(2);\\r\\n      }\\r\\n    });\\r\\n  });\\r\\n</script>\\r\\n​"
                },
                {
                    role: "system",
                    content: `You think about keywords below and then decide what should be in our tool to satisfy user\\nRelated Keywords to our main keyword \\n${relatedKeywordsString}`
                },
                {
                    role: "user",
                    content: `Here is our main keyword on which we have to create tool\\n"${sanitizedMainKeyword}"\\n\\nmake sure our tool is fully working responsive and hass no error or problem in use for user it should show answer beautifuly\\n\\nGuidelines : ${guidelines || 'Create a useful, functional tool'}`
                }
            ];

            const toolResult = await executeModule('Tool Generator', toolGeneratorMessages, MODEL_FALLBACKS[1], { maxTokens: 4000 });
            console.log(`✅ Tool Generator completed, tool length: ${toolResult.length} characters`);

            // Tool Validator
            const toolValidatorMessages = [
                {
                    role: "system",
                    content: "You are a calculator tool optimizer and validator for WordPress. Your role is to ensure every generated tool:\\n\\n1. **Works 100% on WordPress** inside a single \"Custom HTML\" block.\\n2. **Does NOT return extra explanations or Markdown. Only return raw tool code.**\\n3. Tool must include:\\n   - Clean HTML (inputs, labels, buttons)\\n   - Embedded CSS inside a `<style>` tag\\n   - JavaScript inside a `<script>` tag using `document.addEventListener(\\\"DOMContentLoaded\\\", ...)`\\n   - Output shown in a styled box using `<div id=\\\"result\\\">` or `.result-container`\\n4. Code must be:\\n   - Compact and functional\\n   - Free from formatting issues, broken tags, or smart quotes\\n   - Free from `<br />` misuse and accidental line breaks that break WordPress blocks\\n   - No external files, no jQuery, no console.log\\n   - Correctly using `parseFloat` or `parseInt` to ensure calculations work\\n   - Responsive and user-friendly\\n   - **Crucially, the tool MUST produce visible, accurate results immediately after clicking \"Calculate\" with no errors or empty output**\\n5. DO NOT return anything besides the final raw code block.\\n6. The entire tool must be returned as ONE continuous code block with no extra spaces or empty lines that might break WordPress block formatting.\\n7. The output must be guaranteed to WORK immediately when pasted into a WordPress \"Custom HTML\" block, showing the calculated result in `.result-container` after clicking the \"Calculate\" button.\\n8. If any calculation involves numeric inputs, ensure `parseFloat` or `parseInt` is always used properly before computations.\\n9. Example return format:\\n\\n<div class=\\\"tool-wrapper\\\">\\r\\n  <h2>Tool Title</h2>\\r\\n  <label for=\\\"input1\\\">Label:</label>\\r\\n  <input type=\\\"number\\\" id=\\\"input1\\\">\\r\\n  <button id=\\\"calculateBtn\\\">Calculate</button>\\r\\n  <div id=\\\"result\\\" class=\\\"result-container\\\"></div>\\r\\n</div>\\r\\n<style>\\r\\n  /* CSS styles here */\\r\\n</style>\\r\\n<script>\\r\\n  document.addEventListener(\\\"DOMContentLoaded\\\", function () {\\r\\n    document.getElementById(\\\"calculateBtn\\\").addEventListener(\\\"click\\\", function () {\\r\\n      const input = parseFloat(document.getElementById(\\\"input1\\\").value);\\r\\n      const result = input * 2; // Example logic\\r\\n      document.getElementById(\\\"result\\\").style.display = \\\"block\\\";\\r\\n      document.getElementById(\\\"result\\\").innerText = \\\"Result: \\\" + result;\\r\\n    });\\r\\n  });\\r\\n</script>\\r\\n\\nDo not break output into multiple blocks. Return only one full code block that can be copy-pasted into WordPress and work immediately.\\r\\n\\r\\nPlease, ensure the tool always displays the calculated results visibly and correctly upon clicking \"Calculate\".\\n\\n\\nreturn me just working tool code dont add any heading explanation any faq or anything which is not code tool just make sure all tool code is functional and code work in wordpress greate\\n\\nmake sure results are shown properly when calculat button is clicked"
                },
                {
                    role: "user",
                    content: `here is the tool to fix\\n${toolResult}`
                }
            ];

            const validatedToolResult = await executeModule('Tool Validator', toolValidatorMessages, MODEL_FALLBACKS[0], { maxTokens: 4000 });
            console.log(`✅ Tool Validator completed, validated tool length: ${validatedToolResult.length} characters`);

            // Guide Generator
            const guideGeneratorMessages = [
                {
                    role: "system",
                    content: "# 🧠 System Prompt: Generate Detailed HTML Guide for a Tool (SEO + UX Focused)\\n\\nYou are a professional SEO and UX copywriter who writes helpful, beginner-friendly HTML content for online tools and calculators.\\n\\nYour task is to generate a single HTML `\\\"guide\\\"` block using the information below.\\n\\n---\\n\\n## 🔽 Input\\n\\nYou will be given the following input in JSON format:\\n{\\n \\\"mainKeyword\\\": \\\"mortgage payoff calculator\\\",\\n  \\\"toolCode\\\": \\\"FULL HTML/JS CODE OF THE TOOL\\\"\\n\\\"related_keywords\\\": \\\"they are related keywords you could use in content if needed for seo\\\",\\n}\\n---\\n\\n## ✅ Output\\n\\nReturn a single guide object in this exact structure:\\n\\n<p>...</p><h2>What is Mortgage Payoff Calculator?</h2><p>...</p><h2>How to use Mortgage Payoff Calculator?</h2><p>...</p>\\n\\n* The entire guide must be valid, semantic HTML.\\n* Output must be ready to paste directly into a WordPress post.\\n\\n---\\n\\n## 🧩 Structure of Guide\\n\\n### 1. Intro Paragraph\\n\\n<p>\\r\\n  <strong>[mainKeyword]</strong> introduction paragraph (30–50 words). Mention the tool, its purpose, and that a guide follows.\\r\\n</p>\\r\\n\\r\\n\\r\\n**Requirements**:\\r\\n\\r\\n* Bold the **main keyword** using `<strong>` in the **first sentence**.\\r\\n* Use natural language.\\r\\n* Mention that this is a brief but complete guide on using the tool.\\r\\n\\r\\n---\\n\\n### 2. `<h2>What is [Tool Name]?</h2>`\\r\\n\\r\\n\\r\\n<h2>What is Mortgage Payoff Calculator?</h2>\\r\\n<p>...</p>\\r\\n\\r\\n\\r\\n**Requirements**:\\r\\n\\r\\n* Minimum **200 words**.\\r\\n* Explain in clear, natural, user-friendly language:\\r\\n\\r\\n  * What this tool does\\r\\n  * What problem it solves\\r\\n  * Who benefits from it\\r\\n  * Why it's useful in daily or professional life\\r\\n* Do not include code, APIs, or developer talk.\\r\\n\\r\\n---\\n\\n### 3. `<h2>How to use [Tool Name]?</h2>`\\r\\n\\r\\n\\r\\n<h2>How to use Mortgage Payoff Calculator?</h2>\\r\\n<p>...</p>\\r\\n\\r\\n\\r\\n**Requirements**:\\r\\n\\r\\n* Minimum **200 words**.\\r\\n* Write a step-by-step usage guide that includes:\\r\\n\\r\\n  * What input fields the user must fill\\r\\n  * How the button or form works\\r\\n  * What the user sees as output\\r\\n  * Any edge cases or tips\\r\\n* Be friendly and human. Imagine you're helping a non-technical person understand how to use it.\\r\\n\\r\\n---\\n\\n## 🎯 Style & Content Guidelines\\r\\n\\r\\n* **Tone**: Conversational, warm, and helpful — not robotic.\\r\\n* **Audience**: Write for average internet users — not programmers or devs.\\r\\n* **Goal**: Help them understand what the tool does and how to use it without confusion.\\r\\n* **SEO Awareness**:\\r\\n\\r\\n  * Use the `mainKeyword` in the **first `<p>`** (bolded).\\r\\n  * Sprinkle the keyword **naturally** throughout the content (max 3 times total).\\r\\n\\r\\n---\\n\\n## ✅ Allowed HTML Tags\\r\\n\\nUse **only** the following tags in the output:\\r\\n\\r\\n\\r\\n<p>, <ul>, <li>, <a>, <strong>, <em>, <blockquote>, <br>, <h2>\\r\\n\\r\\n\\r\\n---\\n\\n## ❌ Forbidden\\r\\n\\r\\n* ❌ No `<div>`, `<span>`, `<style>`, `<script>`, `<code>`, or `<iframe>`\\r\\n* ❌ No inline CSS or JavaScript\\r\\n* ❌ No images or non-semantic tags\\r\\n* ❌ No developer jargon or technical terminology (e.g. \\\"JS\\\", \\\"API\\\", \\\"DOM\\\", etc.)\\r\\n\\r\\n---\\n\\n## 🧪 Sample Output Structure\\r\\n\\r\\n<p><strong>Mortgage payoff calculator</strong> helps users...</p><h2>What is Mortgage Payoff Calculator?</h2><p>...</p><h2>How to use Mortgage Payoff Calculator?</h2><p>...</p>\\r\\n\\r\\n---\\n\\noutput should have just html ready toi paste in article\\ndont append with ```html or add any thing extra\\r\\n\\r\\n## 📌 Personalization Requirement\\r\\n\\r\\nUse the provided `\\\"toolCode\\\"` to fully understand:\\r\\n\\r\\n* What inputs the tool accepts\\r\\n* What calculations or logic it performs\\r\\n* What output it shows\\r\\n* Any unique features (e.g., sliders, currency format, multiple result types)\\r\\n\\r\\nThen write the guide with this personalized understanding. Do not guess or generalize.\\r\\n\\r\\n---\\r\\n\\r\\n"
                },
                {
                    role: "user",
                    content: `Here is our main keyword on which we have to create guide\\n"${sanitizedMainKeyword}"\\n\\nHere is the tool code\\n${validatedToolResult}\\n\\nRelated Keywords to our main keyword\\n${relatedKeywordsString}`
                }
            ];

            const guideResult = await executeModule('Guide Generator', guideGeneratorMessages, MODEL_FALLBACKS[0], { maxTokens: 4000 });
            console.log(`✅ Guide Generator completed, guide length: ${guideResult.length} characters`);

            return {
                toolResult,
                validatedToolResult,
                guideResult
            };
        })() : Promise.resolve({ toolResult: '', validatedToolResult: '', guideResult: '' });

        // --- Branch B: Section 1 -> Section 2 -> FAQ ---
        const branchB = (async () => {
            console.log(`🚀 Starting Branch B: Section 1 -> Section 2 (optimized)`);

            // Section 1 Generator
            const section1GeneratorMessages = [
                {
                    role: "system",
                    content: "You are an expert SEO content writer. Your task is to write the full article body using only the exact headings provided in `section_1`. These are the only headings allowed. \\r\\n\\r\\n---\\r\\n\\r\\n### You Will Receive:\\r\\n\\r\\n- **title**: The post title (for internal reference only; not to be included in output).\\r\\n- **excerpt**: A short introductory paragraph that will be rewritten to start the article.\\r\\n- **related_keywords**: A list of supporting keywords to include naturally.\\r\\n- **section_1**: A list of headings (these are the only section titles to be written). Do **not** add or remove headings. Do **not** rephrase them.\\r\\n\\r\\n---\\r\\n\\r\\n### Output Rules:\\r\\n- Write **in full HTML**, using only `<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<a>`, `<blockquote>`, `<code>`, `<br>`,`<h1>`, `<h2>`, `<h3>`, `<h4>`.\\r\\n- Start the article with a `<p>` tag that **rewrites and enriches the excerpt** into a smooth, informative intro.\\r\\n- Follow the order of `section_1` **exactly** — use each heading **as heading**, no markup, and **do not add new sections**.\\r\\n- Write detailed, clear, and educational content for each section.\\r\\n- Paragraphs should be short (3–5 sentences), concise, and easy to read.\\r\\n- Use bullet points (`<ul><li>`) where it improves clarity or scannability.\\r\\n- Use the **main keyword** naturally and frequently.\\r\\n- Use **related** keywords contextually throughout the article.\\r\\n- Tone should be friendly, knowledgeable, and helpful — suitable for beginners and general readers.\\r\\n- **Length**: Aim for **2,500 to 3,000 words** across all sections.\\r\\n\\r\\n---\\r\\n\\r\\n### Final Output Format:\\r\\n- Output the article in clean HTML.\\r\\n- Begin with a rewritten excerpt inside a `<p>` tag.\\r\\n- Then write each section **with its heading using headings tag**.\\r\\n- Under each heading, use HTML paragraphs and bullet points as needed.\\r\\n- **Do not add FAQs**, extra sections, or any headings not in the list.\\r\\nwith no wrapper, title, FAQ, or extra punctuation or markdown.\\n​"
                },
                {
                    role: "user",
                    content: `- title: ${metaData.title} (not to be included in the output)\\n- excerpt: ${metaData.excerpt}\\n - related_keywords: ${relatedKeywordsString}`
                }
            ];

            const section1Result = await executeModule('Section 1 Generator', section1GeneratorMessages, MODEL_FALLBACKS[0], { maxTokens: 4000 });
            console.log(`✅ Section 1 Generator completed, content length: ${section1Result.length} characters`);

            // Section 2 Generator
            const section2GeneratorMessages = [
                {
                    role: "system",
                    content: "You are a professional SEO copywriter trained to create high-performing, keyword-optimized content for websites. Your task is to generate the second section of content based on the given main keyword, headings, and related keywords.\\n\\n### Your goals:\\n- Create engaging, informative content that ranks well in search\\n- Maximize relevance for both search engines and users\\n- Follow SEO best practices without keyword stuffing\\n\\n### Content Requirements:\\n\\n1. **Section Content**\\n   - Generate content for each heading in section_2\\n   - Each heading should have 2-3 paragraphs of detailed content\\n   - Content should be informative, engaging, and valuable to readers\\n   - Use natural language that flows well\\n   - Include relevant examples, tips, and actionable advice\\n\\n2. **SEO Optimization**\\n   - Naturally incorporate the main keyword and related keywords\\n   - Use proper heading structure (H2 for main headings)\\n   - Write content that answers user search intent\\n   - Ensure content is comprehensive and thorough\\n\\n3. **Content Quality**\\n   - Provide real value to readers\\n   - Use clear, concise language\\n   - Include practical examples and use cases\\n   - Make content scannable with good paragraph breaks\\n\\n### Output Format:\\nReturn the complete section content as HTML with proper H2 headings and paragraphs. Do not include the main title or any other sections.\\n\\n### Example Structure:\\n```html\\n<h2>Heading 1</h2>\\n<p>Detailed content for heading 1...</p>\\n<p>More content with examples...</p>\\n\\n<h2>Heading 2</h2>\\n<p>Detailed content for heading 2...</p>\\n<p>More content with tips...</p>\\n```\\n\\nReturn only the HTML content, no markdown or additional formatting."
                },
                {
                    role: "user",
                    content: `Main Keyword: "${sanitizedMainKeyword}"\\n\\nSection 2 Headings:\\n${metaData.headings?.section_2?.map((h, i) => `${i + 1}. ${h}`).join('\\n') || 'No section 2 headings'}\\n\\nRelated Keywords: ${relatedKeywordsString}\\n\\nGenerate detailed content for each heading in section 2.`
                }
            ];

            const section2Result = await executeModule('Section 2 Generator', section2GeneratorMessages, MODEL_FALLBACKS[0], { maxTokens: 4000 });
            console.log(`✅ Section 2 Generator completed, content length: ${section2Result.length} characters`);

            // FAQ Generator
            const faqGeneratorMessages = [
                {
                    role: "system",
                    content: "You are a professional SEO copywriter trained to create high-performing FAQ content for websites. Your task is to generate FAQ questions and answers based on the given main keyword and related keywords.\\n\\n### Your goals:\\n- Create relevant, informative FAQ content that improves search rankings\\n- Address common user questions and concerns\\n- Provide valuable information that helps users\\n\\n### Content Requirements:\\n\\n1. **FAQ Questions**\\n   - Generate 5-8 relevant questions based on the main keyword\\n   - Questions should address common user concerns and search intent\\n   - Use natural, conversational language\\n   - Focus on practical, helpful questions\\n\\n2. **FAQ Answers**\\n   - Provide comprehensive, informative answers\\n   - Each answer should be 2-3 sentences minimum\\n   - Include practical tips and actionable advice\\n   - Use clear, easy-to-understand language\\n\\n3. **SEO Optimization**\\n   - Naturally incorporate the main keyword and related keywords\\n   - Structure content for featured snippets\\n   - Ensure answers are comprehensive and helpful\\n\\n### Output Format:\\nReturn the FAQ content as HTML with proper structure. Use the exact format shown below:\\n\\n```html\\n<h2>Frequently Asked Questions</h2>\\n\\n<h3>Question 1?</h3>\\n<p>Answer 1 with detailed information and practical tips...</p>\\n\\n<h3>Question 2?</h3>\\n<p>Answer 2 with comprehensive explanation...</p>\\n\\n<h3>Question 3?</h3>\\n<p>Answer 3 with helpful advice...</p>\\n```\\n\\nReturn only the HTML content, no markdown or additional formatting."
                },
                {
                    role: "user",
                    content: `Main Keyword: "${sanitizedMainKeyword}"\\n\\nRelated Keywords: ${relatedKeywordsString}\\n\\nGenerate 5-8 relevant FAQ questions and answers based on the main keyword and related keywords.`
                }
            ];

            const faqResult = await executeModule('FAQ Generator', faqGeneratorMessages, MODEL_FALLBACKS[0], { maxTokens: 2000 });
            console.log(`✅ FAQ Generator completed, FAQ length: ${faqResult.length} characters`);

            return { section1Result, section2Result, faqResult };
        })();

        // Execute both branches in parallel
        const [resA, resB] = await Promise.all([branchA, branchB]);

        // 3. Images (if requested)
        let imagePlacement = [];
        let featureImageUrls = [];
        if (generateImage) {
            // Generating images
            const currentKey = keyManager.getKey(); // Try to get a key for images
            const imgParams = await generateImagePrompts(sanitizedMainKeyword, metaData.title, metaData.headings, sanitizedImageCount, imagePrompt, imageWidth, imageHeight, currentKey.key, MODEL_FALLBACKS[0]);

            // Construct Pollinations URLs
            featureImageUrls = imgParams.prompts.map((p, i) => {
                const encoded = encodeURIComponent(p);
                return `https://image.pollinations.ai/prompt/${encoded}?width=${imageWidth}&height=${imageHeight}&nologo=true`;
            });

            // Placement Strategy
            featureImageUrls.forEach((url, i) => {
                imagePlacement.push({
                    type: i === 0 ? 'featured' : 'content',
                    url,
                    position: i * 2 // generic spacing
                });
            });
        }

        // Assemble
        const completeArticle = formatCompleteArticle(
            metaData.title,
            metaData.excerpt,
            resA.validatedToolResult || resA.toolResult,
            resA.guideResult,
            resB.section1Result,
            resB.section2Result,
            resB.faqResult,
            imagePlacement,
            metaData
        );

        // Response
        res.json({
            status: 'completed',
            request_id: requestId,
            main_keyword: sanitizedMainKeyword,
            title: metaData.title,
            excerpt: metaData.excerpt,
            complete_article: completeArticle,
            article_body: (resB.section1Result || '') + (resB.section2Result || ''),
            tool_code: resA.validatedToolResult || resA.toolResult,
            guide: resA.guideResult,
            api_keys_used: apiKeys.length
        });

    } catch (err) {
        console.error('Generation Error:', err);
        res.status(500).json({ error: 'Generation Failed', details: err.message });
    }
});

// Start Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Node Server running on port ${port}`);
    console.log(`🔑 Static Token Mode: Active`);
});
