#!/usr/bin/env node
/**
 * Fetches a Linear issue by identifier (e.g. JOBS-7) and prints its labels.
 * Uses PERSONAL_LINEAR_API_KEY from .env or AWS (run after loadSecretsFromAWS in prod).
 *
 * Usage: bun run scripts/get-linear-issue-labels.ts JOBS-7
 *   or:  bun run scripts/get-linear-issue-labels.ts
 *        (prompts for identifier or uses JOBS-7)
 */
import { config } from 'dotenv';

config();

const API_KEY = process.env.PERSONAL_LINEAR_API_KEY;
if (!API_KEY) {
  console.error('Missing PERSONAL_LINEAR_API_KEY in .env');
  process.exit(1);
}

const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';
const identifier = process.argv[2] ?? 'JOBS-7';

async function listTeams(): Promise<void> {
  const res = await fetch(LINEAR_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY!,
    },
    body: JSON.stringify({
      query: `
        query Teams {
          teams {
            nodes { id name key }
          }
        }
      `,
    }),
  });
  if (!res.ok) {
    console.error('Linear API error:', res.status, await res.text());
    process.exit(1);
  }
  const json = (await res.json()) as {
    data?: { teams: { nodes: Array<{ id: string; name: string; key: string }> } };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    console.error('GraphQL errors:', json.errors);
    process.exit(1);
  }
  const teams = json.data?.teams?.nodes ?? [];
  console.log('Teams:\n');
  for (const t of teams) {
    console.log(`  ${t.key} – ${t.name} (${t.id})`);
  }
  console.log(`\nTotal: ${teams.length} team(s)\n`);
}

async function listTeamIssues(teamKey: string, limit: number = 20): Promise<void> {
  const res = await fetch(LINEAR_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY!,
    },
    body: JSON.stringify({
      query: `
        query TeamIssues($teamKey: String!, $first: Int!) {
          issues(filter: { team: { key: { eq: $teamKey } } }, first: $first) {
            nodes {
              id
              identifier
              title
              state { name }
              labels { nodes { name parent { name } } }
            }
          }
        }
      `,
      variables: { teamKey, first: limit },
    }),
  });
  if (!res.ok) {
    console.error('Linear API error:', res.status, await res.text());
    process.exit(1);
  }
  const json = (await res.json()) as {
    data?: {
      issues: {
        nodes: Array<{
          identifier: string;
          title: string;
          state?: { name: string };
          labels: { nodes: Array<{ name: string; parent?: { name: string } | null }> };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    console.error('GraphQL errors:', json.errors);
    process.exit(1);
  }
  const nodes = json.data?.issues?.nodes ?? [];
  console.log(`Issues in team ${teamKey} (up to ${limit}):\n`);
  if (nodes.length === 0) {
    console.log('  (none)\n');
    return;
  }
  for (const i of nodes) {
    const labelParts = (i.labels?.nodes ?? []).map(
      l => (l.parent?.name ? `${l.parent.name} / ${l.name}` : l.name)
    );
    const labelStr = labelParts.join(', ');
    console.log(`  ${i.identifier} – ${i.title} [${i.state?.name ?? '?'}] ${labelStr ? `(${labelStr})` : ''}`);
  }
  console.log(`\nTotal: ${nodes.length} issue(s)\n`);
}

async function getIssueLabels(issueIdentifier: string): Promise<void> {
  const [teamKey, numStr] = issueIdentifier.split('-');
  const number = parseInt(numStr, 10);
  if (!teamKey || isNaN(number)) {
    console.error('Usage: bun run scripts/get-linear-issue-labels.ts <IDENTIFIER> (e.g. JOBS-7)');
    process.exit(1);
  }

  await listTeamIssues(teamKey, 20);

  const res = await fetch(LINEAR_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY!,
    },
    body: JSON.stringify({
      query: `
        query IssueByTeamAndNumber($teamKey: String!, $number: Float!) {
          issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }, first: 1) {
            nodes {
              id
              identifier
              title
              state { name }
              labels { nodes { name id parent { name } } }
            }
          }
        }
      `,
      variables: { teamKey, number },
    }),
  });

  if (!res.ok) {
    console.error('Linear API error:', res.status, await res.text());
    process.exit(1);
  }

  const json = (await res.json()) as {
    data?: {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          state?: { name: string };
          labels: { nodes: Array<{ name: string; id: string; parent?: { name: string } | null }> };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    console.error('GraphQL errors:', json.errors);
    process.exit(1);
  }

  const nodes = json.data?.issues?.nodes ?? [];
  if (nodes.length === 0) {
    console.log(`No issue found for ${issueIdentifier}. (Team/key or number may not match, or issue may be in another workspace.)`);
    return;
  }

  const issue = nodes[0];
  console.log(`Issue: ${issue.identifier} – ${issue.title}`);
  if (issue.state?.name) console.log(`State: ${issue.state.name}`);
  const labels = issue.labels?.nodes ?? [];
  console.log(`Labels: ${labels.length ? labels.map(l => (l.parent?.name ? `${l.parent.name} / ${l.name}` : l.name)).join(', ') : '(none)'}`);
  labels.forEach(l => {
    const display = l.parent?.name ? `${l.parent.name} / ${l.name}` : l.name;
    console.log(`  - ${display}`);
  });
}

(async () => {
  await listTeams();
  await getIssueLabels(identifier);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
