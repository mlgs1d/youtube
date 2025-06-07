"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Download,
  Play,
  Clock,
  Eye,
  ThumbsUp,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import Image from "next/image";

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  likes: string;
  author: string;
  formats: Array<{
    quality: string;
    format: string;
    filesize: string;
    itag?: number;
    videoItag?: number;
    audioItag?: number;
    isHighQuality?: boolean;
    hasAudio?: boolean;
    hasVideo?: boolean;
  }>;
}

export default function YouTubeDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");

  const analyzeVideo = async () => {
    if (!url.trim()) {
      setError("Please enter a YouTube URL");
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      setError("Please enter a valid YouTube URL");
      return;
    }

    setLoading(true);
    setError("");
    setVideoInfo(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze video");
      }

      setVideoInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadVideo = async (format: any) => {
    setDownloading(true);
    setError("");
    setDownloadProgress(0);
    setDownloadStatus("Preparing download...");

    try {
      await downloadStandardVideo(format);
    } catch (err) {
      console.error("Download error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Download failed. Please try again."
      );
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus("");
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadStandardVideo = async (format: any) => {
    setDownloadStatus("Processing video...");
    setDownloadProgress(10);

    const response = await fetch("/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, format }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Download failed");
    }

    setDownloadStatus("Downloading...");
    setDownloadProgress(50);

    // Get the filename from the response headers
    const contentDisposition = response.headers.get("content-disposition");
    let filename = `${videoInfo?.title || "video"}.${format.format}`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    setDownloadProgress(80);
    const blob = await response.blob();

    setDownloadStatus("Finalizing...");
    setDownloadProgress(95);

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);

    setDownloadProgress(100);
    setDownloadStatus("Download complete!");
  };

  const isValidYouTubeUrl = (url: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              YouTube Downloader
            </h1>
            <p className="text-slate-400">
              Download YouTube videos in various qualities
            </p>
          </div>

          {/* Disclaimer */}
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-200">
              Please ensure you have permission to download the content and
              comply with YouTube&apos;s Terms of Service.
            </AlertDescription>
          </Alert>

          {/* URL Input */}
          <Card className="mb-6 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Enter YouTube URL</CardTitle>
              <CardDescription className="text-slate-400">
                Paste the YouTube video URL you want to download
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
                <Button
                  onClick={analyzeVideo}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loading ? "Analyzing..." : "Analyze"}
                </Button>
              </div>
              {error && (
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertDescription className="text-red-200">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Video Information */}
          {videoInfo && (
            <Card className="mb-6 bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Video Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-shrink-0">
                    <Image
                      src={videoInfo.thumbnail || "/placeholder.svg"}
                      alt="Video thumbnail"
                      width={320}
                      height={180}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <h3 className="text-xl font-semibold text-white line-clamp-2">
                      {videoInfo.title}
                    </h3>
                    <p className="text-slate-400">by {videoInfo.author}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {videoInfo.duration}
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        {videoInfo.views}
                      </div>
                      <div className="flex items-center gap-1">
                        <ThumbsUp className="w-4 h-4" />
                        {videoInfo.likes}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Download Options */}
          {videoInfo && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Download Options</CardTitle>
                <CardDescription className="text-slate-400">
                  Choose your preferred quality and format
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {videoInfo.formats.map((format, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 border border-slate-600"
                    >
                      <div className="flex items-center gap-3">
                        <Play className="w-5 h-5 text-slate-400" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {format.quality}
                            </span>
                            <Badge
                              variant="secondary"
                              className="bg-slate-600 text-slate-200"
                            >
                              {format.format.toUpperCase()}
                            </Badge>
                            {format.isHighQuality && (
                              <Badge className="bg-green-600 text-white">
                                High Quality
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-400">
                            Estimated size: {format.filesize}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => downloadVideo(format)}
                        disabled={downloading}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {downloading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        {downloading ? "Processing..." : "Download"}
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Download Progress */}
                {downloading && (
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>{downloadStatus}</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <Progress value={downloadProgress} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="text-center mt-8 text-slate-500 text-sm">
            Developed by Saeed
          </div>
        </div>
      </div>
    </div>
  );
}
