#!/usr/bin/env node
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { parse as parseUrl } from 'url';
import { SecretsManagerClient, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import net from 'net';
import { GMAIL_REFRESH_TOKEN_SECRET_ARN } from '../lib/const';

interface GoogleCreds {
  web?: {
    client_id: string;
    client_secret: string;
  };
  installed?: {
    client_id: string;
    client_secret: string;
  };
}

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const START_PORT = 8080;
const MAX_PORT_ATTEMPTS = 100; // Try up to 100 ports (8080-8179)

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

/**
 * Find an available port starting from START_PORT
 */
async function findAvailablePort(): Promise<number> {
  for (let port = START_PORT; port < START_PORT + MAX_PORT_ATTEMPTS; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port in range ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS - 1}`);
}

/**
 * Update AWS Secrets Manager with the new refresh token
 */
async function updateAWSSecret(refreshToken: string): Promise<void> {
  try {
    console.log('🔄 Updating AWS Secrets Manager...');
    const client = new SecretsManagerClient({ region: 'us-east-2' });
    const command = new UpdateSecretCommand({
      SecretId: GMAIL_REFRESH_TOKEN_SECRET_ARN,
      SecretString: refreshToken,
    });
    await client.send(command);
    console.log('✅ Successfully updated AWS Secrets Manager!\n');
  } catch (error: any) {
    console.error('⚠️  Failed to update AWS Secrets Manager:', error.message);
    console.error('   You can manually update it later with the token shown above.\n');
  }
}

async function getRefreshToken() {
  try {
    // Find an available port
    console.log('🔍 Finding an available port...');
    const port = await findAvailablePort();
    const redirectUri = `http://localhost:${port}`;
    console.log(`✅ Found available port: ${port}\n`);

    // Load credentials
    const credsPath = join(process.cwd(), 'google_creds.json');
    const credsContent = readFileSync(credsPath, 'utf-8');
    const creds: GoogleCreds = JSON.parse(credsContent);

    const webCreds = creds.web || creds.installed;
    if (!webCreds) {
      throw new Error('No credentials found in google_creds.json');
    }

    const oauth2Client = new google.auth.OAuth2(
      webCreds.client_id,
      webCreds.client_secret,
      redirectUri
    );

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('🔐 Gmail OAuth Setup\n');
    console.log('📋 Instructions:');
    console.log('1. Click the link below to authorize access');
    console.log('2. Sign in with your Gmail account');
    console.log('3. Grant permissions');
    console.log(`4. You will be redirected to ${redirectUri}\n`);
    console.log('🔗 Authorization URL:');
    console.log(authUrl);
    console.log('\n⏳ Waiting for authorization...\n');

    // Start local server to receive callback
    return new Promise<string>((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          if (req.url?.startsWith('/?code=')) {
            const qs = parseUrl(req.url, true).query;
            const code = qs.code as string;

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>✅ Success!</h1><p>You can close this window and return to the terminal.</p>');

            // Exchange code for token
            const { tokens } = await oauth2Client.getToken(code);
            
            server.close();

            if (!tokens.refresh_token) {
              reject(new Error('No refresh token received. Try revoking access and running again.'));
              return;
            }

            console.log('✅ Authorization successful!\n');
            console.log('📝 Refresh token obtained:');
            console.log(`   ${tokens.refresh_token.substring(0, 20)}...${tokens.refresh_token.substring(tokens.refresh_token.length - 10)}\n`);

            // Update AWS Secrets Manager
            // await updateAWSSecret(tokens.refresh_token);

            console.log('📝 You can also add this to your .env.local file:\n');
            console.log(`GMAIL_CLIENT_ID=${webCreds.client_id}`);
            console.log(`GMAIL_CLIENT_SECRET=${webCreds.client_secret}`);
            console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log('\n');

            resolve(tokens.refresh_token);
          }
        } catch (error) {
          console.error('Error during OAuth callback:', error);
          reject(error);
        }
      });

      server.listen(port, () => {
        console.log(`🌐 Local server started on ${redirectUri}`);
      });

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} became unavailable. Please try again.`));
        } else {
          reject(error);
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Timeout waiting for authorization'));
      }, 5 * 60 * 1000);
    });
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('\n📄 google_creds.json not found!');
      console.error('\n📋 Setup instructions:');
      console.error('1. Go to https://console.cloud.google.com/');
      console.error('2. Create a project (or select existing)');
      console.error('3. Enable Gmail API');
      console.error('4. Create OAuth 2.0 credentials (Desktop app)');
      console.error('5. Download credentials as google_creds.json');
      console.error('6. Place it in the project root');
      console.error('7. Run this script again\n');
    }
    
    process.exit(1);
  }
}

getRefreshToken();
