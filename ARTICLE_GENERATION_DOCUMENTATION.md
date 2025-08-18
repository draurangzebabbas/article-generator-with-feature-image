# Article Generation System Documentation

## Overview

The Article Generation System is a comprehensive AI-powered tool that automates the creation of SEO-optimized articles with embedded tools and guides. It replicates your Make.com workflow with intelligent API key rotation and bulk processing capabilities.

## Features

### 🎯 Core Functionality
- **SEO-Optimized Content Generation**: Creates articles with proper keyword targeting
- **Interactive Tool Generation**: Produces WordPress-compatible HTML tools
- **Comprehensive Guides**: Generates user-friendly guides for tools
- **Smart API Key Rotation**: Automatically manages multiple OpenRouter API keys
- **Bulk Processing**: Handle multiple articles simultaneously
- **Make.com Integration**: Webhook endpoints for automation workflows

### 🔧 Technical Capabilities
- **8-Step Generation Process**: Complete workflow from keyword to final article
- **Multiple AI Models**: Support for various OpenRouter models
- **Error Handling**: Robust retry mechanisms and failure recovery
- **Real-time Monitoring**: Live progress tracking and status updates
- **Export Options**: Download articles, tools, and guides separately

## API Endpoints

### 1. Main Article Generation Endpoint
```
POST /api/generate-article
```

**Purpose**: Complete article generation with all components

**Request Body**:
```json
{
  "mainKeyword": "mortgage calculator",
  "top10Articles": "Content from top 10 ranking articles...",
  "relatedKeywords": "mortgage, loan, payment, interest rate",
  "guidelines": "Create a simple calculator tool",
  "models": {
    "metaGenerator": "deepseek/deepseek-chat-v3-0324:free",
    "toolGenerator": "qwen/qwen-2.5-coder-32b-instruct:free",
    "toolValidator": "qwen/qwen-2.5-coder-32b-instruct:free",
    "guideGenerator": "deepseek/deepseek-chat-v3-0324:free",
    "section1Generator": "deepseek/deepseek-chat-v3-0324:free",
    "section1Summary": "deepseek/deepseek-chat-v3-0324:free",
    "section2Generator": "deepseek/deepseek-chat-v3-0324:free",
    "faqGenerator": "deepseek/deepseek-chat-v3-0324:free"
  }
}
```

**Response**:
```json
{
  "request_id": "uuid",
  "main_keyword": "mortgage calculator",
  "processing_time": 45000,
  "api_keys_used": 3,
  "title": "Free Mortgage Calculator: Calculate Your Monthly Payment",
  "excerpt": "Use our free mortgage calculator to estimate your monthly payment, total interest, and loan payoff date. Simple, accurate, and easy to use.",
  "semantic_keywords": {
    "informational": ["mortgage payment", "interest rate", "loan term"],
    "transactional_optional": ["mortgage calculator", "payment calculator"],
    "supportive": ["home loan", "refinance", "amortization"]
  },
  "section_1_headings": ["Understanding Mortgage Basics", "How Interest Rates Work"],
  "section_2_headings": ["Tips for Lower Payments", "When to Refinance"],
  "faq_questions": ["What is a mortgage?", "How do I calculate mortgage payments?"],
  "tool_generator_result": "<div class=\"tool-wrapper\">...</div>",
  "validated_tool_result": "<div class=\"tool-wrapper\">...</div>",
  "guide_generator_result": "<p><strong>Mortgage calculator</strong> helps...</p>",
  "section_1_generator_result": "<p>When it comes to purchasing a home...</p>",
  "section_1_summary_result": "This section introduced the foundational concepts...",
  "section_2_generator_result": "<p>Building on the basics covered earlier...</p>",
  "faq_generator_result": "<h3>What is a mortgage?</h3><p>A mortgage is...</p>",
  "complete_article": "Full article content...",
  "status": "completed",
  "total_modules_executed": 8,
  "success_rate": "100%"
}
```

### 2. Webhook Endpoint (Make.com Integration)
```
POST /api/generate-article-webhook
```

**Purpose**: Simplified endpoint for Make.com automation

