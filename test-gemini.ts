import { GoogleGenerativeAI } from '@google/generative-ai';
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
  console.log('🧪 Testing Gemini API Call\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found in .env file');
    process.exit(1);
  }
  
  console.log('✅ API Key found\n');
  
  try {
    // First, try to list available models via REST API
    console.log('🔍 Checking available models...\n');
    try {
      const listResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (listResponse.ok) {
        const data = await listResponse.json();
        if (data.models && data.models.length > 0) {
          console.log('Available models:');
          const generateContentModels = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name.replace('models/', ''));
          generateContentModels.forEach((name: string) => {
            console.log(`   - ${name}`);
          });
          console.log('');
        }
      }
    } catch (listErr) {
      console.log('⚠️  Could not list models, will try common names...\n');
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use a model that's actually available (from the list we got)
    // Try newer models first, then fallback to latest aliases
    const modelNames = [
      'gemini-2.0-flash',
      'gemini-2.5-flash', 
      'gemini-flash-latest',
      'gemini-pro-latest'
    ];
    let model = null;
    let modelName = null;
    
    console.log('🔍 Trying available models...\n');
    for (const name of modelNames) {
      try {
        model = genAI.getGenerativeModel({ model: name });
        // Quick test call
        const testResult = await model.generateContent('test');
        await testResult.response;
        modelName = name;
        console.log(`✅ Using model: ${name}\n`);
        break;
      } catch (err) {
        continue;
      }
    }
    
    if (!model || !modelName) {
      throw new Error(
        `Could not use any of the tried models: ${modelNames.join(', ')}\n` +
        `Please check the available models list above and update the model name.`
      );
    }
    
    console.log('📞 Making API call...\n');
    const result = await model.generateContent('Say "Hello, Gemini is working!" in exactly 5 words.');
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ API call successful!');
    console.log(`📝 Response: ${text}\n`);
    
  } catch (error) {
    console.error('\n❌ Error:');
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('api key') && (errorMsg.includes('invalid') || errorMsg.includes('not valid'))) {
        console.error('   Invalid API key detected!\n');
        console.error('   To get a valid Gemini API key:');
        console.error('   1. Visit: https://makersuite.google.com/app/apikey');
        console.error('   2. Sign in with your Google account');
        console.error('   3. Click "Create API Key"');
        console.error('   4. Copy the key and update GEMINI_API_KEY in your .env file\n');
      } else {
        console.error(`   ${error.message}`);
      }
      if (error.stack && !errorMsg.includes('api key')) {
        console.error(`\n   Stack trace:\n${error.stack}`);
      }
    } else {
      console.error('   Unknown error:', error);
    }
    process.exit(1);
  }
}

testGeminiIntegration();
