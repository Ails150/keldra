// Keldra brand palette. New baseline/Today/funnel/company code pulls colours
// from here rather than scattering hex literals. Hues match the existing
// globals.css CSS variables where they overlap (purple = --accent, etc.).

export const BRAND = {
  ink: "#1a0f2b",
  inkMuted: "#5a4a72",
  cream: "#faf7fc",
  paperLine: "#e8dcf0",

  purple: "#8a3dd6",
  purpleDeep: "#5e25a3",

  // Company hues, per the P6 seed.
  coral: "#e2654b",
  blue: "#2563eb",
  amber: "#ef9f27",
  pink: "#db2777",
  teal: "#0f766e",
  green: "#16a34a",
  slate: "#64748b",
  navy: "#1e3a5f",
} as const;

export type BrandColour = keyof typeof BRAND;

export function brand(colour: BrandColour): string {
  return BRAND[colour];
}
