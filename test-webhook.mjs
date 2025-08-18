// Test script for SERP Analyzer webhook (ES Module version)
import fetch from 'node-fetch';

const WEBHOOK_URL = 'http://localhost:3001/api/analyze-serps';
const AUTH_TOKEN = 'your-webhook-token-here'; // Replace with actual token

async function testWebhook() {
  console.log('🧪 Testing SERP Analyzer Webhook...');
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keywords: ['test keyword', 'seo tools']
      })
    });
    
    const data = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Webhook test successful!');
      console.log(`📈 Processed ${data.keywords_processed} keywords`);
      console.log(`⏱️ Processing time: ${data.processing_time}ms`);
      
      data.results.forEach((result, index) => {
        console.log(`\n🔍 Result ${index + 1}:`);
        console.log(`   Keyword: ${result.keyword}`);
        console.log(`   API Key Used: ${result.api_key_used}`);
        console.log(`   Decision: ${result.decision}`);
        console.log(`   Average DA: ${result.average_da}`);
        console.log(`   Low DA Count: ${result.low_da_count}`);
        console.log(`   Domains: ${result.domains?.slice(0, 3).join(', ')}...`);
      });
    } else {
      console.log('❌ Webhook test failed!');
      console.log('Error:', data.error);
      console.log('Message:', data.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Test with different scenarios
async function runTests() {
  console.log('🚀 Starting webhook tests...\n');
  
  // Test 1: Basic functionality
  console.log('📋 Test 1: Basic webhook call');
  await testWebhook();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Test health endpoint
  console.log('📋 Test 2: Health check');
  try {
    const healthResponse = await fetch('http://localhost:3001/api/health');
    const healthData = await healthResponse.json();
    console.log('Health Status:', healthData);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Test info endpoint
  console.log('📋 Test 3: API info');
  try {
    const infoResponse = await fetch('http://localhost:3001/api/test');
    const infoData = await infoResponse.json();
    console.log('API Info:', infoData);
  } catch (error) {
    console.error('Info check failed:', error.message);
  }
}

// Run tests
runTests().catch(console.error); 