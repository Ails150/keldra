// Keldra brand palette. New baseline/Today/funnel/company code pulls colours
// from here rather than scattering hex literals. Hues match the existing
// globals.css CSS variables where they overlap (purple = --accent, etc.).

export const BRAND = {
  ink: "#1a0f2b",
  inkMuted: "#5a4a72",
  cream: "#faf7fc",
  paperLine: "#e8dcf0",
  paperWhite: "#ffffff",
  paperWarm: "#f5eef9", // matches --paper-warm

  purple: "#8a3dd6",
  purpleDeep: "#5e25a3",

  // Site-map Cx ramp — dark→light purple for the off-site/on-site stages,
  // terminating in `teal` for Green Tag / BU; `dangerInk` flags owner-unclear.
  cxOffsite: "#3a1366",
  cxOnsite: "#a877e0",
  cxPreEnergy: "#c9a6ec",

  border: "#e8dcf0",
  borderStrong: "#dbcce8", // matches --border-soft
  successInk: "#3b6d11",
  successBg: "#eaf3de",
  warningInk: "#854f0b",
  warningBg: "#faeeda",
  dangerInk: "#a32d2d",
  dangerBg: "#fcebeb",
  dangerSoft: "#fcecec", // danger-tinted surface for the gate spine

  // Company hues, per the P6 seed.
  coral: "#e2654b",
  blue: "#2563eb",
  amber: "#ef9f27",
  pink: "#db2777",
  teal: "#0f766e",
  green: "#16a34a",
  slate: "#64748b",
  navy: "#1e3a5f",
  indigo: "#4f46e5",
} as const;

export type BrandColour = keyof typeof BRAND;

export function brand(colour: BrandColour): string {
  return BRAND[colour];
}
