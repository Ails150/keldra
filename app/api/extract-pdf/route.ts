import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Extracts programme activity rows from a PDF using Gemini (multimodal). Reuses
// the existing GEMINI_API_KEY — no Anthropic key / new dependency required.
export async function POST(req: NextRequest) {
  const { pdf_base64 } = await req.json();
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
