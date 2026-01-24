import { NextRequest, NextResponse } from 'next/server';
import { initializeGemini, applyAILabels } from '@/lib/ai-labeler';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import type { Email, ClassifyEmailRequest, ClassifyEmailResponse } from '@/lib/types';


export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const clientId = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientId, { maxRequests: 20, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '20',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
          }
        }
      );
    }

    const body = await request.json() as ClassifyEmailRequest;
    const { email, rules } = body;

    if (!email || !email.subject || !email.body) {
      return NextResponse.json(
        { error: 'Email subject and body are required' },
        { status: 400 }
      );
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json(
        { error: 'At least one rule is required' },
        { status: 400 }
      );
    }

    // Initialize Gemini client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    await initializeGemini(apiKey);

    // Convert request email to full Email type
    const fullEmail: Email = {
      id: 'demo',
      threadId: 'demo',
      from: email.from,
      fromAddress: email.from,
      fromDomain: email.from.split('@')[1] || '',
      to: [],
      toAddresses: [],
      toDomains: [],
      subject: email.subject,
      body: email.body,
      snippet: email.body.substring(0, 200),
      receivedDate: new Date(),
      labels: [],
    };

    // Apply AI labels
    const result = await applyAILabels(fullEmail, rules);

    const response: ClassifyEmailResponse = {
      labels: result.labels,
      explanations: result.explanations,
      // Note: results are available but not included in API response for backward compatibility
    };

    return NextResponse.json(response, {
      headers: {
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
      }
    });
  } catch (error) {
    console.error('Error classifying email:', error);
    return NextResponse.json(
      { error: 'Failed to classify email' },
      { status: 500 }
    );
  }
}
