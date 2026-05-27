export type DetectedType =
  | "p6_xer"
  | "p6_csv"
  | "procore_daily"
  | "sub_returns"
  | "blocker_register"
  | "pdf_programme"
  | "unknown";

export type Detection = {
  detected_type: DetectedType;
  confidence: number;
  hints: string[];
};

export type RawTask = {
  activity_id: string;
  name: string;
  planned_start?: string;
  planned_finish?: string;
  wbs_path?: string;
  responsible_company_name?: string;
  planned_manpower?: number;
};

export type RawBlocker = {
  title: string;
  held_by_company_name?: string;
  affects_room_code?: string;
  days_open?: number;
  cost_per_day?: number;
  affects_bu?: boolean;
};

export type RawDiary = {
  date?: string;
  company_name: string;
  task: string;
  men: number;
};

export type NormalisedPayload = {
  project?: { name?: string; baseline_revision_date?: string };
  companies?: { name: string; role?: string }[];
  rooms?: { code: string; name?: string; tag?: string; target?: string }[];
  tasks?: RawTask[];
  diary?: RawDiary[];
  blockers?: RawBlocker[];
  warnings: string[];
};

export const TYPE_LABEL: Record<DetectedType, string> = {
  p6_xer: "Looks like a Primavera P6 XER export",
  p6_csv: "Looks like a P6 schedule export",
  procore_daily: "Looks like a Procore daily log",
  sub_returns: "Looks like sub manpower returns",
  blocker_register: "Looks like a blocker / constraint register",
  pdf_programme: "PDF programme — will extract via AI",
  unknown: "Unknown — please pick a type",
};
