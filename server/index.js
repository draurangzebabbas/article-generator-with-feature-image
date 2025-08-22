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

// Function to format complete article with proper structure and image placement
const formatCompleteArticle = (title, excerpt, toolResult, guideResult, section1Result, section2Result, faqResult, imagePlacement) => {
  let article = `
    <article class="article-content">
      <header class="article-header">
        <h1 class="article-title">${title}</h1>
        <p class="article-excerpt"><strong>${excerpt}</strong></p>
      </header>
  `;
  
  // Add featured image if available
  if (imagePlacement && imagePlacement.length > 0 && imagePlacement[0].type === 'featured') {
    article += `
      <div class="featured-image">
        <img src="${imagePlacement[0].url}" alt="${title}" class="w-full h-auto rounded-lg shadow-lg" />
      </div>
    `;
  }
  
  // Add tool if available
  if (toolResult) {
    article += `
      <section class="tool-section">
        <h2 class="section-title">Interactive Tool</h2>
        <div class="tool-content">
          ${toolResult}
        </div>
      </section>
    `;
  }
  
  // Add guide if available
  if (guideResult) {
    article += `
      <section class="guide-section">
        <h2 class="section-title">How to Use</h2>
        <div class="guide-content">
          ${guideResult}
        </div>
      </section>
    `;
  }
  
  // Add section 1
  article += `
    <section class="content-section">
      <h2 class="section-title">Main Content</h2>
      <div class="section-content">
        ${section1Result}
      </div>
    </section>
  `;
  
  // Add content image after section 1 if available
  if (imagePlacement) {
    const contentImage1 = imagePlacement.find(img => img.type === 'content' && img.position === 2);
    if (contentImage1) {
      article += `
        <div class="content-image">
          <img src="${contentImage1.url}" alt="Content illustration" class="w-full h-auto rounded-lg shadow-md" />
        </div>
      `;
    }
  }
  
  // Add section 2
  article += `
    <section class="content-section">
      <h2 class="section-title">Additional Information</h2>
      <div class="section-content">
        ${section2Result}
      </div>
    </section>
  `;
  
  // Add content image after section 2 if available
  if (imagePlacement) {
    const contentImage2 = imagePlacement.find(img => img.type === 'content' && img.position === 4);
    if (contentImage2) {
      article += `
        <div class="content-image">
          <img src="${contentImage2.url}" alt="Content illustration" class="w-full h-auto rounded-lg shadow-md" />
        </div>
      `;
    }
  }
  
  // Add FAQ
  article += `
    <section class="faq-section">
      <h2 class="section-title">Frequently Asked Questions</h2>
      <div class="faq-content">
        ${faqResult}
      </div>
    </section>
  `;
  
  // Add CSS styles for better presentation
  article += `
    <style>
      .article-content {
        max-width: 800px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      .article-header {
        text-align: center;
        margin-bottom: 2rem;
      }
      .article-title {
        font-size: 2.5rem;
        font-weight: 700;
        color: #1a202c;
        margin-bottom: 1rem;
      }
      .article-excerpt {
        font-size: 1.25rem;
        color: #4a5568;
        font-style: italic;
      }
      .featured-image {
        margin: 2rem 0;
        text-align: center;
      }
      .featured-image img {
        max-width: 100%;
        height: auto;
      }
      .section-title {
        font-size: 1.75rem;
        font-weight: 600;
        color: #2d3748;
        margin: 2rem 0 1rem 0;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #e2e8f0;
      }
      .section-content, .tool-content, .guide-content, .faq-content {
        margin-bottom: 2rem;
      }
      .content-image {
        margin: 2rem 0;
        text-align: center;
      }
      .content-image img {
        max-width: 100%;
        height: auto;
      }
      .tool-section, .guide-section, .content-section, .faq-section {
        margin-bottom: 3rem;
      }
      p {
        margin-bottom: 1rem;
      }
      ul, ol {
        margin-bottom: 1rem;
        padding-left: 2rem;
      }
      li {
        margin-bottom: 0.5rem;
      }
      strong {
        font-weight: 600;
      }
      em {
        font-style: italic;
      }
    </style>
  `;
  
  article += `</article>`;
  return article;
};

