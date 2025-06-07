import { type NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import { spawn } from "child_process";

export const maxDuration = 300; // 5 minutes timeout

export async function POST(request: NextRequest) {
  try {
    const { url, format } = await request.json();

    if (!url || !format) {
      return NextResponse.json(
        { error: "URL and format are required" },
        { status: 400 }
      );
    }

    if (!ytdl.validateURL(url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Get video info
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    const sanitizedTitle = videoDetails.title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .substring(0, 100); // Limit filename length

    // Handle different download scenarios
    if (format.isHighQuality) {
      // For high quality, merge video and audio on server
      return await handleHighQualityDownload(
        url,
        info,
        format,
        sanitizedTitle,
        videoDetails
      );
    } else if (format.quality === "Audio Only") {
      // Audio only download
      return await handleAudioOnlyDownload(
        url,
        info,
        format,
        sanitizedTitle,
        videoDetails
      );
    } else {
      // Standard combined video+audio download
      return await handleStandardDownload(
        url,
        info,
        format,
        sanitizedTitle,
        videoDetails
      );
    }
  } catch (error) {
    console.error("Error downloading video:", error);

    if (error instanceof Error) {
      if (error.message.includes("Video unavailable")) {
        return NextResponse.json(
          { error: "Video is unavailable or private" },
          { status: 404 }
        );
      }
      if (error.message.includes("age-restricted")) {
        return NextResponse.json(
          { error: "Video is age-restricted" },
          { status: 403 }
        );
      }
      if (error.message.includes("Sign in to confirm")) {
        return NextResponse.json(
          { error: "Video requires sign-in to access" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to download video. Please try again." },
      { status: 500 }
    );
  }
}

async function handleStandardDownload(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: any,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoDetails: any
) {
  // Find the requested format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedFormat = info.formats.find((f: any) => f.itag === format.itag);

  if (!selectedFormat) {
    return NextResponse.json(
      { error: "Requested format not found" },
      { status: 404 }
    );
  }

  // Create a readable stream
  const videoStream = ytdl(url, {
    format: selectedFormat,
    quality: selectedFormat.itag,
  });

  // Set up response headers
  const filename = `${videoDetails.title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")}.${format.format}`;
  const headers = new Headers({
    "Content-Type": format.format === "mp3" ? "audio/mpeg" : "video/mp4",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-cache",
  });

  // If we have content length, add it to headers
  if (selectedFormat.contentLength) {
    headers.set("Content-Length", selectedFormat.contentLength);
  }

  // Create a ReadableStream from the ytdl stream
  const readableStream = new ReadableStream({
    start(controller) {
      videoStream.on("data", (chunk) => {
        controller.enqueue(chunk);
      });

      videoStream.on("end", () => {
        controller.close();
      });

      videoStream.on("error", (error) => {
        console.error("Stream error:", error);
        controller.error(error);
      });
    },
    cancel() {
      videoStream.destroy();
    },
  });

  return new NextResponse(readableStream, { headers });
}

async function handleAudioOnlyDownload(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: any,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoDetails: any
) {
  // Find the requested audio format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedFormat = info.formats.find((f: any) => f.itag === format.itag);

  if (!selectedFormat) {
    return NextResponse.json(
      { error: "Requested audio format not found" },
      { status: 404 }
    );
  }

  // Create a readable stream
  const audioStream = ytdl(url, {
    format: selectedFormat,
    quality: selectedFormat.itag,
  });

  // Set up response headers
  const filename = `${videoDetails.title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")}.mp3`;
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-cache",
  });

  // If we have content length, add it to headers
  if (selectedFormat.contentLength) {
    headers.set("Content-Length", selectedFormat.contentLength);
  }

  // Create a ReadableStream from the ytdl stream
  const readableStream = new ReadableStream({
    start(controller) {
      audioStream.on("data", (chunk) => {
        controller.enqueue(chunk);
      });

      audioStream.on("end", () => {
        controller.close();
      });

      audioStream.on("error", (error) => {
        console.error("Stream error:", error);
        controller.error(error);
      });
    },
    cancel() {
      audioStream.destroy();
    },
  });

  return new NextResponse(readableStream, { headers });
}

async function handleHighQualityDownload(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: any,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoDetails: any
) {
  // Find the video format
  const videoFormat = info.formats.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any) => f.itag === format.videoItag
  );
  // Find the audio format
  const audioFormat = info.formats.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any) => f.itag === format.audioItag
  );

  if (!videoFormat || !audioFormat) {
    return NextResponse.json(
      { error: "Requested formats not found" },
      { status: 404 }
    );
  }

  try {
    // Create streams for video and audio
    const videoStream = ytdl(url, { format: videoFormat });
    const audioStream = ytdl(url, { format: audioFormat });

    // Use FFmpeg to merge streams
    const ffmpegProcess = spawn(
      "ffmpeg",
      [
        "-i",
        "pipe:3", // Video input
        "-i",
        "pipe:4", // Audio input
        "-c:v",
        "copy", // Copy video codec
        "-c:a",
        "aac", // Convert audio to AAC
        "-f",
        "mp4", // Output format
        "-movflags",
        "frag_keyframe+empty_moov", // Enable streaming
        "pipe:1", // Output to stdout
      ],
      {
        stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
      }
    );

    // Pipe video and audio streams to FFmpeg
    videoStream.pipe(ffmpegProcess.stdio[3] as NodeJS.WritableStream);
    audioStream.pipe(ffmpegProcess.stdio[4] as NodeJS.WritableStream);

    // Set up response headers
    const filename = `${videoDetails.title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")}.mp4`;
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    });

    // Create a ReadableStream from FFmpeg output
    const readableStream = new ReadableStream({
      start(controller) {
        ffmpegProcess.stdout?.on("data", (chunk) => {
          controller.enqueue(chunk);
        });

        ffmpegProcess.stdout?.on("end", () => {
          controller.close();
        });

        ffmpegProcess.on("error", (error) => {
          console.error("FFmpeg error:", error);
          controller.error(error);
        });

        ffmpegProcess.stderr?.on("data", (data) => {
          console.log("FFmpeg stderr:", data.toString());
        });
      },
      cancel() {
        ffmpegProcess.kill();
        videoStream.destroy();
        audioStream.destroy();
      },
    });

    return new NextResponse(readableStream, { headers });
  } catch (error) {
    console.error("Error in high quality download:", error);
    return NextResponse.json(
      { error: "Failed to process high quality video" },
      { status: 500 }
    );
  }
}
