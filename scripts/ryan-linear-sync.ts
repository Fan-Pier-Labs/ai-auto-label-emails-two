/**
 * Runs the email processing loop with Linear sync: for each email, optionally run
 * Ryan rules (or just fetch headers in linear-sync-only mode), then post to
 * matching Linear issues by from-address/domain.
 */
import { createComment, formatEmailCommentBody } from '../lib/linear';
import type { Email } from '../lib/types';

export interface RunEmailLoopWithLinearSyncOptions {
  /** Email IDs to process. */
  toProcess: string[];
  dryRun: boolean;
  linearSyncOnly: boolean;
  /** Optional set to mark processed IDs (mutated when linearSyncOnly). */
  processedIds?: Set<string>;
  /** email/domain (lowercase) → issue IDs. */
  reverseIndex: Map<string, string[]>;
  /** issue ID → set of already-posted message IDs (mutated). */
  processedIdsByIssue: Map<string, Set<string>>;
  /** Fetch/process one email and return the Email for Linear sync. */
  processOneEmail: (emailId: string) => Promise<Email | undefined>;
}

/**
 * For each email in toProcess: call processOneEmail, then if the email matches
 * any Linear issue (by from-address or domain), post it as a comment with dedup.
 */
export async function runEmailLoopWithLinearSync(
  options: RunEmailLoopWithLinearSyncOptions
): Promise<void> {
  const {
    toProcess,
    dryRun,
    linearSyncOnly,
    processedIds,
    reverseIndex,
    processedIdsByIssue,
    processOneEmail,
  } = options;

  for (let i = 0; i < toProcess.length; i++) {
    const emailId = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}]`);
    try {
      const email = await processOneEmail(emailId);
      if (linearSyncOnly) {
        processedIds?.add(emailId);
      }

      if (reverseIndex.size > 0 && email) {
        const fromAddress = email.fromAddress?.toLowerCase() ?? '';
        const fromDomain = email.fromDomain?.toLowerCase() ?? '';
        const issueIds = new Set<string>([
          ...(reverseIndex.get(fromAddress) ?? []),
          ...(reverseIndex.get(fromDomain) ?? []),
        ]);
        for (const issueId of issueIds) {
          const already = processedIdsByIssue.get(issueId)?.has(emailId);
          if (already) continue;
          if (dryRun) {
            console.log(`   [Linear DRY RUN] Would post email to issue ${issueId}`);
          } else {
            try {
              const body = formatEmailCommentBody(email);
              await createComment(issueId, body);
              console.log(`   [Linear] Posted email to issue ${issueId}`);
            } catch (linearErr: unknown) {
              const msg = linearErr instanceof Error ? linearErr.message : String(linearErr);
              console.error(`   [Linear] Failed to post to issue ${issueId}: ${msg}`);
            }
          }
          let set = processedIdsByIssue.get(issueId);
          if (!set) {
            set = new Set<string>();
            processedIdsByIssue.set(issueId, set);
          }
          set.add(emailId);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Error: ${msg}`);
    }
  }
}
