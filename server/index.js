import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { v4 as uuidv4 } from 'uuid';

// Initialize Express app
const app = express();
app.use(helmet());

// Configure CORS for production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow Netlify domains
    if (origin.includes('netlify.app')) {
      return callback(null, true);
    }
    
    // Allow your custom domain (replace with your actual domain)
    if (origin.includes('your-domain.com')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Initialize Supabase (prefer Service Role key on the server)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key if available to allow secure server-side inserts/updates under RLS
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
);

// Simple auth via webhook token (Bearer <token>)
export const authMiddleware = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing token' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('webhook_token', token)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }

    req.user = { id: user.id };
    next();
  } catch (err) {
    next(err);
  }
};

// Rate limiting
const rateLimiter = new RateLimiterMemory({ points: 60, duration: 60 }); // 60 req/min
export const rateLimitMiddleware = async (req, res, next) => {
  try {
    const key = req.user?.id || req.ip;
    await rateLimiter.consume(key);
    next();
  } catch {
    res.status(429).json({ error: 'Too Many Requests', message: 'Rate limit exceeded' });
  }
};

// Ensure server listens when run directly
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// OpenRouter configuration
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || 'https://your-app.com';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || 'Article Generator';

// Function to call OpenRouter API with smart key rotation
async function callOpenRouterAPI(messages, model, apiKey, retryCount = 0, options = {}) {
  const { timeoutMs = 45000, maxTokens = 4000 } = options;
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
        temperature: 1,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenRouter API error:`, errorText);
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      } else if (response.status === 429) {
        throw new Error('Rate limited - please try again later');
      } else if (response.status === 402) {
        throw new Error('Insufficient credits');
      } else {
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();
    console.log(`✅ OpenRouter API call successful`);
    
    // Sanitize the response content to prevent control character issues
    let content = data.choices[0].message.content;
    if (content) {
      content = content
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\r/g, '\n') // Normalize line endings
        .replace(/\t/g, ' ') // Replace tabs with spaces
        .trim(); // Remove leading/trailing whitespace
    }
    
    return content;

  } catch (error) {
    console.error(`❌ Error with OpenRouter API:`, error.message);
    
    if (retryCount < maxRetries) {
      console.log(`🔄 Retrying OpenRouter API call (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
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
    if (!jsonString || typeof jsonString !== 'string') {
      console.error('❌ Invalid JSON string input:', typeof jsonString);
      return null;
    }

    // Clean the string of any potential control characters and problematic sequences
    let cleanedString = jsonString
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n') // Normalize line endings
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/\f/g, ' ') // Replace form feeds with spaces
      .replace(/\v/g, ' ') // Replace vertical tabs with spaces
      .trim(); // Remove leading/trailing whitespace

    // Try to extract JSON if it's wrapped in markdown or other formatting
    const jsonMatch = cleanedString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedString = jsonMatch[0];
    }

    // Additional safety check for common JSON issues
    if (!cleanedString.startsWith('{') || !cleanedString.endsWith('}')) {
      console.error('❌ JSON string doesn\'t start/end with braces:', cleanedString.substring(0, 100));
      return null;
    }

    const parsed = JSON.parse(cleanedString);
    console.log('✅ JSON parsed successfully');
    return parsed;
  } catch (error) {
    console.error('❌ JSON parsing error:', error.message);
    console.error('❌ JSON string (first 200 chars):', jsonString.substring(0, 200));
    console.error('❌ JSON string (last 200 chars):', jsonString.substring(Math.max(0, jsonString.length - 200)));
    return null;
  }
}

