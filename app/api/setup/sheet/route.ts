import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { extractSpreadsheetId } from "@/lib/sheets";
import { storeSheetId } from "@/lib/token-store";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get("setup_email")?.value;

    if (!email?.trim()) {
      return NextResponse.json(
        { error: "Complete Gmail sign-in first" },
        { status: 401 }
      );
    }

    let body: { sheet_url?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const sheetUrl = body.sheet_url?.trim();
    if (!sheetUrl) {
      return NextResponse.json(
        { error: "sheet_url is required" },
        { status: 400 }
      );
    }

    let sheetId: string;
    try {
      sheetId = extractSpreadsheetId(sheetUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid Google Sheet URL or ID";
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    storeSheetId(email, sheetId);
    return NextResponse.json({ success: true, sheet_id: sheetId });
  } catch (error) {
    console.error("[setup/sheet] Error:", error);
    return NextResponse.json(
      { error: "Failed to save sheet" },
      { status: 500 }
    );
  }
}
