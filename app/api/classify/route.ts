import { NextRequest, NextResponse } from 'next/server';
import { initializeGemini, applyAILabels } from '@/lib/ai-labeler';
import { checkCombinedRateLimit, checkGlobalDailyRateLimit } from '@/lib/rate-limit';
import type { Email, ClassifyEmailRequest, ClassifyEmailResponse } from '@/lib/types';


export async function POST(request: NextRequest) {
  try {
    // Check global daily rate limit (1000 requests per day across all users)
    // Don't increment yet - we'll increment after all checks pass
    const globalRateLimit = checkGlobalDailyRateLimit(1000, 24 * 60 * 60 * 1000, false);
    
    if (!globalRateLimit.allowed) {
      return NextResponse.json(
        { error: 'Daily request limit exceeded. Please try again tomorrow.' },
        { 
          status: 429
        }
      );
    }

    // Check per-user rate limit (100 requests per day for both IP and cookie)
    const rateLimit = checkCombinedRateLimit(request, { 
      maxRequests: 100, 
      windowMs: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
            'X-RateLimit-Identifier': rateLimit.identifier,
          }
        }
      );
    }

    // All checks passed - now increment global counter
    const globalRateLimitFinal = checkGlobalDailyRateLimit(1000, 24 * 60 * 60 * 1000, true);

    const body = await request.json() as ClassifyEmailRequest;
    const { email, rules } = body;

    if (!email || !email.subject || !email.body) {
      return NextResponse.json(
        { error: 'Email subject and body are required' },
        { status: 400 }
      );
    }

    // Check character limit (1000 chars for subject + body combined)
    const queryLength = (email.subject || '').length + (email.body || '').length;
    if (queryLength > 1000) {
      return NextResponse.json(
        { 
          error: 'Query too long. Email subject and body combined must be 1000 characters or less.',
          queryLength,
          maxLength: 1000
        },
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
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
        'X-RateLimit-Identifier': rateLimit.identifier,
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