// Main article generation workflow endpoint
app.post('/api/generate-article', rateLimitMiddleware, authMiddleware, async (req, res) => {
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
      models = {
        metaGenerator: 'deepseek/deepseek-chat-v3-0324:free',
        toolGenerator: 'qwen/qwen-2.5-coder-32b-instruct:free',
        toolValidator: 'qwen/qwen-2.5-coder-32b-instruct:free',
        guideGenerator: 'deepseek/deepseek-chat-v3-0324:free',
        section1Generator: 'deepseek/deepseek-chat-v3-0324:free',
        section1Summary: 'deepseek/deepseek-chat-v3-0324:free',
        section2Generator: 'deepseek/deepseek-chat-v3-0324:free',
        faqGenerator: 'deepseek/deepseek-chat-v3-0324:free'
      }
    } = req.body;
    
    if (!mainKeyword || !top10Articles || !relatedKeywords) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'mainKeyword, top10Articles, and relatedKeywords are required' 
      });
    }

    // Sanitize inputs to prevent JSON injection and control character issues
    const sanitizedMainKeyword = String(mainKeyword).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    const sanitizedTop10Articles = String(top10Articles).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    const sanitizedRelatedKeywords = String(relatedKeywords).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    const sanitizedGuidelines = guidelines ? String(guidelines).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() : '';
    const sanitizedGenerateImage = Boolean(generateImage);
    const sanitizedImagePrompt = imagePrompt ? String(imagePrompt).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() : '';
    const widthNum = Number.isFinite(Number(imageWidth)) ? Number(imageWidth) : 1200;
    const heightNum = Number.isFinite(Number(imageHeight)) ? Number(imageHeight) : 630;
    const finalImageWidth = widthNum > 0 ? widthNum : 1200;
    const finalImageHeight = heightNum > 0 ? heightNum : 630;

    // Log the request
    await supabase.from('analysis_logs').insert({
      user_id: req.user.id,
      request_id: requestId,
      keywords: [sanitizedMainKeyword], // Reusing keywords field for main keyword
      status: 'pending'
    });

    // Get user's OpenRouter API keys with smart recovery
    console.log(`🔍 Looking for API keys for user: ${req.user.id}`);
    
    // Smart recovery: Test failed keys before reactivating (10-hour recovery)
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    
    // Get failed keys that are older than 10 hours
    const { data: failedKeys } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .eq('status', 'failed')
      .lt('last_failed', tenHoursAgo);
    
    // Test each failed key before reactivating
    if (failedKeys && failedKeys.length > 0) {
      console.log(`🔄 Testing ${failedKeys.length} failed keys for recovery...`);
      
      for (const key of failedKeys) {
        try {
          // Test the key with a simple API call
          const testResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key.api_key}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': OPENROUTER_REFERER,
              'X-Title': OPENROUTER_TITLE
            },
            body: JSON.stringify({
              model: 'deepseek/deepseek-chat-v3-0324:free',
              messages: [{ role: 'user', content: 'Test' }],
              max_tokens: 10
            })
          });
          
          if (testResponse.ok) {
            // Key is working - reactivate it
            await supabase
              .from('api_keys')
              .update({ 
                status: 'active', 
                failure_count: 0,
                last_used: new Date().toISOString()
              })
              .eq('id', key.id);
            console.log(`✅ Reactivated key: ${key.key_name}`);
          } else {
            // Key is still broken - keep it failed
            console.log(`❌ Key still broken: ${key.key_name} (${testResponse.status})`);
          }
        } catch (error) {
          // Key test failed - keep it failed
          console.log(`❌ Key test failed: ${key.key_name} (${error.message})`);
        }
      }
    }
    
    // Get available keys (active + rate_limited)
    let { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .in('status', ['active', 'rate_limited']);

    console.log(`🔍 API keys query result:`, { apiKeys, keysError });

    if (keysError) {
      console.error('❌ Error fetching API keys:', keysError);
      await supabase.from('analysis_logs').update({
        status: 'failed',
        error_message: `Database error: ${keysError.message}`,
        processing_time: Date.now() - startTime
      }).eq('request_id', requestId);

      return res.status(500).json({ 
        error: 'Database error', 
        message: 'Failed to fetch API keys' 
      });
    }

    if (!apiKeys || apiKeys.length === 0) {
      console.log(`❌ No API keys found for user ${req.user.id}`);
      
      // Let's also check what keys exist for this user (for debugging)
      const { data: allUserKeys } = await supabase
        .from('api_keys')
        .select('id, provider, status, user_id')
        .eq('user_id', req.user.id);
      
      console.log(`🔍 All keys for user ${req.user.id}:`, allUserKeys);
      
      await supabase.from('analysis_logs').update({
        status: 'failed',
        error_message: 'No OpenRouter API keys available',
        processing_time: Date.now() - startTime
      }).eq('request_id', requestId);

      return res.status(400).json({ 
        error: 'No API keys', 
        message: 'Please add at least one OpenRouter API key' 
      });
    }

    console.log(`🔑 Found ${apiKeys.length} OpenRouter API keys for user ${req.user.id}`);

    const results = {};
    const usedKeys = [];

    // Branch-aware API key rotation
    const totalKeys = apiKeys.length;
    const branchIndices = {
      META: 0,
      A: totalKeys >= 2 ? 1 % totalKeys : 0,
      B: totalKeys >= 3 ? 2 % totalKeys : (totalKeys >= 2 ? 1 : 0),
      FAQ: totalKeys >= 4 ? 3 % totalKeys : (totalKeys >= 3 ? 2 : (totalKeys >= 2 ? 1 : 0)),
    };

    const getNextApiKeyForBranch = (branch) => {
      const index = branchIndices[branch] % totalKeys;
      branchIndices[branch] = (branchIndices[branch] + 1) % totalKeys;
      return apiKeys[index];
    };

    // Helper function to execute module with branch-aware key rotation
    const executeModule = async (moduleName, messages, model, branch, options = {}) => {
      let success = false;
      let attempts = 0;
      const maxAttempts = Math.min(3, apiKeys.length);

      while (!success && attempts < maxAttempts) {
        const currentKey = getNextApiKeyForBranch(branch);
        
        try {
          console.log(`🔄 Executing ${moduleName} with API key: ${currentKey.key_name} (Branch: ${branch})`);
          
          const result = await callOpenRouterAPI(messages, model, currentKey.api_key, 0, options);
          
          // Update key usage
          await supabase.from('api_keys').update({
            last_used: new Date().toISOString(),
            failure_count: 0,
            status: 'active'
          }).eq('id', currentKey.id);

          usedKeys.push(currentKey.id);
          success = true;
          console.log(`✅ ${moduleName} completed successfully`);
          
          return result;
          
        } catch (error) {
          console.error(`❌ Error in ${moduleName} with API key ${currentKey.key_name}:`, error.message);
          
          // Check if it's a rate limit, credit issue, or invalid key
          const isRateLimit = error.message.includes('rate') || error.message.includes('credit') || error.message.includes('429') || error.message.includes('402');
          const isInvalidKey = error.message.includes('Invalid API key') || error.message.includes('401');
          const isNetworkError = error.message.includes('network') || error.message.includes('timeout') || error.message.includes('fetch');
          
          // Never permanently block keys - all keys can recover after 10 hours
          if (isRateLimit) {
            await supabase.from('api_keys').update({
              status: 'rate_limited',
              last_failed: new Date().toISOString(),
              failure_count: currentKey.failure_count + 1
            }).eq('id', currentKey.id);
            console.log(`⚠️ Marked API key as rate limited: ${currentKey.key_name}`);
          } else {
            // For all other errors (including invalid keys), mark as failed but allow recovery after 10 hours
            await supabase.from('api_keys').update({
              status: 'failed',
              last_failed: new Date().toISOString(),
              failure_count: currentKey.failure_count + 1
            }).eq('id', currentKey.id);
            console.log(`⚠️ Marked API key as failed (will recover after 10 hours): ${currentKey.key_name} (${currentKey.failure_count + 1} failures)`);
          }

          attempts++;
        }
      }

      if (!success) {
        throw new Error(`All API keys failed for ${moduleName}`);
      }
    };

    // Step 1: Meta & Toc Generator
    console.log(`🚀 Starting Meta & Toc Generator for keyword: ${sanitizedMainKeyword}`);
    const metaGeneratorMessages = [
      {
        role: "system",
        content: "You are an expert SEO copywriter trained to create high-performing, keyword-optimized content for websites. Your task is to analyze the given main keyword, top 10 competing articles, and related keywords — then return an SEO-optimized **title** and **excerpt** (meta description) that will improve click-through rate (CTR), topical relevance, and keyword targeting.\n\n### Your goals:\n- Outperform the top 10 competitors in search\n- Maximize relevance for both search engines and users\n- Match Google's SERP formatting best practices\n\n### Strongly Follow These Rules:\n\n1. **SEO Title**\n   - Must include the main keyword, preferably at the beginning\n   - Strictly limited to **less than 60 characters**\n   - Must be compelling and CTR-optimized\n   - Use **Title Case** (Capitalize Major Words)\n   - Should include a unique differentiator (like 'Free', 'Best', 'Instant', etc.)\n   - Avoid clickbait, vague terms, or filler words\n\n2. **SEO Meta Description / Excerpt**\n   - Strictly between **150 and 160 characters**\n   - Must clearly explain what the user will get\n   - Must include the **main keyword** and **1–2 related keywords** naturally\n   - Focus on clarity, value, and high-CTR language\n   - Use an informative and benefit-driven tone (no hype or fluff)\n\n3. **Do not** include filler words, generic content, or overly promotional language\n\n---\n\n### Semantic Keyword Rules (Append This Part to Enhance Topical Authority):\n\n4. **Semantic Keyword Identification**\n- These are the main topics your content should include when you're optimizing for the keyword\n   \n \n     - 'supportive': Related contextual terms, synonyms, LSI/NLP matches\n\n\n---\n\n### Headings Instructions (Append for Content Expansion and Structuring):\n\n5. **Structured H2 Headings Generation**\n   - Generate **10 to 14 unique, non-overlapping H2 headings**\n   - Divide them into **two clearly labeled sections**:\n     - `section_1`: Core Informational Topics (definitions, how-tos, key guides)\n     - `section_2`: Supporting & Secondary Topics (tips, examples,  context) (dont include faq and conclusion heading ever in any of section)\n   - All headings must be:\n     - Relevant to the main keyword and semantic context\n     - Clear, value-driven, and highly specific\n     - SEO-optimized and free from duplicate phrasing\n     - Avoid keyword stuffing or vague generalities\n   - **Strictly do not add any heading in the form of** `What is [main keyword]` **or** `How to Use [main keyword]` **as these will be covered in the main guide section of the tool**\n\n---\n\n### FAQ Generation Instructions (Append This to the End):\n\n6. **Generate 5–8 Unique FAQs**\n   - FAQs must **not** repeat or duplicate any headings or content from section\_1 or section\_2\n   - Use natural language and target common questions related to the main keyword\n   - Output only the **questions**, no formatting or wrapping\n   - Keep questions helpful, concise, and unique\n\n---\n\n### Final Output Format:\n\nReturn a valid JSON object with these exact fields:\n- title: SEO-optimized title (less than 60 characters)\n- excerpt: SEO-optimized meta description (150-160 characters)\n- semantic_keywords: object with informational, transactional_optional, and supportive arrays\n- headings: object with section_1 and section_2 arrays containing H2 headings\n- faq: array of 5-8 FAQ questions\n\nExample structure:\n{\n  'title': 'SEO-Optimized Title Here',\n  'excerpt': 'SEO-optimized meta description here between 150 and 160 characters.',\n  'semantic_keywords': {\n    'informational': ['term1', 'term2'],\n    'transactional_optional': ['term3', 'term4'],\n    'supportive': ['term5', 'term6']\n  },\n  'headings': {\n    'section_1': ['Heading 1', 'Heading 2', 'Heading 3'],\n    'section_2': ['Heading 4', 'Heading 5', 'Heading 6']\n  },\n  'faq': ['Question 1?', 'Question 2?', 'Question 3?', 'Question 4?', 'Question 5?']\n}"
      },
      {
        role: "user",
        content: `Here is our main keyword \n"${sanitizedMainKeyword}"\n\n\nTop 10 ranking  articles\n${sanitizedTop10Articles}\n\n\nRelated Keywords\n${sanitizedRelatedKeywords}\n\n`
      },
      {
        role: "system",
        content: "You give output in valid json just just inside {}\n\ndo not append like ```json\ndo not give invalid json\nall things should only inside {}\nnot even dot or comma outside{}"
      }
    ];

    const metaResult = await executeModule('Meta & Toc Generator', metaGeneratorMessages, models.metaGenerator, 'META', { maxTokens: 3000 });
    const metaData = safeParseJSON(metaResult);
    
    if (!metaData) {
      console.error('❌ Meta & Toc Generator returned invalid JSON:', metaResult);
      throw new Error('Failed to parse Meta & Toc Generator result - invalid JSON format');
    }
    
    // Validate required fields
    if (!metaData.title || !metaData.excerpt || !metaData.headings) {
      console.error('❌ Meta & Toc Generator missing required fields:', metaData);
      throw new Error('Meta & Toc Generator result missing required fields (title, excerpt, headings)');
    }
    
    results.meta_toc_result = metaData;
    console.log(`✅ Meta & Toc Generator completed:`, {
      title: metaData.title,
      excerpt_length: metaData.excerpt?.length,
      headings_count: (metaData.headings?.section_1?.length || 0) + (metaData.headings?.section_2?.length || 0),
      faq_count: metaData.faq?.length || 0
    });

    // Optional: Feature image prompt generation and URL (synchronous)
    let featureImagePrompt = '';
    let featureImageUrl = '';
    if (sanitizedGenerateImage) {
      try {
        if (sanitizedImagePrompt) {
          featureImagePrompt = sanitizedImagePrompt;
        } else {
          const imagePromptMessages = [
            {
              role: 'system',
              content: "You are an expert visual prompt engineer for AI image models. Create ONE single-line, highly detailed prompt for a blog hero feature image for the given article. Requirements: modern, clean, web-ready, high-contrast, brand-safe; centered subject with copy-safe negative space; balanced lighting; aspect ratio 1200x630; UHD quality; include scene, subject, mood, lighting, color palette, camera/lens, post-processing. Avoid any text, watermarks, or logos. Return only the prompt, no quotes, no extra text."
            },
            {
              role: 'user',
              content: JSON.stringify({
                main_keyword: sanitizedMainKeyword,
                title: metaData.title,
                excerpt: metaData.excerpt,
                section_1_headings: metaData.headings?.section_1 || [],
                section_2_headings: metaData.headings?.section_2 || []
              })
            }
          ];
          const generated = await executeModule('Feature Image Prompt', imagePromptMessages, models.metaGenerator, 'META', { maxTokens: 300 });
          featureImagePrompt = (generated || '').trim();
        }
        const encoded = encodeURIComponent(featureImagePrompt);
        featureImageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${finalImageWidth}&height=${finalImageHeight}&nologo=true`;
        console.log('🖼️ Feature image prepared');
      } catch (e) {
        console.log('⚠️ Feature image prompt generation failed:', e?.message);
      }
    }

    // Branch A: Tool -> Validator -> Guide
    const branchA = (async () => {
      console.log(`🚀 Starting Branch A: Tool -> Validator -> Guide`);
      
      // Tool Generator
      const toolGeneratorMessages = [
        {
          role: "system",
          content: "You are a professional HTML + JavaScript tool generator trained to produce tools that **work perfectly inside WordPress** and **always show the correct output after clicking the button**.\n\n# PURPOSE:\nYour job is to generate **ready-to-paste HTML tools** (with inline CSS and JS) that:\n- Visually display inside WordPress posts/pages\n- Are fully responsive and mobile-friendly\n- Show output **only after clicking a button**\n- Always produce **correct and validated output** without errors\n- DO NOT break Gutenberg or Classic Editor rendering\n\n---\n\n## ✅ STRUCTURE RULES (WordPress-Safe):\n\n1. All HTML must be wrapped in **one parent**:\n   `<div class=\"tool-wrapper\">…</div>`\n\n2. Add a `<style>` block **inside or after** the `.tool-wrapper`  \r\n   (Inline only — never linked, never external.)\n\n3. Add a `<script type=\"text/javascript\">` block **after the wrapper**, never inside it.\n\n4. DO NOT include any of the following:\n   - `<html>`, `<head>`, `<body>`\n   - `<script src>` or external JS libraries\n   - Markdown formatting (no backticks or triple-quotes)\n   - Comments, explanations, or non-code text\n\n---\n\n## ✅ JAVASCRIPT RULES:\n\n- Wrap all JS inside:\n  `document.addEventListener(\"DOMContentLoaded\", function () { … });`\n\n- Use `getElementById()` for inputs\n- Use `parseFloat()` and **validate all inputs rigorously to avoid `NaN` or incorrect calculations**\n- Output must appear in a styled box using `<div id=\"result\">` or `.result-container`\n- Handle errors gracefully (e.g., show clear error messages if input is invalid or missing)\n- NO `onclick=\"\"` — always use `addEventListener()`\n- **Force correctness: calculations must be accurate and reflect expected results precisely**\n- Ensure **output updates only after clicking the button**\n- Prevent empty or broken output states in all cases\n\n---\n\n## ✅ DESIGN STANDARDS (Visual Quality):\n\n- Responsive layout (mobile & desktop)\n- Use clean fonts, padding, spacing, borders\n- Inputs should be user-friendly (large, styled)\n- Buttons must be modern (rounded, hover effect)\n- Result must show clearly after calculation (in a box with padding)\n- Use soft shadows, border-radius, subtle animations if needed\n\n---\n\n## ✅ OUTPUT FORMAT:\n\nYour output must be a **single code block** containing:\n- ✅ HTML structure\n- ✅ `<style>` with all CSS\n- ✅ `<script>` with JavaScript logic\n\nNO:\n- Markdown syntax\n- Comments\n- Descriptions\n- External links or resources\n\n✅ YES:\n- Clean UI\n- Reliable logic with **correct output guaranteed**\n- Fully WordPress-compatible display\n- Accurate result shown only on button click\n\n---\n\n## ✅ CRITICAL RULES:\n\n✔️ Must work in:\n- Gutenberg (Custom HTML block)\n- Classic Editor (\"Text\" mode)\n- Make.com automations\n\n❌ Must NOT require:\n- jQuery\n- React, Vue, or external frameworks\n- External CSS or JS files\n\n---\n\n## ✅ VISUAL + FUNCTIONAL GOAL:\n\nThe tool must:\n- Look clean and modern\n- Be intuitive and mobile-friendly\n- Show calculated result only after clicking the button\n- Never appear broken, empty, or produce wrong output in WordPress post preview\n\n---\n\n## ✅ SAMPLE OUTPUT STRUCTURE (FOR TRAINING)\n\n<div class=\"tool-wrapper\">\r\n  <h2>Sample Tool</h2>\r\n  <input type=\"number\" id=\"value1\" placeholder=\"Enter first value\">\r\n  <input type=\"number\" id=\"value2\" placeholder=\"Enter second value\">\r\n  <button id=\"calcBtn\">Calculate</button>\r\n  <div class=\"result-container\" id=\"result\"></div>\r\n</div>\r\n<style>\r\n  .tool-wrapper {\r\n    max-width: 500px;\r\n    margin: 40px auto;\r\n    padding: 20px;\r\n    background: #f9f9f9;\r\n    border-radius: 12px;\r\n    box-shadow: 0 4px 10px rgba(0,0,0,0.1);\r\n    font-family: Arial, sans-serif;\r\n  }\r\n  .tool-wrapper input {\r\n    width: 100%;\r\n    padding: 10px;\r\n    margin-bottom: 12px;\r\n    font-size: 16px;\r\n    border: 1px solid #ccc;\r\n    border-radius: 6px;\r\n  }\r\n  .tool-wrapper button {\r\n    width: 100%;\r\n    padding: 12px;\r\n    background: #007bff;\r\n    color: #fff;\r\n    border: none;\r\n    border-radius: 6px;\r\n    font-size: 16px;\r\n    cursor: pointer;\r\n    transition: background 0.3s;\r\n  }\r\n  .tool-wrapper button:hover {\r\n    background: #0056b3;\r\n  }\r\n  .result-container {\r\n    margin-top: 20px;\r\n    padding: 15px;\r\n    background: #e9ecef;\r\n    border-radius: 6px;\r\n    text-align: center;\r\n    font-size: 18px;\r\n    font-weight: bold;\r\n    color: #333;\r\n  }\r\n</style>\r\n<script type=\"text/javascript\">\r\n  document.addEventListener(\"DOMContentLoaded\", function () {\r\n    document.getElementById(\"calcBtn\").addEventListener(\"click\", function () {\r\n      const val1 = parseFloat(document.getElementById(\"value1\").value);\r\n      const val2 = parseFloat(document.getElementById(\"value2\").value);\r\n      const resultBox = document.getElementById(\"result\");\r\n\r\n      if (isNaN(val1) || isNaN(val2)) {\r\n        resultBox.textContent = \"Please enter valid numbers.\";\r\n      } else {\r\n        const total = val1 + val2;\r\n        resultBox.textContent = \"Result: \" + total.toFixed(2);\r\n      }\r\n    });\r\n  });\r\n</script>\r\n​"
        },
        {
          role: "system",
          content: `You think about keywords below and then decide what should be in our tool to satisfy user
Related Keywords to our main keyword 
${sanitizedRelatedKeywords}

${metaData.semantic_keywords?.supportive?.join(', ') || ''}
${metaData.semantic_keywords?.informational?.join(', ') || ''}
${metaData.semantic_keywords?.transactional_optional?.join(', ') || ''}`
        },
        {
          role: "user",
          content: `Here is our main keyword on which we have to create tool
"${sanitizedMainKeyword}"

make sure our tool is fully working responsive and hass no error or problem in use for user it should show answer beautifuly

Guidelines : ${sanitizedGuidelines || 'Create a useful, functional tool'}`
        }
      ];

      const toolResult = await executeModule('Tool Generator', toolGeneratorMessages, models.toolGenerator, 'A', { maxTokens: 4000 });
      console.log(`✅ Tool Generator completed, tool length: ${toolResult.length} characters`);

      // Tool Validator
      const toolValidatorMessages = [
        {
          role: "system",
          content: "You are a calculator tool optimizer and validator for WordPress. Your role is to ensure every generated tool:\n\n1. **Works 100% on WordPress** inside a single \"Custom HTML\" block.\n2. **Does NOT return extra explanations or Markdown. Only return raw tool code.**\n3. Tool must include:\n   - Clean HTML (inputs, labels, buttons)\n   - Embedded CSS inside a `<style>` tag\n   - JavaScript inside a `<script>` tag using `document.addEventListener(\"DOMContentLoaded\", ...)`\n   - Output shown in a `.result-container` when \"Calculate\" button is clicked\n4. Code must be:\n   - Compact and functional\n   - Free from formatting issues, broken tags, or smart quotes\n   - Free from `<br />` misuse and accidental line breaks that break WordPress blocks\n   - No external files, no jQuery, no console.log\n   - Correctly using `parseFloat` or `parseInt` to ensure calculations work\n   - Responsive and user-friendly\n   - **Crucially, the tool MUST produce visible, accurate results immediately after clicking \"Calculate\" with no errors or empty output**\n5. DO NOT return anything besides the final raw code block.\n6. The entire tool must be returned as ONE continuous code block with no extra spaces or empty lines that might break WordPress block formatting.\n7. The output must be guaranteed to WORK immediately when pasted into a WordPress \"Custom HTML\" block, showing the calculated result in `.result-container` after clicking the \"Calculate\" button.\n8. If any calculation involves numeric inputs, ensure `parseFloat` or `parseInt` is always used properly before computations.\n9. Example return format:\n\n<div class=\"tool-wrapper\">\r\n  <h2>Tool Title</h2>\r\n  <label for=\"input1\">Label:</label>\r\n  <input type=\"number\" id=\"input1\">\r\n  <button id=\"calculateBtn\">Calculate</button>\r\n  <div id=\"result\" class=\"result-container\"></div>\r\n</div>\r\n<style>\r\n  /* CSS styles here */\r\n</style>\r\n<script>\r\n  document.addEventListener(\"DOMContentLoaded\", function () {\r\n    document.getElementById(\"calculateBtn\").addEventListener(\"click\", function () {\r\n      const input = parseFloat(document.getElementById(\"input1\").value);\r\n      const result = input * 2; // Example logic\r\n      document.getElementById(\"result\").style.display = \"block\";\r\n      document.getElementById(\"result\").innerText = \"Result: \" + result;\r\n    });\r\n  });\r\n</script>\r\n\nDo not break output into multiple blocks. Return only one full code block that can be copy-pasted into WordPress and work immediately.\r\n\r\nPlease, ensure the tool always displays the calculated results visibly and correctly upon clicking \"Calculate\".\n\n\nreturn me just working tool code dont add any heading explanation any faq or anything which is not code tool just make sure all tool code is functional and code work in wordpress greate\n\nmake sure results are shown properly when calculat button is clicked"
        },
        {
          role: "user",
          content: `here is the tool to fix\n${toolResult}`
        }
      ];

      const validatedToolResult = await executeModule('Tool Validator', toolValidatorMessages, models.toolValidator, 'A', { maxTokens: 4000 });
      console.log(`✅ Tool Validator completed, validated tool length: ${validatedToolResult.length} characters`);

      // Guide Generator
      const guideGeneratorMessages = [
        {
          role: "system",
          content: "# 🧠 System Prompt: Generate Detailed HTML Guide for a Tool (SEO + UX Focused)\n\nYou are a professional SEO and UX copywriter who writes helpful, beginner-friendly HTML content for online tools and calculators.\n\nYour task is to generate a single HTML `\"guide\"` block using the information below.\n\n---\n\n## 🔽 Input\n\nYou will be given the following input in JSON format:\n{\n \"mainKeyword\": \"mortgage payoff calculator\",\n  \"toolCode\": \"FULL HTML/JS CODE OF THE TOOL\"\n\"related_keywords\": \"they are related keywords you could use in content if needed for seo\",\n}\n---\n\n## ✅ Output\n\nReturn a single guide object in this exact structure:\n\n<p>...</p><h2>What is Mortgage Payoff Calculator?</h2><p>...</p><h2>How to use Mortgage Payoff Calculator?</h2><p>...</p>\n\n* The entire guide must be valid, semantic HTML.\n* Output must be ready to paste directly into a WordPress post.\n\n---\n\n## 🧩 Structure of Guide\n\n### 1. Intro Paragraph\n\n<p>\r\n  <strong>[mainKeyword]</strong> introduction paragraph (30–50 words). Mention the tool, its purpose, and that a guide follows.\r\n</p>\r\n\r\n\r\n**Requirements**:\r\n\r\n* Bold the **main keyword** using `<strong>` in the **first sentence**.\r\n* Use natural language.\r\n* Mention that this is a brief but complete guide on using the tool.\r\n\r\n---\r\n\r\n### 2. `<h2>What is [Tool Name]?</h2>`\r\n\r\n\r\n<h2>What is Mortgage Payoff Calculator?</h2>\r\n<p>...</p>\r\n\r\n\r\n**Requirements**:\r\n\r\n* Minimum **200 words**.\r\n* Explain in clear, natural, user-friendly language:\r\n\r\n  * What this tool does\r\n  * What problem it solves\r\n  * Who benefits from it\r\n  * Why it's useful in daily or professional life\r\n* Do not include code, APIs, or developer talk.\r\n\r\n---\r\n\r\n### 3. `<h2>How to use [Tool Name]?</h2>`\r\n\r\n\r\n<h2>How to use Mortgage Payoff Calculator?</h2>\r\n<p>...</p>\r\n\r\n\r\n**Requirements**:\r\n\r\n* Minimum **200 words**.\r\n* Write a step-by-step usage guide that includes:\r\n\r\n  * What input fields the user must fill\r\n  * How the button or form works\r\n  * What the user sees as output\r\n  * Any edge cases or tips\r\n* Be friendly and human. Imagine you're helping a non-technical person understand how to use it.\r\n\r\n---\r\n\r\n## 🎯 Style & Content Guidelines\r\n\r\n* **Tone**: Conversational, warm, and helpful — not robotic.\r\n* **Audience**: Write for average internet users — not programmers or devs.\r\n* **Goal**: Help them understand what the tool does and how to use it without confusion.\r\n* **SEO Awareness**:\r\n\r\n  * Use the `mainKeyword` in the **first `<p>`** (bolded).\r\n  * Sprinkle the keyword **naturally** throughout the content (max 3 times total).\r\n\r\n---\r\n\r\n## ✅ Allowed HTML Tags\r\n\r\nUse **only** the following tags in the output:\r\n\r\n\r\n<p>, <ul>, <li>, <a>, <strong>, <em>, <blockquote>, <br>, <h2>\r\n\r\n\r\n---\r\n\r\n## ❌ Forbidden\r\n\r\n* ❌ No `<div>`, `<span>`, `<style>`, `<script>`, `<code>`, or `<iframe>`\r\n* ❌ No inline CSS or JavaScript\r\n* ❌ No images or non-semantic tags\r\n* ❌ No developer jargon or technical terminology (e.g. \"JS\", \"API\", \"DOM\", etc.)\r\n\r\n---\r\n\r\n## 🧪 Sample Output Structure\r\n\r\n<p><strong>Mortgage payoff calculator</strong> helps users...</p><h2>What is Mortgage Payoff Calculator?</h2><p>...</p><h2>How to use Mortgage Payoff Calculator?</h2><p>...</p>\r\n\r\n---\n\noutput should have just html ready toi paste in article\ndont append with ```html or add any thing extra\r\n\r\n## 📌 Personalization Requirement\r\n\r\nUse the provided `\"toolCode\"` to fully understand:\r\n\r\n* What inputs the tool accepts\r\n* What calculations or logic it performs\r\n* What output it shows\r\n* Any unique features (e.g., sliders, currency format, multiple result types)\r\n\r\nThen write the guide with this personalized understanding. Do not guess or generalize.\r\n\r\n---\r\n\r\n\r"
        },
        {
          role: "user",
          content: JSON.stringify({
            mainKeyword: sanitizedMainKeyword,
            toolCode: validatedToolResult,
            related_keywords: sanitizedRelatedKeywords
          })
        }
      ];

      const guideResult = await executeModule('Guide Generator', guideGeneratorMessages, models.guideGenerator, 'A', { maxTokens: 4000 });
      console.log(`✅ Guide Generator completed, guide length: ${guideResult.length} characters`);

      return { toolResult, validatedToolResult, guideResult };
    })();

    // Branch B: Section 1 -> Section 2 (optimized)
    const branchB = (async () => {
      console.log(`🚀 Starting Branch B: Section 1 -> Section 2 (optimized)`);
      
      // Section 1 Generator
      const section1GeneratorMessages = [
        {
          role: "system",
          content: "You are an expert SEO content writer. Your task is to write the full article body using only the exact headings provided in `section_1`. These are the only headings allowed. \r\n\r\n---\r\n\r\n### You Will Receive:\r\n\r\n- **title**: The post title (for internal reference only; not to be included in output).\r\n- **excerpt**: A short introductory paragraph that will be rewritten to start the article.\r\n- **related_keywords**: A list of supporting keywords to include naturally.\r\n- **section_1**: A list of headings (these are the only section titles to be written). Do **not** add or remove headings. Do **not** rephrase them.\r\n\r\n---\r\n\r\n### Output Rules:\r\n- Write **in full HTML**, using only `<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<a>`, `<blockquote>`, `<code>`, `<br>`,`<h1>`, `<h2>`, `<h3>`, `<h4>`.\r\n- Start the article with a `<p>` tag that **rewrites and enriches the excerpt** into a smooth, informative intro.\r\n- Follow the order of `section_1` **exactly** — use each heading **as heading**, no markup, and **do not add new sections**.\r\n- Write detailed, clear, and educational content for each section.\r\n- Paragraphs should be short (3–5 sentences), concise, and easy to read.\r\n- Use bullet points (`<ul><li>`) where it improves clarity or scannability.\r\n- Use the **main keyword** naturally and frequently.\r\n- Use **related** keywords contextually throughout the article.\r\n- Tone should be friendly, knowledgeable, and helpful — suitable for beginners and general readers.\r\n- **Length**: Aim for **2,500 to 3,000 words** across all sections.\r\n\r\n---\r\n\r\n### Final Output Format:\r\n- Output the article in clean HTML.\r\n- Begin with a rewritten excerpt inside a `<p>` tag.\r\n- Then write each section **with its heading using headings tag**.\r\n- Under each heading, use HTML paragraphs and bullet points as needed.\r\n- **Do not add FAQs**, extra sections, or any headings not in the list.\r\nwith no wrapper, title, FAQ, or extra punctuation or markdown.\n​"
        },
        {
          role: "user",
          content: `- title: ${metaData.title} (not to be included in the output)
 - excerpt: ${metaData.excerpt}
 - related_keywords: ${sanitizedRelatedKeywords}`
        }
      ];

      const section1Result = await executeModule('Section 1 Generator', section1GeneratorMessages, models.section1Generator, 'B', { maxTokens: 4000 });
      console.log(`✅ Section 1 Generator completed, content length: ${section1Result.length} characters`);

      // Section 2 Generator (optimized - creates its own transition)
      const section2GeneratorMessages = [
        {
          role: "system",
          content: "You are an expert SEO content writer and HTML formatter. Your role is to generate the **second half** of a long-form, SEO-optimized article using the provided inputs.\r\n\r\nThis content will be pasted directly into a WordPress post body. You must strictly follow all formatting and content rules, outputting only valid HTML using the specified headings.\r\n\r\n---\r\n\r\n### Important Reminders:\r\n- **Do NOT** repeat, summarize, or regenerate any Section 1 content.\r\n- The `section1_headings` are provided **only for context** to help you craft a smooth transition paragraph.\r\n- Focus solely on the Section 2 headings and their content.\r\n- **You must use each heading in `section2_headings` exactly as written. Do **not** add or remove headings. Do **not** rephrase them.\r\n\r\n---\r\n\r\n### You Will Receive:\r\n\r\n- **section1_headings**: A list of Section 1 headings (for context only; not to be included in output)  \r\n- **section2_headings**: A list of exact headings for Section 2 (you must write only under these, in this order, without changing them)  \r\n- **related_keywords**: A list of secondary keywords to integrate naturally  \r\n\r\n---\r\n\r\n### Output Rules (STRICT):\r\n- Output only **valid HTML**\r\n- Use only these tags: `<p>`, `<ul>`, `<li>`, `<a>`, `<strong>`, `<em>`, `<blockquote>`, `<code>`, `<br>`,`<h1>`, `<h2>`, `<h3>`, `<h4>`.\r\n- Begin with a clear and smooth **transition paragraph** inside a `<p>` tag that naturally connects Section 1 to Section 2\r\n  - Use the `section1_headings` to understand what was covered in Section 1\r\n  - Create a brief, engaging transition that prepares readers for Section 2 content\r\n- Then, for each item in `section2_headings`, follow this exact structure:\r\n  - Write the heading **exactly as provided** in `section2_headings`\r\n  - Follow it with detailed, well-formatted HTML paragraphs and bullet points as needed\r\n- Do **not** add new sections or headings not in `section2_headings`\r\n- Do **not** include any titles, excerpts, FAQs, or conclusion\r\n- Integrate the **main_keyword** naturally and repeatedly across the content\r\n- Use **related_keywords** effectively to increase topical relevance\r\n- Length should be **2,500 to 3,000 words**\r\n\r\n---\r\n\r\n### Final Output Format:\r\nReturn only the Section 2 article body as valid, clean HTML:\r\n\r\n- Start with a `<p>` transition paragraph  \r\n- Then for each Section 2 heading:\r\n  - Write the heading **exactly as provided** in `section2_headings`\r\n  - Follow with detailed HTML content using `<p>`, `<ul>`, and other allowed tags  \r\n- No markdown, no wrapping containers, no headings, no summaries — just raw HTML content per section\r\n​"
        },
        {
          role: "user",
          content: `- section1_headings: ${JSON.stringify(metaData.headings?.section_1 || [])}
 - section2_headings: ${JSON.stringify(metaData.headings?.section_2 || [])}
 - related_keywords: ${sanitizedRelatedKeywords}`
        }
      ];

      const section2Result = await executeModule('Section 2 Generator', section2GeneratorMessages, models.section2Generator, 'B', { maxTokens: 4000 });
      console.log(`✅ Section 2 Generator completed, content length: ${section2Result.length} characters`);

      return { section1Result, section2Result };
    })();

    // Branch FAQ: parallel after meta
    const faqPromise = (async () => {
      console.log(`🚀 Starting Branch FAQ: FAQ Generator`);
      
      const faqGeneratorMessages = [
        {
          role: "system",
          content: "You are an expert SEO content writer specialized in generating clear, concise, and accurate FAQ answers based on the main keyword, related keywords, and a list of FAQ questions.\n\nInstructions:\n- For each FAQ question, provide a direct, factual, and concise answer in **1 to 2 sentences**.\n- Then add a second paragraph with **brief contextual explanation (max 100 words)**.\n- Use the related keywords naturally to enhance relevance without keyword stuffing.\n- Format each FAQ as:\n  `<h3>Question?</h3>`  \n  `<p>Answer sentence(s). Context sentence(s).</p>`\n- Do NOT include any extra text, explanation, or formatting outside these tags.\n- Avoid repeating content or vague answers.\n- Maintain a professional, simple, and clear tone.\n\n-No markdown, no wrapping containers, no headings, no summaries — just raw HTML content per section"
        },
        {
          role: "user",
          content: `- related_keywords: ${sanitizedRelatedKeywords}
 - faq_questions: ${JSON.stringify(metaData.faq || [])}`
        }
      ];

      const faqResult = await executeModule('FAQ Generator', faqGeneratorMessages, models.faqGenerator, 'FAQ', { maxTokens: 2000 });
      console.log(`✅ FAQ Generator completed, FAQ length: ${faqResult.length} characters`);
      
      return faqResult;
    })();

    // Execute all branches in parallel
    console.log(`🚀 Executing all branches in parallel...`);
    const [branchAResults, branchBResults, faqResult] = await Promise.all([
      branchA,
      branchB,
      faqPromise
    ]);

    // Extract results from branches
    const { toolResult, validatedToolResult, guideResult } = branchAResults;
    const { section1Result, section2Result } = branchBResults;

    // Store results
    results.tool_generator_result = toolResult;
    results.validated_tool_result = validatedToolResult;
    results.guide_generator_result = guideResult;
    results.section_1_generator_result = section1Result;
    results.section_2_generator_result = section2Result;
    results.faq_generator_result = faqResult;

    const processingTime = Date.now() - startTime;

    // Update the log with results
    await supabase.from('analysis_logs').update({
      status: 'completed',
      results: results,
      api_keys_used: usedKeys,
      processing_time: processingTime
    }).eq('request_id', requestId);

    // Create flat JSON response structure with sanitized content
    const flatResponse = {
      request_id: requestId,
      main_keyword: sanitizedMainKeyword,
      processing_time: processingTime,
      api_keys_used: usedKeys.length,
      
      // Meta & Toc Results
      title: metaData.title || '',
      excerpt: metaData.excerpt || '',
      section_1_headings: metaData.headings?.section_1 || [],
      section_2_headings: metaData.headings?.section_2 || [],
      faq_questions: metaData.faq || [],
      
      // Tool Results (sanitized)
      tool_generator_result: toolResult ? String(toolResult).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
      validated_tool_result: validatedToolResult ? String(validatedToolResult).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
      guide_generator_result: guideResult ? String(guideResult).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',

      // Feature Image (optional)
      feature_image_prompt: featureImagePrompt,
      feature_image_url: featureImageUrl,
      image_width: sanitizedGenerateImage ? finalImageWidth : undefined,
      image_height: sanitizedGenerateImage ? finalImageHeight : undefined,

      // Content Results (sanitized)
      section_1_generator_result: section1Result ? String(section1Result).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
      section_2_generator_result: section2Result ? String(section2Result).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
      faq_generator_result: faqResult ? String(faqResult).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
      
      // Complete Article (combined and sanitized)
      complete_article: [
        section1Result ? String(section1Result).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
        section2Result ? String(section2Result).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : '',
        faqResult ? String(faqResult).replace(/[\x00-\x1F\x7F-\x9F]/g, '') : ''
      ].filter(Boolean).join('\n\n'),
      
      // Status
      status: 'completed',
      total_modules_executed: 7,
      success_rate: '100%'
    };

    console.log(`🎉 Article generation completed successfully!`);
    console.log(`📊 Final stats:`, {
      request_id: requestId,
      processing_time: processingTime,
      api_keys_used: usedKeys.length,
      title: metaData.title,
      content_length: flatResponse.complete_article.length
    });

    // Final validation: ensure the response is valid JSON
    try {
      // Test JSON serialization
      JSON.stringify(flatResponse);
      console.log('✅ Response validation passed - sending to client');
      res.json(flatResponse);
    } catch (jsonError) {
      console.error('❌ Response JSON validation failed:', jsonError.message);
      
      // Send a sanitized error response
      res.status(500).json({
        error: 'Response formatting error',
        message: 'Generated content contains invalid characters',
        request_id: requestId,
        processing_time: processingTime,
        status: 'failed'
      });
    }

  } catch (error) {
    console.error('Article generation error:', error);
    
    const processingTime = Date.now() - startTime;
    
    // Update log with error
    await supabase.from('analysis_logs').update({
      status: 'failed',
      error_message: error.message,
      processing_time: processingTime
    }).eq('request_id', requestId);

    res.status(500).json({ 
      error: 'Article generation failed', 
      message: error.message,
      request_id: requestId,
      processing_time: processingTime
    });
  }
});

