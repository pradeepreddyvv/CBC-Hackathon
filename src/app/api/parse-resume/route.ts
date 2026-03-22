import { NextRequest, NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (file.name.endsWith(".pdf")) {
      // Use Gemini to extract text from PDF
      const base64 = buffer.toString("base64");
      const prompt = `Extract ALL text content from this PDF document. Return ONLY the raw text content, preserving the original structure (headings, bullet points, sections). Do not add any commentary or formatting — just the extracted text exactly as it appears in the document.`;

      const INSFORGE_URL = process.env.INSFORGE_PROJECT_URL || "";
      const INSFORGE_KEY = process.env.INSFORGE_API_KEY || "";

      const res = await fetch(`${INSFORGE_URL}/api/ai/chat/completion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INSFORGE_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:application/pdf;base64,${base64}` },
                },
              ],
            },
          ],
          max_tokens: 8192,
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        text = data.text || "";
      } else {
        // Fallback: try plain text extraction for simple PDFs
        text = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      }
    } else if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      text = buffer.toString("utf-8");
    } else if (file.name.endsWith(".docx")) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (docXml) {
        text = docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    } else {
      text = buffer.toString("utf-8");
    }

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error("Resume parse error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse resume" },
      { status: 500 }
    );
  }
}
