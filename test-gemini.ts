import { initializeGemini, applyAILabels } from './lib/ai-labeler';
import type { Email, LabelRule } from './lib/types';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env file
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          process.env[key.trim()] = value;
        }
      }
    }
  } catch (error) {
    console.error('Warning: Could not load .env file:', error);
  }
}

loadEnv();

async function testGeminiIntegration() {
  console.log('🧪 Testing Gemini Integration\n');
  
  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found in .env file');
    process.exit(1);
  }
  
  console.log('✅ API Key found in .env');
  console.log(`   Key prefix: ${apiKey.substring(0, 10)}...\n`);
  
  try {
    // Initialize Gemini
    console.log('🔧 Initializing Gemini client...');
    await initializeGemini(apiKey);
    console.log('✅ Gemini client initialized successfully\n');
    
    // Create a test email
    const testEmail: Email = {
      id: 'test-1',
      threadId: 'test-thread-1',
      from: 'test@example.com',
      fromAddress: 'test@example.com',
      fromDomain: 'example.com',
      to: [],
      toAddresses: [],
      toDomains: [],
      subject: 'Welcome to our newsletter!',
      body: 'Thank you for subscribing to our newsletter. You can unsubscribe at any time by clicking the link below.',
      snippet: 'Thank you for subscribing to our newsletter.',
      receivedDate: new Date(),
      labels: [],
    };
    
    // Create test rules
    const testRules: LabelRule[] = [
      {
        label: 'Newsletter',
        prompt: 'Emails that are newsletters or subscription-based content',
      },
      {
        label: 'Promotional',
        prompt: 'Emails that are promotional or marketing messages',
      },
    ];
    
    console.log('📧 Test Email:');
    console.log(`   Subject: ${testEmail.subject}`);
    console.log(`   From: ${testEmail.from}`);
    console.log(`   Body: ${testEmail.body.substring(0, 80)}...\n`);
    
    console.log('📋 Test Rules:');
    testRules.forEach((rule, idx) => {
      console.log(`   ${idx + 1}. ${rule.label}: ${rule.prompt}`);
    });
    console.log('');
    
    // Test AI labeling
    console.log('🤖 Testing AI labeling with Gemini...\n');
    const result = await applyAILabels(testEmail, testRules);
    
    console.log('\n📊 Results:');
    console.log(`   Labels applied: ${result.labels.length}`);
    if (result.labels.length > 0) {
      console.log('   Labels:');
      result.labels.forEach((label) => {
        console.log(`     - ${label}: ${result.explanations[label] || 'No explanation'}`);
      });
    } else {
      console.log('   No labels matched');
    }
    
    console.log('\n✅ Gemini integration test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error testing Gemini integration:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`\n   Stack trace:\n${error.stack}`);
      }
    } else {
      console.error('   Unknown error:', error);
    }
    process.exit(1);
  }
}

// Run the test
testGeminiIntegration();
