// Dependency chains for MER active blockers. Each chain walks from the
// accountable person down through who *they* are waiting on, to the terminal
// origin. The point of the "Holding back" view: most chains don't stop at the
// sub on site — they trace back to Hyperscale Client sign-off. Seeded for the demo;
// pilot week 1 maps these live.

export type ChainStep = {
  actor: string; // who is waiting
  waitingOn: string; // who/what they're waiting on
  what?: string; // what they need ("for {what}")
  days?: number; // days waiting
  label?: string; // override for non-numeric waits ("14-week lead time", "external")
};

export type Accountable = { name: string; org: string; role: string };

export type Chain = {
  activity_id: string;
  accountable: Accountable;
  steps: ChainStep[];
  terminal: string; // terminal entity name, used for counting
  terminalPerson?: string;
  external?: boolean; // terminal is outside our control
};

export const CHAINS: Chain[] = [
  {
    activity_id: "ELE-COLO-1030",
    accountable: { name: "Site Lead", org: "MEP Sub", role: "Site Lead" },
    steps: [
      { actor: "Site Lead (MEP Sub Site Lead)", waitingOn: "Operations Manager (MEP Sub Operations)", what: "sign-off on bracket spec", days: 19 },
      { actor: "Operations Manager (MEP Sub Operations)", waitingOn: "Design House", what: "clarification on bracket dimensions", days: 30 },
      { actor: "Design House", waitingOn: "Hyperscale Client", what: "sign-off on revised design", days: 45 },
    ],
    terminal: "Hyperscale Client",
    terminalPerson: "Client Sign-off",
  },
  {
    activity_id: "ELE-ADMIN-1020",
    accountable: { name: "Site Lead", org: "MEP Sub", role: "Site Lead" },
    steps: [
      { actor: "Site Lead (MEP Sub Site Lead)", waitingOn: "Operations Manager (MEP Sub Operations)", what: "re-quote", days: 12 },
      { actor: "Operations Manager (MEP Sub Operations)", waitingOn: "Hyperscale Client procurement", what: "PO release", days: 28 },
    ],
    terminal: "Hyperscale Client",
    terminalPerson: "Client Sign-off",
  },
  {
    activity_id: "MEC-COLO-1040",
    accountable: { name: "Design Director", org: "Design House", role: "Design Director" },
    steps: [
      { actor: "Design Director (Design House Director)", waitingOn: "Hyperscale Client", what: "sign-off on Status A", days: 21 },
    ],
    terminal: "Hyperscale Client",
    terminalPerson: "Client Sign-off",
  },
  {
    activity_id: "SEC-COLO-1000",
    accountable: { name: "Design Engineer", org: "Design House", role: "Design Engineer" },
    steps: [
      { actor: "Design Engineer (Design House)", waitingOn: "the Architects", what: "door type approval", days: 18 },
      { actor: "the Architects", waitingOn: "Hyperscale Client", what: "revised security spec", days: 28 },
    ],
    terminal: "Hyperscale Client",
    terminalPerson: "Client Sign-off",
  },
  {
    activity_id: "FAB-ADMIN-1120",
    accountable: { name: "Drawings Lead", org: "Drawings Office", role: "Drawings Lead" },
    steps: [
      { actor: "Drawings Lead (Drawings Lead)", waitingOn: "Design Lead (Design Lead)", what: "lighting spec", days: 21 },
      { actor: "Design Lead (Design Lead)", waitingOn: "Design House", what: "service routing clarification", days: 35 },
      { actor: "Design House", waitingOn: "Hyperscale Client", what: "power loading sign-off", days: 42 },
    ],
    terminal: "Hyperscale Client",
    terminalPerson: "Client Sign-off",
  },
  {
    activity_id: "PRO-1110",
    accountable: { name: "Procurement Lead", org: "Sprinkler Sub", role: "Procurement Lead" },
    steps: [
      { actor: "Procurement Lead (Sprinkler Sub Procurement)", waitingOn: "the manufacturer (supplier)", what: "genset production slot", label: "14-week lead time" },
      { actor: "Supplier", waitingOn: "parts shortage resolution", label: "external" },
    ],
    terminal: "Supplier shortage",
    external: true,
  },
  {
    activity_id: "FAB-2000",
    accountable: { name: "Procurement Lead", org: "Sprinkler Sub", role: "Procurement Lead" },
    steps: [
      { actor: "Procurement Lead (Sprinkler Sub Procurement)", waitingOn: "the supplier", what: "delivery confirmation", days: 8 },
      { actor: "Supplier", waitingOn: "parts shortage resolution", label: "external" },
    ],
    terminal: "Supplier shortage",
    external: true,
  },
];

export function chainFor(activityId: string): Chain | undefined {
  return CHAINS.find((c) => c.activity_id === activityId);
}

// Display label for a chain's terminal origin.
export function terminalLabel(c: Chain): string {
  if (c.external) return `${c.terminal} (external — not a chain we can resolve)`;
  return c.terminalPerson ? `${c.terminal} (${c.terminalPerson})` : c.terminal;
}

// Count how many of the given blockers' chains terminate at each entity.
export function terminalCounts(activityIds: string[]): { entity: string; count: number }[] {
  const m = new Map<string, number>();
  for (const id of activityIds) {
    const c = chainFor(id);
    if (!c) continue;
    m.set(c.terminal, (m.get(c.terminal) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count);
}