**Request Body**:
```json
{
  "mainKeyword": "mortgage calculator",
  "top10Articles": "Content from top 10 ranking articles...",
  "relatedKeywords": "mortgage, loan, payment, interest rate",
  "guidelines": "Create a simple calculator tool"
}
```

**Response**:
```json
{
  "request_id": "uuid",
  "main_keyword": "mortgage calculator",
  "processing_time": 45000,
  "api_keys_used": 3,
  "status": "completed",
  "message": "Article generation webhook endpoint ready for implementation"
}
```

## Generation Process

### Step 1: Meta & Toc Generator
- **Purpose**: Creates SEO title, excerpt, semantic keywords, headings, and FAQs
- **Input**: Main keyword, top 10 articles, related keywords
- **Output**: Structured JSON with all meta information
- **Model**: `deepseek/deepseek-chat-v3-0324:free`

### Step 2: Tool Generator
- **Purpose**: Creates WordPress-compatible HTML tools
- **Input**: Main keyword, related keywords, semantic keywords
- **Output**: Complete HTML tool with CSS and JavaScript
- **Model**: `qwen/qwen-2.5-coder-32b-instruct:free`

### Step 3: Tool Validator
- **Purpose**: Validates and optimizes the generated tool
- **Input**: Raw tool code from Step 2
- **Output**: Clean, WordPress-ready tool code
- **Model**: `qwen/qwen-2.5-coder-32b-instruct:free`

### Step 4: Guide Generator
- **Purpose**: Creates user-friendly guides for the tool
- **Input**: Main keyword, tool code, related keywords
- **Output**: HTML guide with "What is" and "How to use" sections
- **Model**: `deepseek/deepseek-chat-v3-0324:free`

### Step 5: Section 1 Generator
- **Purpose**: Writes the first half of the article
- **Input**: Title, excerpt, headings, keywords
- **Output**: Complete Section 1 content (2,500-3,000 words)
- **Model**: `deepseek/deepseek-chat-v3-0324:free`

### Step 6: Section 1 Summary
- **Purpose**: Creates transition paragraph between sections
- **Input**: Section 1 content
- **Output**: Smooth transition paragraph
- **Model**: `deepseek/deepseek-chat-v3-0324:free`

### Step 7: Section 2 Generator
- **Purpose**: Writes the second half of the article
- **Input**: Section 1 summary, Section 2 headings, keywords
- **Output**: Complete Section 2 content (2,500-3,000 words)
- **Model**: `deepseek/deepseek-chat-v3-0324:free`

### Step 8: FAQ Generator
- **Purpose**: Creates FAQ section with answers
- **Input**: FAQ questions, keywords
- **Output**: Complete FAQ section with HTML formatting
- **Model**: `deepseek/deepseek-chat-v3-0324:free`

## Supported AI Models

### Free Models
- `deepseek/deepseek-chat-v3-0324:free`
- `qwen/qwen-2.5-coder-32b-instruct:free`
- `anthropic/claude-3.5-sonnet:free`
- `meta-llama/llama-3.1-8b-instruct:free`
- `google/gemini-flash-1.5:free`

### Model Recommendations
- **Content Generation**: `deepseek/deepseek-chat-v3-0324:free`
- **Code Generation**: `qwen/qwen-2.5-coder-32b-instruct:free`
- **High Quality**: `anthropic/claude-3.5-sonnet:free`

## API Key Management

### Adding OpenRouter API Keys
1. Go to **API Keys** section in the dashboard
2. Click **Add New API Key**
3. Select **OpenRouter** as provider
4. Enter your API key and a descriptive name
5. Save the key

### Key Rotation Strategy
- **Automatic Rotation**: System automatically switches between available keys
- **Failure Handling**: Failed keys are marked and skipped
- **Rate Limit Management**: Rate-limited keys are temporarily disabled
- **Load Balancing**: Keys are used in round-robin fashion

### Key Status Types
- **Active**: Ready for use
- **Failed**: Invalid or expired key
- **Rate Limited**: Temporarily disabled due to rate limits

## Make.com Integration

