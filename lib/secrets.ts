import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { APP_SECRETS_ARN } from './const';

// Secrets that should be loaded from AWS Secrets Manager
const SECRET_KEYS = [
  'STRIPE_PRICE_ID',
  'GEMINI_API_KEY',
  'STRIPE_METADATA_ENCRYPTION_KEY',
  'STRIPE_SECRET_KEY',
  'PERSONAL_LINEAR_API_KEY',
  'SENTRY_AUTH_TOKEN',
] as const;

type SecretKey = typeof SECRET_KEYS[number];

let secretsLoaded = false;

/**
 * Fetches the consolidated secrets JSON from AWS Secrets Manager
 */
async function getSecretsFromAWS(): Promise<Record<string, string>> {
  try {
    const client = new SecretsManagerClient({ region: 'us-east-2' });
    const command = new GetSecretValueCommand({ SecretId: APP_SECRETS_ARN });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty or not a string');
    }
    
    const secrets = JSON.parse(response.SecretString.trim()) as Record<string, string>;
    return secrets;
  } catch (error: any) {
    throw new Error(
      `❌ Failed to fetch secrets from AWS Secrets Manager: ${error.message}\n\n` +
      `Make sure AWS credentials are configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)\n` +
      `or use AWS IAM role if running on EC2/ECS/Lambda`
    );
  }
}

/**
 * Loads all secrets from AWS Secrets Manager and sets them as environment variables.
 * Only fetches secrets that are not already set in environment.
 * Call this once at application startup.
 */
export async function loadSecretsFromAWS(): Promise<void> {
  if (secretsLoaded) {
    return;
  }

  // Check which secrets are missing from environment
  const missingSecrets = SECRET_KEYS.filter(key => !process.env[key]);
  
  if (missingSecrets.length === 0) {
    console.log('✅ All secrets already set in environment');
    secretsLoaded = true;
    return;
  }

  console.log(`🔐 Loading secrets from AWS Secrets Manager: ${missingSecrets.join(', ')}`);
  
  try {
    const secrets = await getSecretsFromAWS();
    
    for (const key of missingSecrets) {
      if (secrets[key]) {
        process.env[key] = secrets[key].trim();
        console.log(`   ✅ Loaded ${key}`);
      } else {
        console.warn(`   ⚠️  ${key} not found in AWS Secrets Manager`);
      }
    }
    
    secretsLoaded = true;
    console.log('✅ Secrets loaded from AWS Secrets Manager');
  } catch (error: any) {
    throw new Error(
      `❌ Failed to load secrets from AWS Secrets Manager!\n\n` +
      `Error: ${error.message}\n\n` +
      `Either:\n` +
      `1. Set environment variables directly, or\n` +
      `2. Ensure AWS credentials are configured and the secret exists at:\n` +
      `   ${APP_SECRETS_ARN}`
    );
  }
}

/**
 * Gets the GEMINI_API_KEY from environment variable.
 * Call loadSecretsFromAWS() at startup to ensure this is populated.
 */
export async function getGeminiApiKey(): Promise<string> {
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return envKey.trim();
  }

  throw new Error(
    `❌ GEMINI_API_KEY not found in environment!\n\n` +
    `Make sure loadSecretsFromAWS() was called at startup, or set GEMINI_API_KEY directly.\n` +
    `Get your key from: https://makersuite.google.com/app/apikey`
  );
}


async function test() {
  let result = await getSecretsFromAWS();
  console.log(result);
  const geminiApiKey = await getGeminiApiKey();
  console.log(geminiApiKey);
}

if (require.main === module) {
  test();
}