// Function to generate secure image URLs with base64 encoding
function generateSecureImageUrl(prompt, width, height, seed) {
  // Encode the prompt to base64 to hide it from the URL
  const encodedPrompt = Buffer.from(prompt, 'utf8').toString('base64');
  
  // Generate a random seed if not provided
  const randomSeed = seed || Math.floor(Math.random() * 1000000);
  
  // Create the secure URL
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${randomSeed}&nologo=true`;
  
  return imageUrl;
}

// 🚀 ENTERPRISE-GRADE: Fail-Proof Parallel Processing System
// Based on "Parallel Batching for Speed" and "API Key Rotation + Reactivation Logic"

// Smart key assignment with priority system and round-robin
async function getSmartKeyAssignment(supabase, userId, provider, requiredCount) {
  // Get all keys for this provider
  const { data: allKeys } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .order('last_used', { ascending: true, nullsFirst: true });

  if (!allKeys || allKeys.length === 0) {
    throw new Error(`No API keys found for provider: ${provider}`);
  }

  // Separate keys by priority
  const activeKeys = allKeys.filter(key => key.status === 'active');
  const rateLimitedKeys = allKeys.filter(key => key.status === 'rate_limited');
  const failedKeys = allKeys.filter(key => key.status === 'failed');

  console.log(`🔑 Key Inventory: ${activeKeys.length} active, ${rateLimitedKeys.length} rate_limited, ${failedKeys.length} failed`);

  // Priority 1: Fill with ACTIVE keys first (round-robin)
  let selectedKeys = [];
  let activeIndex = 0;
  
  for (let i = 0; i < Math.min(requiredCount, activeKeys.length); i++) {
    selectedKeys.push(activeKeys[activeIndex % activeKeys.length]);
    activeIndex++;
  }

  // Priority 2: If need more, add RATE_LIMITED keys (round-robin)
  if (selectedKeys.length < requiredCount && rateLimitedKeys.length > 0) {
    let rateLimitedIndex = 0;
    const remainingNeeded = requiredCount - selectedKeys.length;
    
    for (let i = 0; i < Math.min(remainingNeeded, rateLimitedKeys.length); i++) {
      selectedKeys.push(rateLimitedKeys[rateLimitedIndex % rateLimitedKeys.length]);
      rateLimitedIndex++;
    }
  }

  // Priority 3: If still need more, add FAILED keys (round-robin)
  if (selectedKeys.length < requiredCount && failedKeys.length > 0) {
    let failedIndex = 0;
    const remainingNeeded = requiredCount - selectedKeys.length;
    
    for (let i = 0; i < Math.min(remainingNeeded, failedKeys.length); i++) {
      selectedKeys.push(failedKeys[failedIndex % failedKeys.length]);
      failedIndex++;
    }
  }

  console.log(`🎯 Smart Assignment: ${selectedKeys.length} keys selected for ${requiredCount} operations`);
  return selectedKeys;
}

// Fail-proof operation retry with key rotation
async function executeOperationWithRetry(supabase, userId, provider, operation, maxRetries = 5) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get next available key for this attempt
      const keys = await getSmartKeyAssignment(supabase, userId, provider, 1);
      if (!keys || keys.length === 0) {
        throw new Error('No API keys available');
      }
      
      const currentKey = keys[0];
      console.log(`🔄 Attempt ${attempt}/${maxRetries} with key: ${currentKey.key_name} (status: ${currentKey.status})`);

      // Test the key first
      const testResult = await testAndUpdateApiKey(supabase, currentKey);
      
      if (!testResult.success) {
        console.log(`❌ Key ${currentKey.key_name} failed test, trying next key...`);
        lastError = new Error(`Key test failed: ${testResult.key.status}`);
        continue; // Try next key immediately
      }

      // Key is working - execute operation
      const result = await operation(testResult.key);
      
      // Mark key as successfully used
      await supabase.from('api_keys').update({
        last_used: new Date().toISOString(),
        status: 'active'
      }).eq('id', currentKey.id);

      console.log(`✅ Operation completed successfully with key: ${currentKey.key_name}`);
      return result;

    } catch (error) {
      lastError = error;
      console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        console.log(`💥 All ${maxRetries} attempts failed`);
        break;
      }
      
      // Small delay before next attempt (not waiting for key recovery)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

// Parallel batch processing with fail-proof retry
async function processBatchInParallel(supabase, userId, provider, operations, batchSize = 5) {
  console.log(`🚀 Starting parallel batch processing: ${operations.length} operations, batch size: ${batchSize}`);
  
  // Split operations into batches
  const batches = [];
  for (let i = 0; i < operations.length; i += batchSize) {
    batches.push(operations.slice(i, i + batchSize));
  }

  console.log(`📦 Created ${batches.length} batches for parallel processing`);

  // Process all batches in parallel
  const batchPromises = batches.map(async (batch, batchIndex) => {
    console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} operations`);
    
    // Each operation in batch gets its own key (batch-level key diversity)
    const batchResults = await Promise.allSettled(
      batch.map(async (operation, operationIndex) => {
        try {
          const result = await executeOperationWithRetry(supabase, userId, provider, operation);
          console.log(`✅ Batch ${batchIndex + 1}, Operation ${operationIndex + 1}: SUCCESS`);
          return { success: true, result, batchIndex, operationIndex };
        } catch (error) {
          console.log(`❌ Batch ${batchIndex + 1}, Operation ${operationIndex + 1}: FAILED - ${error.message}`);
          return { success: false, error: error.message, batchIndex, operationIndex };
        }
      })
    );

    // Process batch results
    const successful = batchResults.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = batchResults.filter(r => r.status === 'fulfilled' && !r.value.success);
    
    console.log(`📊 Batch ${batchIndex + 1} results: ${successful.length} success, ${failed.length} failed`);
    
    return { batchIndex, successful, failed };
  });

  // Wait for all batches to complete
  const batchResults = await Promise.all(batchPromises);
  
  // Aggregate results
  const allSuccessful = batchResults.flatMap(batch => batch.successful);
  const allFailed = batchResults.flatMap(batch => batch.failed);
  
  console.log(`🎯 Final Results: ${allSuccessful.length} total success, ${allFailed.length} total failed`);
  
  return {
    successful: allSuccessful,
    failed: allFailed,
    totalProcessed: operations.length,
    successRate: (allSuccessful.length / operations.length) * 100
  };
}

