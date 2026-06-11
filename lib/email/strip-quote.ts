// Strip the quoted reply chain so the task trail shows only the new message.
// A compact heuristic stripper (handles Gmail/Outlook/Apple Mail markers). It's
// deliberately dependency-free; swap in `email-reply-parser` later if needed.
export function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    // "On <date>, <name> wrote:" — may wrap across two lines.
    if (/^On\b.*\bwrote:?$/i.test(t)) break;
    if (/^On\b.*$/i.test(t) && /wrote:?$/i.test((lines[i + 1] ?? "").trim())) break;
    // Outlook / generic headers and dividers.
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(t)) break;
    if (/^_{5,}$/.test(t)) break;
    if (/^From:\s/i.test(t) && out.length > 0) break;
    if (/^Sent from my /i.test(t)) break;
    // Quoted lines.
    if (t.startsWith(">")) continue;

    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
