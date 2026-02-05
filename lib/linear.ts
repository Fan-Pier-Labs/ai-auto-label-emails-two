/**
 * Linear API client for Gmail → Linear sync.
 * Uses PERSONAL_LINEAR_API_KEY (env or loaded from AWS via loadSecretsFromAWS).
 */
import type { Email } from './types';

const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

const SYNC_LABEL_PREFIX = 'sync:';
const SYNC_GROUP_NAME = 'sync';
const GMAIL_SYNC_MARKER_RE = /<!--\s*gmail-sync:\s*([^\s]+)\s*-->/g;

function getApiKey(): string | undefined {
  return process.env.PERSONAL_LINEAR_API_KEY?.trim() || undefined;
}

/**
 * POST a GraphQL request to Linear. Throws on errors. Returns data.
 */
export async function linearRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('PERSONAL_LINEAR_API_KEY is not set');
  }

  const res = await fetch(LINEAR_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  if (json.data === undefined) {
    throw new Error('Linear API returned no data');
  }

  return json.data as T;
}

export interface GetIssuesWithSyncLabelsResult {
  /** email or domain (lowercase) → list of issue IDs */
  reverseIndex: Map<string, string[]>;
  /** issue ID → list of emails/domains (for reference) */
  issueToEmails: Map<string, string[]>;
  /** all issue IDs that have at least one sync label */
  issueIds: string[];
}

/**
 * One query: get all issues that have a sync label (either label group "sync" with email as label name, or flat "sync:email").
 * Linear label groups: group "sync" + label "logan.smith@alpha-sense.com" → we use the label name as the email.
 * Flat format: label name "sync:logan.smith@alpha-sense.com" → we strip the prefix and use the rest as email.
 * Builds reverseIndex (email/domain → issue IDs) and issueToEmails. For each "foo@bar.com" we also add "bar.com".
 */
export async function getIssuesWithSyncLabels(): Promise<GetIssuesWithSyncLabelsResult> {
  const data = await linearRequest<{
    issues: {
      nodes: Array<{
        id: string;
        labels: { nodes: Array<{ name: string; parent?: { name: string } | null }> };
      }>;
    };
  }>(`
    query IssuesWithSyncLabels {
      issues(filter: {
        or: [
          { labels: { parent: { name: { eq: "sync" } } } },
          { labels: { name: { startsWith: "sync:" } } }
        ]
      }) {
        nodes {
          id
          labels {
            nodes { name parent { name } }
          }
        }
      }
    }
  `);

  const issueToEmails = new Map<string, string[]>();
  const reverseIndex = new Map<string, string[]>();

  for (const node of data.issues.nodes) {
    const emails: string[] = [];
    for (const label of node.labels.nodes) {
      const name = label.name?.trim() || '';
      const parentName = label.parent?.name?.trim() ?? '';
      let value: string | null = null;
      if (parentName === SYNC_GROUP_NAME) {
        value = name.toLowerCase();
      } else if (name.startsWith(SYNC_LABEL_PREFIX)) {
        value = name.slice(SYNC_LABEL_PREFIX.length).trim().toLowerCase();
      }
      if (!value) continue;
      emails.push(value);
      const existing = reverseIndex.get(value) ?? [];
      if (!existing.includes(node.id)) {
        existing.push(node.id);
        reverseIndex.set(value, existing);
      }
      if (value.includes('@')) {
        const domain = value.split('@')[1];
        if (domain) {
          const domainExisting = reverseIndex.get(domain) ?? [];
          if (!domainExisting.includes(node.id)) {
            domainExisting.push(node.id);
            reverseIndex.set(domain, domainExisting);
          }
        }
      }
    }
    if (emails.length > 0) {
      issueToEmails.set(node.id, emails);
    }
  }

  const issueIds = [...issueToEmails.keys()];
  return { reverseIndex, issueToEmails, issueIds };
}

/**
 * Create a comment on an issue. Returns the created comment id or void.
 */
export async function createComment(issueId: string, body: string): Promise<string | void> {
  const data = await linearRequest<{ commentCreate: { comment: { id: string }; success: boolean } }>(
    `
    mutation CommentCreate($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
        comment { id }
      }
    }
  `,
    { issueId, body }
  );
  return data.commentCreate?.comment?.id;
}

/**
 * Fetch comments for an issue. Returns array of { body }.
 */
export async function getIssueComments(issueId: string): Promise<Array<{ body: string }>> {
  const data = await linearRequest<{
    issue: { comments: { nodes: Array<{ body: string }> } } | null;
  }>(`
    query IssueComments($issueId: String!) {
      issue(id: $issueId) {
        comments {
          nodes { body }
        }
      }
    }
  `, { issueId: issueId });

  if (!data.issue?.comments?.nodes) return [];
  return data.issue.comments.nodes;
}

/**
 * Parse comment bodies for <!-- gmail-sync: messageId --> and return set of message IDs.
 */
export function parseGmailSyncMessageIds(comments: Array<{ body: string }>): Set<string> {
  const ids = new Set<string>();
  for (const c of comments) {
    const body = c.body || '';
    let m: RegExpExecArray | null;
    GMAIL_SYNC_MARKER_RE.lastIndex = 0;
    while ((m = GMAIL_SYNC_MARKER_RE.exec(body)) !== null) {
      if (m[1]) ids.add(m[1].trim());
    }
  }
  return ids;
}

/** Max body length for Linear comment (approximate; use snippet if over). */
const MAX_BODY_LENGTH = 8000;

/**
 * Strip HTML from email body: keep only the plain-text part (content before the first HTML tag).
 * Gmail often concatenates text/plain and text/html; we only want the text for Linear comments.
 */
function stripHtmlFromBody(body: string): string {
  const tagStart = body.search(/<\s*(?:div|br|blockquote|span|p|a|ul|li|html|table|tr|td|style|script)/i);
  if (tagStart === -1) return body;
  return body.slice(0, tagStart).trimEnd();
}

/**
 * Format an email as a Linear comment body (markdown) and append hidden gmail-sync marker.
 * Uses plain text only (HTML is stripped so Linear comments stay readable).
 */
export function formatEmailCommentBody(email: Email): string {
  const dateStr = email.receivedDate
    ? new Date(email.receivedDate).toISOString().replace('T', ' ').slice(0, 19)
    : '';
  let bodyContent = stripHtmlFromBody(email.body || email.snippet || '');
  if (bodyContent.length > MAX_BODY_LENGTH) {
    bodyContent = bodyContent.slice(0, MAX_BODY_LENGTH) + '\n\n… (truncated)';
  }
  const lines = [
    `**Subject:** ${email.subject || '(no subject)'}`,
    `**From:** ${email.from || email.fromAddress || ''}`,
    `**Date:** ${dateStr}`,
    '',
    bodyContent,
    '',
    `<!-- gmail-sync: ${email.id} -->`,
  ];
  return lines.join('\n');
}
