//No supabase dependency
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
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-r1-distill-llama-70b:free',
  'deepseek/deepseek-chat-v3:free',
  'google/gemini-2.0-flash-exp:free'
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
    if (error.message.includes('Rate limited') || error.message.includes('Insufficient credits') || error.message.includes('Invalid API key')) {
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
      getKey: function () {
        // Find first active key
        const active = this.keys.find(k => k.status === 'active');
        if (!active) throw new Error('All provided API keys are rate limited or failed.');
        return active;
      },
      markFailed: function (keyStr, reason) {
        const k = this.keys.find(x => x.key === keyStr);
        if (k) {
          console.log(`⚠️ Key ${keyStr.substr(0, 10)}... marked as failed: ${reason}`);
          k.status = 'failed';
        }
      }
    };

    // Execute Module with Retry/Rotation
    const executeModule = async (moduleName, messages, model, options = {}) => {
      let lastError;

      // Try looping until we succeed or run out of keys
      while (true) {
        let currentKeyObj;
        try {
          currentKeyObj = keyManager.getKey();
        } catch (e) {
          // No keys left
          throw lastError || e;
        }

        try {
          console.log(`🚀 Executing ${moduleName} with key ending in ...${currentKeyObj.key.slice(-4)}`);
          const result = await callOpenRouterAPI(messages, model, currentKeyObj.key, 0, options);
          return result;
        } catch (error) {
          lastError = error;
          // If rate limited or invalid, mark and loop
          if (error.message.includes('Rate limited') || error.message.includes('Insufficient credits') || error.message.includes('Invalid API key')) {
            keyManager.markFailed(currentKeyObj.key, error.message);
            continue; // Try next key
          }
          // If other error (like timeout or internal server error from provider that isn't auth related), maybe retrying same key is pointless if it's the model, but for now we mark failed to be safe or rethrow?
          // Let's mark failed to try another key if possible.
          keyManager.markFailed(currentKeyObj.key, error.message);
        }
      }
    };

    // Sanitization (keeping simple)
    const sanitizedMainKeyword = String(mainKeyword).trim();
    const sanitizedRelatedKeywords = Array.isArray(relatedKeywords) ? relatedKeywords : String(relatedKeywords || '').split(',').filter(Boolean);
    const sanitizedImageCount = Math.min(Math.max(1, Number(imageCount) || 1), 5);

    // --- Steps ---

    // 1. Meta & TOC
    console.log(`Step 1: Meta & TOC for "${sanitizedMainKeyword}"`);
    const metaMessages = [
      { role: "system", content: "You are an expert SEO copywriter. Return ONLY a valid JSON object with: { \"title\": \"...\", \"excerpt\": \"...\", \"headings\": { \"section_1\": [], \"section_2\": [] }, \"faq\": [] }." },
      { role: "user", content: `Main keyword: ${sanitizedMainKeyword}. Top 10 articles: ${top10Articles || 'None'}. Related: ${sanitizedRelatedKeywords.join(',')}.` }
    ];

    let metaResult = await executeModule('MetaGenerator', metaMessages, MODEL_FALLBACKS[0]);
    let metaData = safeParseJSON(metaResult);

    if (!metaData || !metaData.headings) {
      // Fallback simple structure if JSON fails
      metaData = {
        title: `${sanitizedMainKeyword} Guide`,
        excerpt: `Learn everything about ${sanitizedMainKeyword}.`,
        headings: { section_1: [`What is ${sanitizedMainKeyword}`], section_2: [`Tips for ${sanitizedMainKeyword}`] },
        faq: [`What is ${sanitizedMainKeyword}?`]
      };
    }

    // 2. Parallel Generation (Tool, Guide, Content)
    // We run them in sequence or parallel. Parallel is faster but consumes keys concurrently.
    // Given the "key rotation" requirement, sequential might be safer to ensure we don't hit rate limits on the SAME key if they only provided one.
    // But let's try parallel branches as before, but the `executeModule` locks might need to be smart? 
    // Actually, `executeModule` is async. If we run parallel, they might all pick the SAME key at the start, and all fail together.
    // To implement robust rotation, improved logic would be needed. For now, let's keep the parallel structure but be aware.

    const branchA = createTool ? async () => {
      const toolMsg = [{ role: 'system', content: 'Create a responsive HTML/JS calculator tool in a single block.' }, { role: 'user', content: `Tool for: ${sanitizedMainKeyword}` }];
      const tool = await executeModule('ToolGen', toolMsg, MODEL_FALLBACKS[1]); // Use coding model

      const guideMsg = [{ role: 'system', content: 'Write a user guide for the tool.' }, { role: 'user', content: `Keyword: ${sanitizedMainKeyword}` }];
      const guide = await executeModule('GuideGen', guideMsg, MODEL_FALLBACKS[0]);
      return { tool, guide };
    } : async () => ({ tool: '', guide: '' });

    const branchB = async () => {
      const s1Msg = [{ role: 'system', content: 'Write article section 1 HTML.' }, { role: 'user', content: `Headings: ${metaData.headings.section_1.join(', ')}` }];
      const s1 = await executeModule('Section1', s1Msg, MODEL_FALLBACKS[0]);

      const s2Msg = [{ role: 'system', content: 'Write article section 2 HTML.' }, { role: 'user', content: `Headings: ${metaData.headings.section_2.join(', ')}` }];
      const s2 = await executeModule('Section2', s2Msg, MODEL_FALLBACKS[0]);

      const faqMsg = [{ role: 'system', content: 'Write FAQ HTML.' }, { role: 'user', content: `Keywords: ${sanitizedMainKeyword}` }];
      const faq = await executeModule('FAQ', faqMsg, MODEL_FALLBACKS[0]);

      return { s1, s2, faq };
    };

    const [resA, resB] = await Promise.all([branchA(), branchB()]);

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
      resA.tool,
      resA.guide,
      resB.s1,
      resB.s2,
      resB.faq,
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
      tool_code: resA.tool,
      guide: resA.guide,
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