// Webhook endpoint for article generation (Make.com friendly)
app.post('/api/generate-article-webhook', rateLimitMiddleware, authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  
  try {
    const { mainKeyword, top10Articles, relatedKeywords, guidelines } = req.body;
    
    if (!mainKeyword || !top10Articles || !relatedKeywords) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'mainKeyword, top10Articles, and relatedKeywords are required' 
      });
    }

    // Log the request
    await supabase.from('analysis_logs').insert({
      user_id: req.user.id,
      request_id: requestId,
      keywords: [mainKeyword],
      status: 'pending'
    });

    // Get user's OpenRouter API keys with smart recovery
    // Smart recovery: Test failed keys before reactivating (10-hour recovery)
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    
    // Get failed keys that are older than 10 hours
    const { data: failedKeys } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .eq('status', 'failed')
      .lt('last_failed', tenHoursAgo);
    
    // Test each failed key before reactivating
    if (failedKeys && failedKeys.length > 0) {
      console.log(`🔄 Testing ${failedKeys.length} failed keys for recovery...`);
      
      for (const key of failedKeys) {
        try {
          // Test the key with a simple API call
          const testResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key.api_key}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': OPENROUTER_REFERER,
              'X-Title': OPENROUTER_TITLE
            },
            body: JSON.stringify({
              model: 'deepseek/deepseek-chat-v3-0324:free',
              messages: [{ role: 'user', content: 'Test' }],
              max_tokens: 10
            })
          });
          
          if (testResponse.ok) {
            // Key is working - reactivate it
            await supabase
              .from('api_keys')
              .update({ 
                status: 'active', 
                failure_count: 0,
                last_used: new Date().toISOString()
              })
              .eq('id', key.id);
            console.log(`✅ Reactivated key: ${key.key_name}`);
          } else {
            // Key is still broken - keep it failed
            console.log(`❌ Key still broken: ${key.key_name} (${testResponse.status})`);
          }
        } catch (error) {
          // Key test failed - keep it failed
          console.log(`❌ Key test failed: ${key.key_name} (${error.message})`);
        }
      }
    }
    
    // Get available keys (active + rate_limited)
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .in('status', ['active', 'rate_limited']);

    console.log(`🔍 API keys query result:`, { apiKeys, keysError });

    if (keysError) {
      console.error('❌ Error fetching API keys:', keysError);
      await supabase.from('analysis_logs').update({
        status: 'failed',
        error_message: `Database error: ${keysError.message}`,
        processing_time: Date.now() - startTime
      }).eq('request_id', requestId);

      return res.status(500).json({ 
        error: 'Database error', 
        message: 'Failed to fetch API keys' 
      });
    }

    if (!apiKeys || apiKeys.length === 0) {
      console.log(`❌ No API keys found for user ${req.user.id}`);
      
      // Let's also check what keys exist for this user (for debugging)
      const { data: allUserKeys } = await supabase
        .from('api_keys')
        .select('id, provider, status, user_id')
        .eq('user_id', req.user.id);
      
      console.log(`🔍 All keys for user ${req.user.id}:`, allUserKeys);
      
      await supabase.from('analysis_logs').update({
        status: 'failed',
        error_message: 'No OpenRouter API keys available',
        processing_time: Date.now() - startTime
      }).eq('request_id', requestId);

      return res.status(400).json({ 
        error: 'No API keys', 
        message: 'Please add at least one OpenRouter API key' 
      });
    }

    // Execute the main article generation logic (simplified for webhook)
    // This would call the same functions as the main endpoint
    // For now, we'll return a success response with the request details

    const processingTime = Date.now() - startTime;

    // Update the log
    await supabase.from('analysis_logs').update({
      status: 'completed',
      processing_time: processingTime
    }).eq('request_id', requestId);

    // Return flat JSON structure for Make.com
    const flatResponse = {
      request_id: requestId,
      main_keyword: mainKeyword,
      processing_time: processingTime,
      api_keys_used: apiKeys.length,
      status: 'completed',
      message: 'Article generation webhook endpoint ready for implementation'
    };

    res.json(flatResponse);

  } catch (error) {
    console.error('Article generation webhook error:', error);
    
    const processingTime = Date.now() - startTime;
    
    await supabase.from('analysis_logs').update({
      status: 'failed',
      error_message: error.message,
      processing_time: processingTime
    }).eq('request_id', requestId);

    res.status(500).json({ 
      error: 'Article generation failed', 
      message: error.message,
      request_id: requestId,
      processing_time: processingTime
    });
  }
});

