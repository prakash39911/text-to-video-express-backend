import axios from "axios";
import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";
import { cloudinary } from "../lib/cloudinary";

export const handleMergeVideoAndAudio = async (req: Request, res: Response) => {
  const { videoUrl, audioUrl } = req.body;

  if (!videoUrl || !audioUrl) {
    res.status(400).json({
      error: "Both videoUrl and audioUrl are required",
    });
    return;
  }

  if (!fs.existsSync("temp")) {
    fs.mkdirSync("temp");
  }

  const uniqueId = uuidv4();
  // Fix: Use generic extensions since we don't know the actual format
  const tempVideoPath = path.join("temp", `video_${uniqueId}.tmp`);
  const tempAudioPath = path.join("temp", `audio_${uniqueId}.tmp`);
  const outputPath = path.join("temp", `merged_${uniqueId}.mp4`);

  try {
    console.log("Starting merge process...");

    // Step 1: Download video and audio files
    console.log("Downloading video...");
    await downloadFile(videoUrl, tempVideoPath);

    console.log("Downloading audio...");
    await downloadFile(audioUrl, tempAudioPath);

    // Step 2: Merge audio and video
    console.log("Merging audio and video...");
    await mergeAudioVideo(tempVideoPath, tempAudioPath, outputPath);

    // Step 3: Upload to Cloudinary
    console.log("Uploading to Cloudinary...");
    const cloudinaryResult = await uploadToCloudinary(outputPath);

    // Step 4: Clean up temporary files
    cleanupFiles([tempVideoPath, tempAudioPath, outputPath]);

    console.log("Merge completed successfully!");

    res.json({
      success: true,
      message: "Audio and video merged and uploaded successfully",
      cloudinary: {
        url: cloudinaryResult.secure_url,
        public_id: cloudinaryResult.public_id,
        duration: cloudinaryResult.duration,
        format: cloudinaryResult.format,
        bytes: cloudinaryResult.bytes,
      },
    });
  } catch (error: any) {
    console.error("Merge process failed:", error);

    // Clean up any remaining temporary files
    cleanupFiles([tempVideoPath, tempAudioPath, outputPath]);

    res.status(500).json({
      success: false,
      error: "Failed to merge audio and video",
      details: error.message,
    });
    return;
  }
};

//Helper Functions---

async function downloadFile(url: string, filepath: string): Promise<void> {
  try {
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
      timeout: 30000, // 30 second timeout
    });

    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);

    return new Promise<void>((resolve, reject) => {
      writer.on("finish", () => resolve());
      writer.on("error", (error: Error) => reject(error));

      // Add timeout handling
      const timeout = setTimeout(() => {
        writer.destroy();
        reject(new Error("Download timeout"));
      }, 60000); // 1 minute timeout

      writer.on("finish", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch (error: any) {
    throw new Error(`Failed to download file from ${url}: ${error.message}`);
  }
}

function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if FFmpeg is available
    const ffmpegCheck = spawn("ffmpeg", ["-version"]);
    ffmpegCheck.on("error", () => {
      reject(new Error("FFmpeg is not installed or not available in PATH"));
      return;
    });

    // Improved FFmpeg command with better error handling
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      videoPath, // Input video
      "-i",
      audioPath, // Input audio
      "-c:v",
      "copy", // Copy video without re-encoding
      "-c:a",
      "aac", // Audio codec
      "-b:a",
      "192k", // Audio bitrate
      "-shortest", // Match shortest duration
      "-avoid_negative_ts",
      "make_zero",
      "-fflags",
      "+genpts", // Generate presentation timestamps
      "-movflags",
      "+faststart", // Optimize for web streaming
      "-y", // Overwrite output file
      outputPath,
    ]);

    let stderr = "";
    let stdout = "";

    ffmpeg.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // Add timeout for FFmpeg process
    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      reject(new Error("FFmpeg process timeout"));
    }, 300000); // 5 minutes timeout

    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        // Verify output file exists and has content
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(outputPath);
        } else {
          reject(new Error("Output file was not created or is empty"));
        }
      } else {
        reject(new Error(`FFmpeg failed with code ${code}. Error: ${stderr}`));
      }
    });

    ffmpeg.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`FFmpeg spawn error: ${error.message}`));
    });
  });
}

async function uploadToCloudinary(filePath: string) {
  try {
    // Verify file exists before upload
    if (!fs.existsSync(filePath)) {
      throw new Error("Output file does not exist");
    }

    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) {
      throw new Error("Output file is empty");
    }

    console.log(`Uploading file of size: ${fileStats.size} bytes`);

    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: "video",
      folder: "/text-to-video/finalVideo",
    });

    return result;
  } catch (error: any) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
}

/**
 * Clean up temporary files safely
 */
function cleanupFiles(files: string[]) {
  files.forEach((file) => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Cleaned up: ${file}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup file ${file}:`, error);
    }
  });
}
