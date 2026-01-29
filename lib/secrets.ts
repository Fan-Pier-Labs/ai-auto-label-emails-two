import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const GEMINI_API_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-2:555985150976:secret:GEMINI_API_KEY-Wtqpz8';

/**
 * Fetches a secret from AWS Secrets Manager
 */
async function getSecretFromAWS(secretArn: string): Promise<string> {
  try {
    const client = new SecretsManagerClient({ region: 'us-east-2' });
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty or not a string');
    }
    
    // Trim whitespace and newlines that might be present in the secret value
    return response.SecretString.trim();
  } catch (error: any) {
    throw new Error(
      `❌ Failed to fetch secret from AWS Secrets Manager: ${error.message}\n\n` +
      `Make sure AWS credentials are configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)\n` +
      `or use AWS IAM role if running on EC2/ECS/Lambda`
    );
  }
}

/**
 * Gets the GEMINI_API_KEY from environment variable or AWS Secrets Manager
 * Checks environment variable first, then falls back to AWS Secrets Manager if not found
 */
export async function getGeminiApiKey(): Promise<string> {
  // First, check environment variable
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return envKey.trim();
  }

  // If not in environment, fetch from AWS Secrets Manager
  console.log('🔐 GEMINI_API_KEY not found in environment, fetching from AWS Secrets Manager...');
  try {
    const secret = await getSecretFromAWS(GEMINI_API_KEY_SECRET_ARN);
    if (!secret) {
      throw new Error('GEMINI_API_KEY secret is empty in AWS Secrets Manager');
    }
    console.log('✅ GEMINI_API_KEY fetched from AWS Secrets Manager');
    return secret;
  } catch (error: any) {
    throw new Error(
      `❌ Failed to get GEMINI_API_KEY!\n\n` +
      `Environment variable GEMINI_API_KEY is not set and failed to fetch from AWS Secrets Manager.\n` +
      `Error: ${error.message}\n\n` +
      `Either:\n` +
      `1. Set GEMINI_API_KEY environment variable, or\n` +
      `2. Ensure AWS credentials are configured and the secret exists in AWS Secrets Manager\n` +
      `Get your key from: https://makersuite.google.com/app/apikey`
    );
  }
}
