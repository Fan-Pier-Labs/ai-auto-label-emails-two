import { NextRequest, NextResponse } from 'next/server';
import { initializeGemini } from '@/lib/ai-labeler';
import { applyDeterministicLabels } from '@/lib/deterministic';
import { checkCombinedRateLimit, checkGlobalDailyRateLimit } from '@/lib/rate-limit';
import { getGeminiApiKey } from '@/lib/secrets';
import type { Email, RuleResult, DeterministicRuleConfig } from '@/lib/types';

export interface DeterministicClassifyRequest {
  email: {
    subject: string;
    body: string;
    from: string;
  };
  ruleConfigs: DeterministicRuleConfig[];
}

export interface DeterministicClassifyResponse {
  labels: string[];
  results: RuleResult[];
  explanations: Record<string, string>;
}

function parseFromAddress(from: string): { fromAddress: string; fromDomain: string } {
  const match = from.match(/<(.+?)>/) || from.match(/([^\s]+@[^\s]+)/);
  const fromAddress = match ? match[1].trim() : from.trim();
  const fromDomain = fromAddress.split('@')[1] || '';
  return { fromAddress, fromDomain };
}

export async function POST(request: NextRequest) {
  try {
    const globalRateLimit = checkGlobalDailyRateLimit(1000, 24 * 60 * 60 * 1000, false);
    if (!globalRateLimit.allowed) {
      return NextResponse.json(
        { error: 'Daily request limit exceeded. Please try again tomorrow.' },
        { status: 429 }
      );
    }

    const rateLimit = checkCombinedRateLimit(request, {
      maxRequests: 100,
      windowMs: 24 * 60 * 60 * 1000,
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
          },
        }
      );
    }

    checkGlobalDailyRateLimit(1000, 24 * 60 * 60 * 1000, true);

    const body = (await request.json()) as DeterministicClassifyRequest;
    const { email: emailPayload, ruleConfigs } = body;

    if (!emailPayload || typeof emailPayload.from !== 'string') {
      return NextResponse.json(
        { error: 'Email from is required' },
        { status: 400 }
      );
    }

    const validConfigs: DeterministicRuleConfig[] = (ruleConfigs || []).filter(
      (c) => c.label?.trim() && c.prompt?.trim()
    );

    const { fromAddress, fromDomain } = parseFromAddress(emailPayload.from || '');

    const email: Email = {
      id: 'demo',
      threadId: 'demo',
      from: emailPayload.from || '',
      fromAddress,
      fromDomain,
      to: [],
      toAddresses: [],
      toDomains: [],
      subject: emailPayload.subject || '',
      body: emailPayload.body || '',
      snippet: (emailPayload.body || '').substring(0, 200),
      receivedDate: new Date(),
      labels: [],
    };

    let labels: string[] = [];
    let results: RuleResult[] = [];
    const explanations: Record<string, string> = {};

    if (validConfigs.length > 0) {
      let apiKey: string;
      try {
        apiKey = await getGeminiApiKey();
      } catch (error: unknown) {
        console.error('Failed to get GEMINI_API_KEY:', error);
        return NextResponse.json(
          { error: 'Gemini API key not configured' },
          { status: 500 }
        );
      }
      await initializeGemini(apiKey);

      const outcome = await applyDeterministicLabels(email, validConfigs, {
        skipHistoryRules: true,
      });
      labels = outcome.labels;
      results = outcome.results;

      for (const r of results) {
        explanations[r.ruleName] = r.reason;
      }
    }

    const response: DeterministicClassifyResponse = {
      labels,
      results,
      explanations,
    };

    return NextResponse.json(response, {
      headers: {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
        'X-RateLimit-Identifier': rateLimit.identifier,
      },
    });
  } catch (error) {
    console.error('Error in deterministic-classify:', error);
    return NextResponse.json(
      { error: 'Failed to run deterministic rules' },
      { status: 500 }
    );
  }
}
