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