// Lightweight health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Test endpoint for API information
app.get('/api/test', (_req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Article Generator API is running',
    version: '1.0.0',
    endpoints: [
      '/api/generate-article',
      '/api/generate-article-webhook',
      '/api/extract-contacts',
      '/api/test-webhook',
      '/api/test-apify',
      '/api/debug/keys'
    ]
  });
});

// Test webhook functionality
app.post('/api/test-webhook', rateLimitMiddleware, authMiddleware, async (req, res) => {
  try {
    res.json({ 
      status: 'success', 
      message: 'Webhook test successful',
      user_id: req.user.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Webhook test failed', message: error.message });
  }
});

// Test Apify API key
app.post('/api/test-apify', rateLimitMiddleware, authMiddleware, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    // Test the API key with a simple request
    const response = await fetch('https://api.apify.com/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const userData = await response.json();
      res.json({ 
        status: 'success', 
        message: 'API key is valid',
        user: userData
      });
    } else {
      res.status(400).json({ 
        status: 'error', 
        message: 'Invalid API key' 
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'API key test failed', message: error.message });
  }
});

// Debug API keys (requires auth)
app.get('/api/debug/keys', rateLimitMiddleware, authMiddleware, async (req, res) => {
  try {
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id, key_name, provider, status, last_used, last_failed, failure_count')
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch API keys', message: error.message });
    }

    // Group keys by status
    const activeKeys = apiKeys.filter(k => k.status === 'active');
    const rateLimitedKeys = apiKeys.filter(k => k.status === 'rate_limited');
    const failedKeys = apiKeys.filter(k => k.status === 'failed');

    res.json({ 
      status: 'success', 
      api_keys: apiKeys,
      summary: {
        total_keys: apiKeys.length,
        active_keys: activeKeys.length,
        rate_limited_keys: rateLimitedKeys.length,
        failed_keys: failedKeys.length
      },
      by_status: {
        active: activeKeys,
        rate_limited: rateLimitedKeys,
        failed: failedKeys
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Debug failed', message: error.message });
  }
});

// Manual key recovery endpoint (requires auth)
app.post('/api/recover-keys', rateLimitMiddleware, authMiddleware, async (req, res) => {
  try {
    const { key_ids } = req.body; // Optional: specific key IDs to recover
    
    // Get failed keys
    let query = supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .eq('status', 'failed');
    
    if (key_ids && Array.isArray(key_ids) && key_ids.length > 0) {
      query = query.in('id', key_ids);
    }
    
    const { data: failedKeys, error } = await query;
    
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch failed keys', message: error.message });
    }
    
    if (!failedKeys || failedKeys.length === 0) {
      return res.json({ 
        status: 'success', 
        message: 'No failed keys to recover (all keys are either active, rate_limited, or failed less than 10 hours ago)',
        recovered: 0,
        still_failed: 0
      });
    }
    
    console.log(`🔄 Manually testing ${failedKeys.length} failed keys...`);
    
    let recovered = 0;
    let stillFailed = 0;
    
    for (const key of failedKeys) {
      try {
        // Test the key with a simple API call
        const testResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key.api_key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': OPENROUTER_REFERER,
            'X-Title': OPENROUTER_TITLE
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat-v3-0324:free',
            messages: [{ role: 'user', content: 'Test' }],
            max_tokens: 10
          })
        });
        
        if (testResponse.ok) {
          // Key is working - reactivate it
          await supabase
            .from('api_keys')
            .update({ 
              status: 'active', 
              failure_count: 0,
              last_used: new Date().toISOString()
            })
            .eq('id', key.id);
          console.log(`✅ Manually recovered key: ${key.key_name}`);
          recovered++;
        } else {
          console.log(`❌ Key still broken: ${key.key_name} (${testResponse.status})`);
          stillFailed++;
        }
      } catch (error) {
        console.log(`❌ Key test failed: ${key.key_name} (${error.message})`);
        stillFailed++;
      }
    }
    
    res.json({ 
      status: 'success', 
      message: `Recovery attempt completed`,
      recovered,
      still_failed: stillFailed,
      total_tested: failedKeys.length
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Recovery failed', message: error.message });
  }
});

// Contact extraction endpoint (placeholder for now)
app.post('/api/extract-contacts', rateLimitMiddleware, authMiddleware, async (req, res) => {
  try {
    const { domains } = req.body;
    
    if (!domains || !Array.isArray(domains)) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'domains array is required' 
      });
    }

    // For now, return a placeholder response
    // This would integrate with Apify or similar service
    res.json({
      status: 'success',
      message: 'Contact extraction endpoint ready for implementation',
      domains_received: domains,
      user_id: req.user.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Contact extraction failed', message: error.message });
  }
});

// Global error handler (ensure this is last)
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err?.status || 500).json({
    error: 'Internal server error',
    message: err?.message || 'An unexpected error occurred'
  });
});