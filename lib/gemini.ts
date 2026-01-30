import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry';

let geminiClient: GoogleGenerativeAI | null = null;

/**
 * Initialize the Gemini client with an API key
 */
export async function initializeGemini(apiKey: string) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }
  geminiClient = new GoogleGenerativeAI(apiKey);
}

async function generateCompletion(modelName: string, fullPrompt: string): Promise<string> {
  const model = geminiClient!.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(fullPrompt);
  const response = await result.response;
  return response.text().trim();
}

/**
 * Call Gemini API with a specific model and prompt (with retry and exponential backoff).
 * @param modelName - The name of the Gemini model to use (e.g., 'gemini-2.0-flash')
 * @param fullPrompt - The complete prompt to send to the model
 * @returns The text response from the model
 */
export async function callGemini(modelName: string, fullPrompt: string): Promise<string> {
  if (!geminiClient) {
    throw new Error('Gemini client not initialized. Call initializeGemini first.');
  }
  try {
    return await withRetry(
      () => generateCompletion(modelName, fullPrompt),
      { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000 }
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
    throw new Error('Unknown error calling Gemini API');
  }
}