### Contact Extraction Webhook
```json
{
  "url": "https://your-app.com/api/extract-contacts",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_WEBHOOK_TOKEN",
    "Content-Type": "application/json"
  },
  "body": {
    "domains": ["example.com", "test.com", "sample.com"]
  }
}
```

### Article Generation Webhook
```json
{
  "url": "https://your-app.com/api/generate-article-webhook",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_WEBHOOK_TOKEN",
    "Content-Type": "application/json"
  },
  "body": {
    "mainKeyword": "mortgage calculator",
    "top10Articles": "Content from top 10 ranking articles...",
    "relatedKeywords": "mortgage, loan, payment, interest rate",
    "guidelines": "Create a simple calculator tool"
  }
}
```

## Error Handling

### Common Error Types
- **No API Keys**: Add at least one OpenRouter API key
- **Rate Limited**: Wait for rate limit to reset or add more keys
- **Invalid Key**: Check and update your API key
- **Insufficient Credits**: Add funds to your OpenRouter account

### Retry Mechanism
- **Automatic Retries**: Up to 3 attempts per module
- **Key Switching**: Automatically tries different API keys
- **Exponential Backoff**: Waits between retry attempts

## Best Practices

### Input Quality
- **Main Keyword**: Use specific, targeted keywords
- **Top 10 Articles**: Include comprehensive content from competitors
- **Related Keywords**: Provide 10-20 relevant keywords
- **Guidelines**: Be specific about tool requirements

### Model Selection
- **Content Quality**: Use Claude or DeepSeek for high-quality content
- **Code Generation**: Use Qwen for reliable tool generation
- **Speed**: Use free models for faster processing
- **Cost**: Balance quality with cost considerations

### API Key Management
- **Multiple Keys**: Use 3-5 API keys for redundancy
- **Monitoring**: Regularly check key status and usage
- **Backup Keys**: Keep additional keys ready
- **Budget Management**: Monitor usage to avoid overages

## Troubleshooting

### Common Issues

**"No OpenRouter API keys available"**
- Add at least one OpenRouter API key
- Check key status in API Keys section
- Ensure keys are marked as "active"

**"Rate limited - please try again later"**
- Wait 15-30 minutes before retrying
- Add more API keys to distribute load
- Check your OpenRouter account limits

**"Failed to parse Meta & Toc Generator result"**
- Check input quality and formatting
- Ensure all required fields are provided
- Try with different model settings

**"All API keys failed"**
- Verify all API keys are valid
- Check OpenRouter account status
- Add new API keys if needed

### Performance Optimization
- **Batch Processing**: Process multiple articles together
- **Model Selection**: Use appropriate models for each task
- **Key Distribution**: Spread load across multiple keys
- **Input Optimization**: Provide high-quality, structured input

## Monitoring and Analytics

### Dashboard Metrics
- **Processing Time**: Track generation speed
- **Success Rate**: Monitor completion rates
- **API Key Usage**: Track key utilization
- **Error Rates**: Identify common issues

### Logs and History
- **Request Logs**: View all generation attempts
- **Error Details**: Get specific error information
- **Performance Data**: Track processing times
- **Key Usage**: Monitor API key performance

## Security Considerations

### Authentication
- **Webhook Tokens**: Use secure, unique tokens
- **API Key Protection**: Never expose API keys in client-side code
- **Request Validation**: All inputs are validated and sanitized

### Data Privacy
- **No Data Storage**: Generated content is not permanently stored
- **Temporary Logs**: Request logs are kept for monitoring only
- **Secure Transmission**: All API calls use HTTPS

## Support and Maintenance

### Regular Maintenance
- **Key Rotation**: Regularly update API keys
- **Model Updates**: Stay current with available models
- **Performance Monitoring**: Track system performance
- **Error Analysis**: Review and address common issues

### Getting Help
- **Documentation**: Refer to this guide for common issues
- **Dashboard**: Use built-in monitoring tools
- **Logs**: Check request logs for detailed error information
- **Support**: Contact support for complex issues

---

This documentation provides a comprehensive guide to using the Article Generation System. For additional support or questions, refer to the dashboard help sections or contact support.
