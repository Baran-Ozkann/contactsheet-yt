export interface AuditFinding {
  rule: string;
  what: string;
  match: string;
}

export const FORBIDDEN: ReadonlyArray<{ rule: string; what: string; pattern: RegExp }>;
export const ALLOWED_ORIGINS: readonly string[];
export function isAllowedUrl(url: string): boolean;
export function auditSource(source: string): AuditFinding[];
