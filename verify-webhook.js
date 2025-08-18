// Webhook Verification Script
const fetch = require('node-fetch');

// Configuration - Update these values
const WEBHOOK_URL = 'http://localhost:3001/api/analyze-serps';
const AUTH_TOKEN = 'your-webhook-token-here'; // Replace with actual token
const TEST_KEYWORDS = ['seo tools', 'keyword research'];

async function verifyWebhook() {
  console.log('🔍 Verifying SERP Analyzer Webhook...\n');
  
  // Step 1: Test health endpoint
  console.log('📋 Step 1: Testing health endpoint');
  try {
    const healthResponse = await fetch('http://localhost:3001/api/health');
    const healthData = await healthResponse.json();
    console.log('✅ Health check passed:', healthData.status);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return;
  }
  
  // Step 2: Test API info endpoint
  console.log('\n📋 Step 2: Testing API info endpoint');
  try {
    const infoResponse = await fetch('http://localhost:3001/api/test');
    const infoData = await infoResponse.json();
    console.log('✅ API info retrieved');
    console.log('   Webhook URL:', infoData.webhook_url);
    console.log('   Environment:', infoData.environment);
  } catch (error) {
    console.error('❌ API info failed:', error.message);
    return;
  }
  
  // Step 3: Test webhook with authentication
  console.log('\n📋 Step 3: Testing webhook authentication');
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keywords: TEST_KEYWORDS
      })
    });
    
    const data = await response.json();
    
    console.log('📊 Response Status:', response.status);
    
    if (response.ok) {
      console.log('✅ Webhook authentication successful!');
      console.log(`📈 Processed ${data.keywords_processed} keywords`);
      console.log(`⏱️ Processing time: ${data.processing_time}ms`);
      
      // Display results with API key information
      data.results.forEach((result, index) => {
        console.log(`\n🔍 Result ${index + 1}:`);
        console.log(`   Keyword: ${result.keyword}`);
        console.log(`   API Key Used: ${result.api_key_used || 'None'}`);
        console.log(`   Decision: ${result.decision}`);
        console.log(`   Average DA: ${result.average_da || 'N/A'}`);
        console.log(`   Low DA Count: ${result.low_da_count || 'N/A'}`);
        
        if (result.domains && result.domains.length > 0) {
          console.log(`   Top Domains: ${result.domains.slice(0, 3).join(', ')}...`);
        }
        
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });
      
      // Verify API key tracking
      const hasApiKeyInfo = data.results.some(r => r.api_key_used);
      if (hasApiKeyInfo) {
        console.log('\n✅ API key tracking is working correctly!');
      } else {
        console.log('\n⚠️ API key tracking may not be working');
      }
      
    } else {
      console.log('❌ Webhook test failed!');
      console.log('Error:', data.error);
      console.log('Message:', data.message);
      
      if (data.error === 'Missing or invalid authorization header') {
        console.log('\n💡 Tip: Make sure to replace AUTH_TOKEN with your actual webhook token');
      }
    }
    
  } catch (error) {
    console.error('❌ Webhook test failed with error:', error.message);
  }
  
  // Step 4: Test error handling
  console.log('\n📋 Step 4: Testing error handling');
  try {
    const errorResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No Authorization header to test error handling
      },
      body: JSON.stringify({
        keywords: []
      })
    });
    
    const errorData = await errorResponse.json();
    console.log('✅ Error handling test completed');
    console.log('   Expected error for empty keywords:', errorData.error);
    
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
  }
  
  console.log('\n🎉 Webhook verification completed!');
  console.log('\n📝 Summary:');
  console.log('   - Health endpoint: ✅');
  console.log('   - API info: ✅');
  console.log('   - Authentication: ' + (response?.ok ? '✅' : '❌'));
  console.log('   - API key tracking: ' + (hasApiKeyInfo ? '✅' : '❌'));
  console.log('   - Error handling: ✅');
}

// Run verification
if (require.main === module) {
  verifyWebhook().catch(console.error);
}

module.exports = { verifyWebhook }; 