// Test a single API key and update its status
async function testAndUpdateApiKey(supabase, key) {
  try {
    console.log(`🧪 Testing key: ${key.key_name} (current status: ${key.status})`);
    
    const testResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key.api_key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      })
    });

    if (testResponse.ok) {
      // Key works - mark as active regardless of previous status
      await supabase.from('api_keys').update({
        last_used: new Date().toISOString(),
        status: 'active'
      }).eq('id', key.id);

      console.log(`✅ Key ${key.key_name} is now ACTIVE`);
      return { success: true, key: { ...key, status: 'active' } };
      
    } else if (testResponse.status === 429) {
      // Rate limited - mark as rate_limited
      await supabase.from('api_keys').update({
        status: 'rate_limited',
        last_failed: new Date().toISOString()
      }).eq('id', key.id);

      console.log(`⏳ Key ${key.key_name} is RATE_LIMITED`);
      return { success: false, key: { ...key, status: 'rate_limited' } };
      
    } else {
      // Other error - mark as failed
      await supabase.from('api_keys').update({
        status: 'failed',
        last_failed: new Date().toISOString()
      }).eq('id', key.id);

      console.log(`❌ Key ${key.key_name} is FAILED (HTTP ${testResponse.status})`);
      return { success: false, key: { ...key, status: 'failed' } };
    }
    
  } catch (error) {
    // Network/other error - mark as failed
    await supabase.from('api_keys').update({
      status: 'failed',
      last_failed: new Date().toISOString()
    }).eq('id', key.id);

    console.log(`❌ Key ${key.key_name} is FAILED (error: ${error.message})`);
    return { success: false, key: { ...key, status: 'failed' } };
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
      createTool = true,
      competitorResearch = false,
      imageCount = 1,
      serpCountry = 'US',
      serpPage = 1,
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
    
    if (!mainKeyword) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'mainKeyword is required' 
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
    const sanitizedCreateTool = Boolean(createTool);
    const sanitizedCompetitorResearch = Boolean(competitorResearch);
    const sanitizedImageCountRaw = Number.isFinite(Number(imageCount)) ? Number(imageCount) : 1;
    const sanitizedImageCount = Math.min(Math.max(1, sanitizedImageCountRaw), 5);
    const sanitizedSerpCountry = (serpCountry ? String(serpCountry) : 'US').toUpperCase().slice(0, 2);
    const sanitizedSerpPage = Math.min(Math.max(1, Number(serpPage) || 1), 5);

    // Optionally fetch SERP data (Apify) to build competitive context
    let top10ForMeta = String(top10Articles || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    let relatedForMeta = String(relatedKeywords || '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    let serpResultsForResponse = [];
    let serpRelatedKeywordsForResponse = [];

    if (sanitizedCompetitorResearch) {
      try {
        // Get user's Apify keys
        let { data: apifyKeys } = await supabase
          .from('api_keys')
          .select('*')
          .eq('user_id', req.user.id)
          .eq('provider', 'apify')
          .in('status', ['active', 'rate_limited']);

        if (!apifyKeys || apifyKeys.length === 0) {
          throw new Error('No Apify API keys available for SERP research');
        }

        const apifyKey = apifyKeys[0];

        // Start SERP actor
        const startRes = await fetch('https://api.apify.com/v2/acts/scraperlink~google-search-results-serp-scraper/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apifyKey.api_key}`
          },
          body: JSON.stringify({ country: sanitizedSerpCountry, keyword: sanitizedMainKeyword, page: sanitizedSerpPage })
        });
        if (!startRes.ok) {
          const t = await startRes.text();
          throw new Error(`SERP actor start failed: ${startRes.status} ${t}`);
        }
        const run = await startRes.json();
        const runId = run.data?.id;
        if (!runId) throw new Error('No run id from SERP actor');

        // Poll status (max 60 attempts ~5min)
        let attempts = 0;
        while (attempts < 60) {
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          const stRes = await fetch(`https://api.apify.com/v2/acts/scraperlink~google-search-results-serp-scraper/runs/${runId}`, {
            headers: { 'Authorization': `Bearer ${apifyKey.api_key}` }
          });
          if (!stRes.ok) continue;
          const st = await stRes.json();
          const status = st.data?.status;
          if (status === 'SUCCEEDED') break;
          if (status === 'FAILED') throw new Error('SERP actor failed');
        }

        // Fetch dataset
        const dsRes = await fetch(`https://api.apify.com/v2/acts/scraperlink~google-search-results-serp-scraper/runs/${runId}`, {
          headers: { 'Authorization': `Bearer ${apifyKey.api_key}` }
        });
        const ds = await dsRes.json();
        const datasetId = ds.data?.defaultDatasetId;
        if (!datasetId) throw new Error('No dataset id from SERP actor');

        // Wait a bit and then get items
        await new Promise(r => setTimeout(r, 10000));
        const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
          headers: { 'Authorization': `Bearer ${apifyKey.api_key}` }
        });
        if (!itemsRes.ok) throw new Error(`SERP dataset fetch failed: ${itemsRes.status}`);
        const items = await itemsRes.json();
        const first = Array.isArray(items) && items.length > 0 ? items[0] : null;
        const results = first?.results || [];
        const relatedKw = first?.related_keywords?.keywords || [];

        const topItems = results.slice(0, 10);
        const topLines = topItems.map((r) => {
          const t = (r.title || '').toString().trim();
          const d = (r.description || '').toString().trim();
          return `${t} — ${d}`;
        }).filter(Boolean);
        top10ForMeta = topLines.join('\n');
        serpResultsForResponse = topItems.map((r, idx) => ({
          position: r.position || idx + 1,
          title: r.title || '',
          description: r.description || '',
          url: r.url || ''
        }));
        serpRelatedKeywordsForResponse = relatedKw;
        if (relatedKw.length > 0) {
          relatedForMeta = relatedKw.join(', ');
        }
      } catch (e) {
        console.log('⚠️ SERP research failed, falling back to provided inputs:', e?.message);
      }
    }

    // Log the request
    await supabase.from('analysis_logs').insert({
      user_id: req.user.id,
      request_id: requestId,
      keywords: [sanitizedMainKeyword], // Reusing keywords field for main keyword
      status: 'pending'
    });

    // Priority-based API key selection - active keys first, then failed/rate_limited if needed
    const selectedKeys = await getSmartKeyAssignment(supabase, req.user.id, 'openrouter', 1);
    
    if (!selectedKeys || selectedKeys.length === 0) {
      return res.status(400).json({ error: 'No OpenRouter API keys found' });
    }

    // 🚀 ENTERPRISE-GRADE: Use the new fail-proof parallel processing system
    console.log(`🚀 Starting enterprise-grade article generation`);
    
    // Create the article generation operation
    const articleGenerationOperation = async (apiKey) => {
      console.log(`🔄 Executing article generation with key: ${apiKey.key_name}`);
      
      // Generate the article using the provided API key
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.api_key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://your-app.com',
          'X-Title': 'Article Generator'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [
            {
              role: 'system',
              content: `You are an expert content writer. Generate a comprehensive, engaging article based on the user's requirements.`
            },
            {
              role: 'user',
              content: `Generate an article with the following details:
                - Keyword: ${sanitizedMainKeyword}
                - Target Audience: ${formData.targetAudience}
                - Article Type: ${formData.articleType}
                - Tone: ${formData.tone}
                - Word Count: ${formData.wordCount}
                - Additional Requirements: ${formData.additionalRequirements}
                
                Please provide a well-structured article with proper headings, engaging content, and actionable insights.`
            }
          ],
          max_tokens: 4000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    };

    // Execute with fail-proof retry system
    const mainArticleContent = await executeOperationWithRetry(supabase, req.user.id, 'openrouter', articleGenerationOperation);
    
    console.log(`✅ Article generation completed successfully with enterprise-grade system`);
    
    // For now, use a default API key for subsequent operations
    // In a full implementation, we'd track which key was used successfully
    const { data: defaultKeys } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .eq('status', 'active')
      .limit(1);
    
    const openrouterApiKey = defaultKeys?.[0]?.api_key || 'unknown';

    // Generate meta description
    const metaResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: models.metaGenerator,
        messages: [
          {
            role: 'user',
            content: `Generate a compelling meta description for an article about "${sanitizedMainKeyword}". 
            The description should be 150-160 characters, engaging, and include the main keyword naturally.
            
            Top 10 articles context: ${top10ForMeta}
            Related keywords: ${relatedForMeta}
            Guidelines: ${sanitizedGuidelines}
            
            Return only the meta description text, no quotes or formatting.`
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!metaResponse.ok) {
      throw new Error(`Meta generation failed: ${metaResponse.status}`);
    }

    const metaData = await metaResponse.json();
    const metaDescription = metaData.choices[0].message.content.trim();

    // Generate tool if requested
    let toolResult = null;
    if (sanitizedCreateTool) {
      const toolResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://your-app.com',
          'X-Title': 'Article Generator'
        },
        body: JSON.stringify({
          model: models.toolGenerator,
          messages: [
            {
              role: 'user',
              content: `Create a practical tool or calculator related to "${sanitizedMainKeyword}". 
              This should be a JavaScript function that users can interact with.
              
              Guidelines: ${sanitizedGuidelines}
              Related keywords: ${relatedForMeta}
              
              Return only valid JavaScript code that can be executed. Include HTML for the interface if needed.`
            }
          ],
          max_tokens: 1000,
          temperature: 0.8
        })
      });

      if (toolResponse.ok) {
        const toolData = await toolResponse.json();
        toolResult = toolData.choices[0].message.content.trim();
      }
    }

    // Generate guide
    const guideResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: models.guideGenerator,
        messages: [
          {
            role: 'user',
            content: `Create a comprehensive guide about "${sanitizedMainKeyword}". 
            This should be a step-by-step guide that provides practical value.
            
            Guidelines: ${sanitizedGuidelines}
            Related keywords: ${relatedForMeta}
            
            Return only the guide content, no formatting or extra text.`
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!guideResponse.ok) {
      throw new Error(`Guide generation failed: ${guideResponse.status}`);
    }

    const guideData = await guideResponse.json();
    const guideContent = guideData.choices[0].message.content.trim();

    // Generate main content sections
    const section1Response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: models.section1Generator,
        messages: [
          {
            role: 'user',
            content: `Write the first main section of an article about "${sanitizedMainKeyword}". 
            This should be comprehensive and engaging, covering the core concepts.
            
            Guidelines: ${sanitizedGuidelines}
            Related keywords: ${relatedForMeta}
            
            Return only the content, no headings or formatting.`
          }
        ],
        max_tokens: 1200,
        temperature: 0.8
      })
    });

    if (!section1Response.ok) {
      throw new Error(`Section 1 generation failed: ${section1Response.status}`);
    }

    const section1Data = await section1Response.json();
    const section1Content = section1Data.choices[0].message.content.trim();

    const section2Response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: models.section2Generator,
        messages: [
          {
            role: 'user',
            content: `Write the second main section of an article about "${sanitizedMainKeyword}". 
            This should build upon the first section and provide deeper insights.
            
            Guidelines: ${sanitizedGuidelines}
            Related keywords: ${relatedForMeta}
            
            Return only the content, no headings or formatting.`
          }
        ],
        max_tokens: 1200,
        temperature: 0.8
      })
    });

    if (!section2Response.ok) {
      throw new Error(`Section 2 generation failed: ${section2Response.status}`);
    }

    const section2Data = await section2Response.json();
    const section2Content = section2Data.choices[0].message.content.trim();

    // Generate FAQ
    const faqResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: models.faqGenerator,
        messages: [
          {
            role: 'user',
            content: `Generate 5-7 frequently asked questions about "${sanitizedMainKeyword}". 
            Each question should be relevant and the answers should be helpful.
            
            Guidelines: ${sanitizedGuidelines}
            Related keywords: ${relatedForMeta}
            
            Return in this format:
            Q: Question 1
            A: Answer 1
            
            Q: Question 2
            A: Answer 2`
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!faqResponse.ok) {
      throw new Error(`FAQ generation failed: ${faqResponse.status}`);
    }

    const faqData = await faqResponse.json();
    const faqContent = faqData.choices[0].message.content.trim();

    // Generate images if requested
    let imageUrls = [];
    if (sanitizedGenerateImage) {
      for (let i = 0; i < sanitizedImageCount; i++) {
        const imagePrompt = sanitizedImagePrompt || `A professional image related to ${sanitizedMainKeyword}`;
        const imageUrl = generateSecureImageUrl(imagePrompt, finalImageWidth, finalImageHeight);
        imageUrls.push(imageUrl);
      }
    }

    // Format the complete article
    const completeArticle = formatCompleteArticle({
      title: sanitizedMainKeyword,
      excerpt: metaDescription,
      tool: toolResult,
      guide: guideContent,
      section1: section1Content,
      section2: section2Content,
      faq: faqContent,
      images: imageUrls
    });

    // Update analysis log
    await supabase.from('analysis_logs').update({
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('request_id', requestId);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Article generation completed in ${processingTime}ms`);

    res.json({
      success: true,
      request_id: requestId,
      processing_time: processingTime,
      article: {
        title: sanitizedMainKeyword,
        meta_description: metaDescription,
        tool: toolResult,
        guide: guideContent,
        section1: section1Content,
        section2: section2Content,
        faq: faqContent,
        complete_article: completeArticle,
        images: imageUrls
      },
      api_keys_used: [currentKey.key_name]
    });

  } catch (error) {
    console.error('❌ Article generation failed:', error);
    
    // Update analysis log
    await supabase.from('analysis_logs').update({
      status: 'failed',
      error_message: error.message
    }).eq('request_id', requestId);

    res.status(500).json({ 
      error: 'Article generation failed', 
      message: error.message,
      request_id: requestId
    });
  }
});

// Background article generation endpoint
app.post('/api/generate-article-background', rateLimitMiddleware, authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const requestId = req.body.request_id;
  
  if (!requestId) {
    return res.status(400).json({ error: 'request_id is required' });
  }

  try {
    // Update status to generating
    await supabase.from('article_requests').update({
      status: 'generating',
      current_step: 'Starting article generation',
      progress_percentage: 10
    }).eq('id', requestId);

    // Get the article request details
    const { data: articleRequest } = await supabase
      .from('article_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (!articleRequest) {
      throw new Error('Article request not found');
    }

    // Priority-based API key selection - active keys first, then failed/rate_limited if needed
    const selectedKeys = await getSmartKeyAssignment(supabase, req.user.id, 'openrouter', 1);
    
    if (!selectedKeys || selectedKeys.length === 0) {
      // Update status to failed
      await supabase.from('article_requests').update({
        status: 'failed',
        current_step: 'No API keys found',
        error_message: 'No OpenRouter API keys configured'
      }).eq('id', requestId);

      return res.status(400).json({ error: 'No OpenRouter API keys found' });
    }

    // 🚀 ENTERPRISE-GRADE: Use the new fail-proof parallel processing system
    console.log(`🚀 Starting enterprise-grade background article generation`);
    
    // Create the article generation operation
    const articleGenerationOperation = async (apiKey) => {
      console.log(`🔄 Executing background article generation with key: ${apiKey.key_name}`);
      
      // Generate the article using the provided API key
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.api_key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://your-app.com',
          'X-Title': 'Article Generator'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [
            {
              role: 'user',
              content: `Generate a comprehensive article about "${articleRequest.main_keyword}". 
              Include an introduction, main content sections, and conclusion.
              Make it engaging and informative.`
            }
          ],
          max_tokens: 4000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    };

    // Execute with fail-proof retry system
    const backgroundArticleContent = await executeOperationWithRetry(supabase, req.user.id, 'openrouter', articleGenerationOperation);
    
    console.log(`✅ Background article generation completed successfully with enterprise-grade system`);
    
    // For subsequent operations, get a working API key
    const { data: defaultKeys } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('provider', 'openrouter')
      .eq('status', 'active')
      .limit(1);
    
    const openrouterApiKey = defaultKeys?.[0]?.api_key || 'unknown';

    // Update progress
    await supabase.from('article_requests').update({
      current_step: 'Generating article content',
      progress_percentage: 30
    }).eq('id', requestId);

    // Generate article content (simplified version for background processing)
    const articleResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com',
        'X-Title': 'Article Generator'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'user',
            content: `Generate a comprehensive article about "${articleRequest.main_keyword}". 
            Include an introduction, main content sections, and conclusion.
            Make it engaging and informative.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!articleResponse.ok) {
      throw new Error(`Article generation failed: ${articleResponse.status}`);
    }

    const articleData = await articleResponse.json();
    const articleContent = articleData.choices[0].message.content.trim();

    // Update progress
    await supabase.from('article_requests').update({
      current_step: 'Saving article',
      progress_percentage: 80
    }).eq('id', requestId);

    // Save the generated article
    const { data: generatedArticle, error: saveError } = await supabase
      .from('generated_articles')
      .insert({
        article_request_id: requestId,
        title: articleRequest.main_keyword,
        excerpt: articleContent.substring(0, 160),
        complete_article: articleContent,
        processing_time: Date.now() - startTime,
        success_rate: 100
      });

    if (saveError) {
      throw new Error(`Failed to save article: ${saveError.message}`);
    }

    // Update status to completed
    await supabase.from('article_requests').update({
      status: 'completed',
      current_step: 'Article completed',
      progress_percentage: 100,
      completed_at: new Date().toISOString()
    }).eq('id', requestId);

    console.log(`✅ Background article generation completed for request: ${requestId}`);

    res.json({
      success: true,
      request_id: requestId,
      status: 'completed'
    });

  } catch (error) {
    console.error(`❌ Background article generation failed for request: ${requestId}`, error);
    
    // Update status to failed
    await supabase.from('article_requests').update({
      status: 'failed',
      current_step: 'Generation failed',
      error_message: error.message
    }).eq('id', requestId);

    res.status(500).json({ 
      error: 'Background article generation failed', 
      message: error.message,
      request_id: requestId
    });
  }
});
