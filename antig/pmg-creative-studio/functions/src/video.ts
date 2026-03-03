import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import axios from "axios";
import ffmpegPath from "ffmpeg-static";
import { getDownloadURL } from "firebase-admin/storage";

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Process video cuts for the given timestamps and lengths.
 * This takes the 'config' (start/stop times for each desired cutdown)
 * and generates multiple stitched or cut MP4 files.
 */
export const processVideoCutdowns = functions
    .runWith({
        timeoutSeconds: 540,
        memory: "2GB"
    })
    .https.onCall(async (data: {
        videoUrl: string,
        cuts: Array<{
            length: number,
            id: string,
            segments: Array<{ start: string, end: string }>
        }>
    }) => {
        const { videoUrl, cuts, platform } = data as any;
        if (!videoUrl || !cuts || cuts.length === 0) {
            throw new functions.https.HttpsError("invalid-argument", "Missing videoUrl or cut specifications.");
        }

        const isYoutube = platform?.toLowerCase().includes("youtube");
        const targetWidth = isYoutube ? 1280 : 720;
        const targetHeight = isYoutube ? 720 : 1280;

        functions.logger.info(`[FFmpeg] Platform: ${platform} | Target: ${targetWidth}x${targetHeight}`);

        const bucket = admin.storage().bucket();
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);

        try {
            // 1. Download base video
            functions.logger.info(`Downloading video from ${videoUrl} to ${inputPath}`);
            // For simplicity, we assume we can wget or fetch the file bytes
            // In a real Firebase Storage flow, we'd use bucket.file(path).download()
            // If it's a signed URL, we can use axios.

            const response = await axios({
                method: "GET",
                url: videoUrl,
                responseType: "stream",
            });

            await new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(inputPath);
                response.data.pipe(writer);
                writer.on("finish", () => resolve(true));
                writer.on("error", reject);
            });

            const results = [];

            const timeToSeconds = (timeStr: string) => {
                if (!timeStr) return 0;
                functions.logger.debug(`Parsing time: ${timeStr}`);
                const parts = timeStr.split(':').reverse().map(Number);
                let seconds = 0;
                if (parts[0]) seconds += parts[0];          // seconds
                if (parts[1]) seconds += parts[1] * 60;     // minutes
                if (parts[2]) seconds += parts[2] * 3600;   // hours
                return seconds;
            };

            for (const cut of cuts) {
                const outputPath = path.join(tempDir, `output_${cut.id}.mp4`);
                functions.logger.info(`[FFmpeg] Processing cut: ${cut.id} | Length: ${cut.length}s | Segments: ${cut.segments.length}`);

                // 2. Perform FFmpeg stitching
                await new Promise((resolve, reject) => {
                    let command = ffmpeg(inputPath);

                    // Construct Complex Filter
                    let filter = "";
                    let inputs = "";

                    cut.segments.forEach((seg: any, i: number) => {
                        const start = Math.max(0, timeToSeconds(seg.start));
                        const end = timeToSeconds(seg.end);

                        if (end <= start) {
                            functions.logger.warn(`[FFmpeg] Invalid segment ${i}: start ${start} >= end ${end}. Skipping.`);
                            return;
                        }

                        functions.logger.info(`[FFmpeg] Segment ${i}: ${start}s to ${end}s`);

                        // Standardize to target platform aspect ratio
                        filter += `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1[v${i}]; `;
                        filter += `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=44100[a${i}]; `;
                        inputs += `[v${i}][a${i}]`;
                    });

                    const segmentCount = inputs.match(/\[v\d+\]/g)?.length || 0;
                    if (segmentCount === 0) {
                        reject(new Error("No valid segments to process."));
                        return;
                    }

                    filter += `${inputs}concat=n=${segmentCount}:v=1:a=1[v][a]`;
                    functions.logger.info(`[FFmpeg] Final Filter String: ${filter}`);

                    command
                        .complexFilter(filter)
                        .map('[v]')
                        .map('[a]')
                        .outputOptions([
                            '-c:v libx264',
                            '-preset ultrafast',
                            '-crf 23',
                            '-c:a aac',
                            '-b:a 128k',
                            '-movflags +faststart'
                        ])
                        .output(outputPath)
                        .on("start", (commandLine) => {
                            functions.logger.info(`[FFmpeg] Spawned with command: ${commandLine}`);
                        })
                        .on("progress", (progress) => {
                            functions.logger.debug(`[FFmpeg] Processing: ${progress.percent}% done`);
                        })
                        .on("end", () => {
                            functions.logger.info(`[FFmpeg] Finished processing cut: ${cut.id}`);
                            resolve(true);
                        })
                        .on("error", (err, stdout, stderr) => {
                            functions.logger.error(`[FFmpeg] Error: ${err.message}`);
                            functions.logger.error(`[FFmpeg] stderr: ${stderr}`);
                            reject(err);
                        })
                        .run();
                });

                // 3. Upload cut back to storage
                const destination = `results/${cut.id}_${cut.length}s.mp4`;
                await bucket.upload(outputPath, { destination });
                const file = bucket.file(destination);
                const url = await getDownloadURL(file);

                results.push({ length: cut.length, url });

                // Cleanup
                fs.unlinkSync(outputPath);
            }

            return { status: "success", cutdowns: results };
        } catch (err: any) {
            functions.logger.error("Video processing failed", err);
            throw new functions.https.HttpsError("internal", `FFmpeg processing failed: ${err.message}`);
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        }
    });
