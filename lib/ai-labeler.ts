import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Email, LabelRule } from './types';

let geminiClient: GoogleGenerativeAI | null = null;

export async function initializeGemini(apiKey: string) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }
  geminiClient = new GoogleGenerativeAI(apiKey);
}

function hasUnsubscribeLink(email: Email): boolean {
  const content = `${email.body} ${email.snippet}`.toLowerCase();
  
  const unsubscribePatterns = [
    /unsubscribe/i,
    /opt[-\s]?out/i,
    /remove\s+me/i,
    /unsub/i,
    /email\s+preferences/i,
    /manage\s+subscription/i,
    /subscription\s+preferences/i,
    /preference\s+center/i,
  ];
  
  const urlPattern = /https?:\/\/[^\s]+(unsubscribe|opt[-\s]?out|remove|preference|subscription)[^\s]*/i;
  
  const hasPattern = unsubscribePatterns.some(pattern => pattern.test(content));
  const hasUrl = urlPattern.test(content);
  
  return hasPattern || hasUrl;
}

function buildClassificationPrompt(email: Email, rule: LabelRule): string {
  const emailContent = `${email.subject}\n\n${email.body || email.snippet}`;
  
  return `You are a strict email classification assistant. You must be VERY conservative and only match emails that CLEARLY and EXACTLY match the rule description.

IMPORTANT RULES:
- If the email is similar but not exactly matching, return match: "no"
- If the email matches a different but related concept, return match: "no"
- If you have any doubt, return match: "no"
- Only return match: "yes" if the email is an unambiguous, clear match to the rule
- Pay close attention to specific details (like location names, exact criteria)
- Do NOT match based on partial similarity or loose associations
- You MUST respond with valid JSON only, no other text

Email:
${emailContent}

Rule:
Label: ${rule.label}
Description: ${rule.prompt}

Does this email CLEARLY and EXACTLY match the rule description? Be very strict. Respond with JSON in this exact format:
{
  "match": "yes" or "no",
  "reason": "brief explanation"
}`;
}

export async function applyAILabels(
  email: Email,
  rules: LabelRule[]
): Promise<{ labels: string[]; explanations: Record<string, string> }> {
  const labels: string[] = [];
  const explanations: Record<string, string> = {};
  const emailContent = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase();

  console.log(`  Email with title: ${email.subject}`);

  // Static rule: Check for unsubscribe links
  if (hasUnsubscribeLink(email)) {
    labels.push('Has-Unsubscribe');
    explanations['Has-Unsubscribe'] = 'Email contains unsubscribe link';
    console.log(`  ✓ Matched static rule: Has-Unsubscribe`);
  }

  // Process each rule separately with its own LLM call
  for (const rule of rules) {
    // First try simple string matching (fast and efficient)
    const promptLower = rule.prompt.toLowerCase();
    const simpleMatch = emailContent.includes(promptLower);
    
    if (simpleMatch) {
      labels.push(rule.label);
      explanations[rule.label] = `Simple match: "${rule.prompt}"`;
      console.log(`  ✓ Matched rule: ${rule.label} - ${rule.prompt}`);
      continue;
    }

    // If no simple match, use AI to check this specific rule
    const result = await matchSingleRuleWithGemini(email, rule);
    
    if (result.match) {
      labels.push(rule.label);
      explanations[rule.label] = result.reasoning;
      console.log(`  ✓ Matched rule: ${rule.label} - ${rule.prompt} [AI: ${result.rawAnswer}] (${result.reasoning})`);
    } else {
      console.log(`  ✗ Did not match rule: ${rule.label} - ${rule.prompt} [AI: ${result.rawAnswer}] (${result.reasoning})`);
    }
  }

  return { labels, explanations };
}

async function matchSingleRuleWithGemini(
  email: Email, 
  rule: LabelRule
): Promise<{ match: boolean; reasoning: string; rawAnswer: string }> {
  if (!geminiClient) {
    throw new Error('Gemini client not initialized. Call initializeGemini first.');
  }

  const prompt = buildClassificationPrompt(email, rule);

  try {
    const model = geminiClient.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    
    try {
      // Try to parse JSON directly
      const parsed = JSON.parse(text) as { match?: string; reason?: string };
      const matchValue = parsed.match?.toLowerCase().trim();
      const match = matchValue === 'yes';
      const rawAnswer = matchValue || 'unknown';
      const reasoning = parsed.reason || '';
      
      return { match, reasoning, rawAnswer };
    } catch (parseError) {
      // Fallback: try to extract JSON from the response if it's wrapped in text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { match?: string; reason?: string };
        const matchValue = parsed.match?.toLowerCase().trim();
        const match = matchValue === 'yes';
        const rawAnswer = matchValue || 'unknown';
        const reasoning = parsed.reason || '';
        return { match, reasoning, rawAnswer };
      }
      
      console.error(`[AI] Failed to parse JSON response for rule "${rule.label}":`, text);
      return { match: false, reasoning: 'Failed to parse response', rawAnswer: 'unknown' };
    }
  } catch (error) {
    console.error(`[AI] Error matching rule "${rule.label}" with Gemini:`, error);
    return { match: false, reasoning: 'Error occurred', rawAnswer: 'no' };
  }
}
