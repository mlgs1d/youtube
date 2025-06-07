import { type NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Get video info
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;

    // Process available formats - remove duplicates and include all qualities
    const allFormats = new Map();

    // Add combined formats (video+audio) - typically limited to lower resolutions
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const combinedFormats = info.formats
      .filter(
        (format) => format.hasVideo && format.hasAudio && format.qualityLabel
      )
      .forEach((format) => {
        const quality = format.qualityLabel || format.quality || "Unknown";
        const key = `${quality}_combined`;
        const resolution = extractResolution(quality);

        if (!allFormats.has(key)) {
          allFormats.set(key, {
            quality: quality,
            format: format.container || "mp4",
            filesize: format.contentLength
              ? `~${Math.round(
                  Number.parseInt(format.contentLength) / (1024 * 1024)
                )} MB`
              : estimateFileSize(resolution, false),
            itag: format.itag,
            mimeType: format.mimeType,
            hasAudio: true,
            hasVideo: true,
            isHighQuality: false, // Combined formats are never marked as high quality
            resolution: resolution,
          });
        }
      });

    // Add high-quality formats (video-only + audio) - for better quality
    // Get best video-only formats for each quality
    const videoOnlyFormats = info.formats
      .filter(
        (format) =>
          format.hasVideo &&
          !format.hasAudio &&
          format.container === "mp4" &&
          format.qualityLabel
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((acc: any[], format) => {
        const quality = format.qualityLabel;
        const existing = acc.find((f) => f.qualityLabel === quality);
        if (
          !existing ||
          (format.bitrate && format.bitrate > existing.bitrate)
        ) {
          return [...acc.filter((f) => f.qualityLabel !== quality), format];
        }
        return acc;
      }, []);

    // Get best audio format
    const bestAudioFormat = info.formats
      .filter((format) => !format.hasVideo && format.hasAudio)
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];

    // Create high-quality options by combining video-only with best audio
    if (bestAudioFormat) {
      videoOnlyFormats.forEach((videoFormat) => {
        const quality = videoFormat.qualityLabel;
        const resolution = extractResolution(quality);
        const key = `${quality}_high`;

        // Only mark as high quality if resolution is 1080p or higher
        const isHighQuality = resolution >= 1080;

        if (!allFormats.has(key)) {
          const estimatedVideoSize = videoFormat.contentLength
            ? Math.round(
                Number.parseInt(videoFormat.contentLength) / (1024 * 1024)
              )
            : estimateVideoSize(resolution);
          const estimatedAudioSize = bestAudioFormat.contentLength
            ? Math.round(
                Number.parseInt(bestAudioFormat.contentLength) / (1024 * 1024)
              )
            : 3;

          allFormats.set(key, {
            quality: isHighQuality ? `${quality} (High Quality)` : quality,
            format: "mp4",
            filesize: `~${estimatedVideoSize + estimatedAudioSize} MB`,
            videoItag: videoFormat.itag,
            audioItag: bestAudioFormat.itag,
            mimeType: videoFormat.mimeType,
            hasAudio: true,
            hasVideo: true,
            isHighQuality: isHighQuality,
            resolution: resolution,
          });
        }
      });
    }

    // Add audio-only option
    if (bestAudioFormat) {
      allFormats.set("audio_only", {
        quality: "Audio Only",
        format: "mp3",
        filesize: bestAudioFormat.contentLength
          ? `~${Math.round(
              Number.parseInt(bestAudioFormat.contentLength) / (1024 * 1024)
            )} MB`
          : "~3 MB",
        itag: bestAudioFormat.itag,
        mimeType: bestAudioFormat.mimeType,
        hasAudio: true,
        hasVideo: false,
        isHighQuality: false,
        resolution: 0,
      });
    }

    // Convert map to array and sort by quality
    const formats = Array.from(allFormats.values()).sort((a, b) => {
      // Audio only at the end
      if (a.quality === "Audio Only" && b.quality !== "Audio Only") return 1;
      if (a.quality !== "Audio Only" && b.quality === "Audio Only") return -1;

      // Sort by resolution (highest first)
      if (a.resolution !== b.resolution) {
        return b.resolution - a.resolution;
      }

      // High quality formats first for same resolution
      if (a.isHighQuality && !b.isHighQuality) return -1;
      if (!a.isHighQuality && b.isHighQuality) return 1;

      return 0;
    });

    const videoInfo = {
      title: videoDetails.title,
      thumbnail:
        videoDetails.thumbnails?.[videoDetails.thumbnails.length - 1]?.url ||
        "/placeholder.svg?height=180&width=320",
      duration: formatDuration(Number.parseInt(videoDetails.lengthSeconds)),
      views: formatNumber(Number.parseInt(videoDetails.viewCount)),
      likes: videoDetails.likes ? formatNumber(videoDetails.likes) : "N/A",
      author: videoDetails.author.name,
      formats: formats,
    };

    return NextResponse.json(videoInfo);
  } catch (error) {
    console.error("Error analyzing video:", error);

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
    }

    return NextResponse.json(
      { error: "Failed to analyze video. Please check the URL and try again." },
      { status: 500 }
    );
  }
}

function extractResolution(qualityLabel: string): number {
  const match = qualityLabel.match(/(\d+)p/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function estimateVideoSize(resolution: number): number {
  // Rough estimates based on typical video bitrates
  const estimates: { [key: number]: number } = {
    144: 2,
    240: 4,
    360: 8,
    480: 15,
    720: 25,
    1080: 50,
    1440: 80,
    2160: 150, // 4K
  };
  return estimates[resolution] || 10;
}

function estimateFileSize(resolution: number, isHighQuality: boolean): string {
  const videoSize = estimateVideoSize(resolution);
  const audioSize = 3;
  const totalSize = isHighQuality ? videoSize + audioSize : videoSize;
  return `~${totalSize} MB`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
