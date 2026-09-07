// Single source of truth for the privacy notice: the version stamped onto every
// consent record, and the sub-processor list rendered on /privacy.
//
// Bump PRIVACY_POLICY_VERSION whenever the notice changes materially. Consent is
// recorded against a version, so an old record never silently claims agreement to
// terms the person never saw.

export const PRIVACY_POLICY_VERSION = "2026-09-07.1";
export const PRIVACY_POLICY_EFFECTIVE = "7 September 2026";

export type SubProcessor = {
  name: string;
  purpose: string;
  region: string;
  dataShared: string;
  transferBasis: string;
};

// Regions are the ones actually in use, verified during the September 2026 audit
// — not the vendor's marketing default. If a region changes, change it here.
export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: "Supabase",
    purpose: "Primary database, authentication and file storage",
    region: "eu-west-1 (Ireland)",
    dataShared:
      "All account and project data: names, email addresses, task and blocker records, email content, uploaded files",
    transferBasis: "Stored in the EU — no transfer out",
  },
  {
    name: "Vercel",
    purpose: "Application hosting and serverless execution",
    region: "Serverless compute in Dublin (eu-west); edge routing worldwide",
    dataShared:
      "Data in transit through the application, plus request metadata (IP address, user agent)",
    transferBasis:
      "Compute co-located with the database in the EU; edge routing may terminate TLS outside the UK/EEA under Standard Contractual Clauses",
  },
  {
    name: "Resend",
    purpose: "Outbound chase email and inbound email capture",
    region: "United States",
    dataShared: "Recipient and sender email addresses, subject lines, message bodies, attachments",
    transferBasis: "Standard Contractual Clauses",
  },
  {
    name: "Google (Gemini API)",
    purpose: "Generating project insights and summarising task email threads",
    region: "United States",
    dataShared:
      "Blocker descriptions, asset identifiers, the names of people responsible for work, and email thread content submitted for summarising",
    transferBasis: "Standard Contractual Clauses",
  },
];

// What Keldra holds, why, and for how long. Rendered as the retention table.
export const RETENTION_RULES = [
  {
    category: "Inbound email content (subject and body)",
    period: "12 months from receipt",
    note: "Automatically purged nightly. The record that an email was received, and when, is kept.",
  },
  {
    category: "Account details (name, email address, role)",
    period: "For as long as the account exists",
    note: "Erased on request or when the account is deleted.",
  },
  {
    category: "Commissioning accountability record (blocker events, asset tag events, gate sign-offs)",
    period: "Retained for the life of the project record",
    note:
      "Append-only and cryptographically chained. Retained under Art 17(3)(e) for the establishment, exercise or defence of legal claims; not erased on request. See 'What we cannot erase'.",
  },
  {
    category: "Contact lists, rosters and pending invitations",
    period: "Until removed by the organisation, or on erasure request",
    note: "Deleted outright.",
  },
];
