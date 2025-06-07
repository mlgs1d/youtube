import { NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

export async function GET() {
  try {
    // Test if ytdl-core is working
    const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Rick Roll for testing
    const isValid = ytdl.validateURL(testUrl);

    return NextResponse.json({
      status: "healthy",
      ytdlWorking: isValid,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
