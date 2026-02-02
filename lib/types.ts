export interface Email {
  id: string;
  threadId: string;
  from: string;
  fromAddress: string;
  fromDomain: string;
  to: string[];
  toAddresses: string[];
  toDomains: string[];
  subject: string;
  body: string;
  snippet: string;
  receivedDate: Date;
  labels: string[];
}

export interface LabelRule {
  label: string;
  prompt: string;
}

export interface EmailHistory {
  seenSenderDomains: Set<string>;
  seenSenderAddresses: Set<string>;
  sentDomains: Set<string>;
  sentAddresses: Set<string>;
}

export interface ClassifyEmailRequest {
  email: {
    subject: string;
    body: string;
    from: string;
  };
  rules?: LabelRule[];
}

export interface ClassifyEmailResponse {
  labels: string[];
  explanations: Record<string, string>;
}

export interface RuleResult {
  ruleName: string;
  matched: boolean;
  reason: string;
}

export interface DeterministicRuleConfig {
  label: string;
  enabled: boolean;
  prompt: string;
}

/**
 * All available deterministic rule names
 */
export const DETERMINISTIC_RULE_NAMES = [
  'first-domain',
  'first-address',
  'no-email-domain',
  'no-email-address',
  'domain-down',
  'domain-redirects',
  'new-domain',
  'domain-resolves-known-provider',
  'smtp-gmail',
  'smtp-msft',
  'smtp-automation',
  'smtp-work-email',
  'smtp-other',
  'no-spf',
  'no-dmarc',
  'has-dkim',
  'no-txt',
] as const;

export type DeterministicRuleName = typeof DETERMINISTIC_RULE_NAMES[number];

/**
 * Default enabled state for each deterministic rule
 * Rules disabled by default: smtp-gmail, smtp-msft (too noisy for most users)
 */
export const DEFAULT_DETERMINISTIC_RULES: Record<DeterministicRuleName, boolean> = {
  'first-domain': true,
  'first-address': true,
  'no-email-domain': true,
  'no-email-address': true,
  'domain-down': true,
  'domain-redirects': true,
  'new-domain': true,
  'domain-resolves-known-provider': true,
  'smtp-gmail': false,      // disabled by default (too common)
  'smtp-msft': false,       // disabled by default (too common)
  'smtp-automation': true,
  'smtp-work-email': true,
  'smtp-other': true,
  'no-spf': true,
  'no-dmarc': true,
  'has-dkim': true,
  'no-txt': true,
};
