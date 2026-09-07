import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authedActor } from "@/lib/auth/api-auth";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// A PDF extraction costs a multimodal Gemini call and up to 60s of compute, so
// it is the most expensive thing an anonymous caller could loop. Tighter budget
// than /insights.
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000; // per hour, per user

// Cap the decoded PDF at ~15MB. Without this, one authenticated caller can post
// an arbitrarily large base64 string and the JSON parse alone exhausts memory.
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_B64_CHARS = Math.ceil(MAX_PDF_BYTES / 3) * 4;

// Extracts programme activity rows from a PDF using Gemini (multimodal). Reuses
// the existing GEMINI_API_KEY — no Anthropic key / new dependency required.
//
// Security (L2): authenticated + rate limited. The route holds no tenant data of
// its own, but it spends GEMINI_API_KEY and forwards caller-supplied documents to
// Google, so it must not be reachable anonymously.
export async function POST(req: NextRequest) {
  const actor = await authedActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const limit = rateLimit(`extract-pdf:${actor.userId}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let pdf_base64: unknown;
  try {
    ({ pdf_base64 } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { activities: [], warning: "No GEMINI_API_KEY configured." },
      { status: 200 },
    );
  }
  if (!pdf_base64 || typeof pdf_base64 !== "string") {
    return NextResponse.json({ activities: [] }, { status: 200 });
  }
  if (pdf_base64.length > MAX_B64_CHARS) {
    return NextResponse.json(
      { activities: [], warning: "PDF too large (15MB limit)." },
      { status: 413 },
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generationConfig: any = {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    };
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig,
    });

    const prompt = `You are reading a construction programme PDF. Extract every activity row as JSON.
Schema: [{ "activity_id": string, "name": string, "planned_start": "YYYY-MM-DD", "planned_finish": "YYYY-MM-DD", "wbs_path": string }]
Use the human-readable activity code (e.g. "ELE-COLO-1030") as activity_id. If a date is missing, omit it. Return ONLY a JSON array, no preamble.`;

    const result = (await Promise.race([
      model.generateContent([
        { inlineData: { mimeType: "application/pdf", data: pdf_base64 } },
        { text: prompt },
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 45000),
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ])) as any;

    const text = result.response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { activities: [], warning: "AI returned unparseable output." },
        { status: 200 },
      );
    }
    const activities = Array.isArray(parsed)
      ? parsed
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((parsed as any).activities ?? []);
    return NextResponse.json({ activities, source: "ai" });
  } catch (err) {
    console.error("extract-pdf failed:", err);
    return NextResponse.json(
      { activities: [], warning: "PDF extraction failed." },
      { status: 200 },
    );
  }
}
