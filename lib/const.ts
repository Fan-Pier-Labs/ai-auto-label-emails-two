/**
 * AWS Secrets Manager ARNs (single source of truth).
 * deploy.yaml references these same ARNs for IAM/task definitions; keep in sync when changing.
 */
export const APP_SECRETS_ARN =
  'arn:aws:secretsmanager:us-east-2:066949051862:secret:AI_EMAIL_LABELING_APP-6h2UPx';

export const GMAIL_REFRESH_TOKEN_SECRET_ARN =
  'arn:aws:secretsmanager:us-east-2:066949051862:secret:ryan-gmail-refresh-token-iVkQdq';
