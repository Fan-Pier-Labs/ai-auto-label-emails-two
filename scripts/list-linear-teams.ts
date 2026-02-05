#!/usr/bin/env node
/**
 * Loads PERSONAL_LINEAR_API_KEY from .env and prints the teams in the Linear account.
 * Usage: bun run scripts/list-linear-teams.ts
 */
import { config } from 'dotenv';

config();

const API_KEY = process.env.PERSONAL_LINEAR_API_KEY;
if (!API_KEY) {
  console.error('Missing PERSONAL_LINEAR_API_KEY in .env');
  process.exit(1);
}

const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

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
            nodes {
              id
              name
              key
            }
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
  console.log('Teams in account:\n');
  for (const t of teams) {
    console.log(`  ${t.key} – ${t.name} (${t.id})`);
  }
  console.log(`\nTotal: ${teams.length} team(s)`);
}

listTeams().catch((err) => {
  console.error(err);
  process.exit(1);
});
