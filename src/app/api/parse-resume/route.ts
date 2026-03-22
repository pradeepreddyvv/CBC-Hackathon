import { NextRequest, NextResponse } from "next/server";

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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      text = buffer.toString("utf-8");
    } else if (file.name.endsWith(".docx")) {
      // Basic DOCX extraction — DOCX is a zip with XML inside
      // Extract text from word/document.xml
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (docXml) {
        // Strip XML tags to get text
        text = docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    } else {
      // Try as plain text
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
