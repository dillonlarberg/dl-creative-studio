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
        memory: "4GB"
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
            // 1. Download base video once
            functions.logger.info(`Downloading video from ${videoUrl} to ${inputPath}`);
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

            const timeToSeconds = (timeStr: string) => {
                if (!timeStr) return 0;
                const parts = timeStr.split(':').reverse().map(Number);
                let seconds = 0;
                if (parts[0]) seconds += parts[0];
                if (parts[1]) seconds += parts[1] * 60;
                if (parts[2]) seconds += parts[2] * 3600;
                return seconds;
            };

            // 2. Process all cuts in parallel
            const cutdownPromises = cuts.map(async (cut: any) => {
                const outputPath = path.join(tempDir, `output_${cut.id}.mp4`);
                functions.logger.info(`[FFmpeg] Starting parallel cut: ${cut.id} | Length: ${cut.length}s`);

                await new Promise((resolve, reject) => {
                    let command = ffmpeg(inputPath);
                    let filter = "";
                    let inputs = "";

                    cut.segments.forEach((seg: any, i: number) => {
                        const start = Math.max(0, timeToSeconds(seg.start));
                        const end = timeToSeconds(seg.end);
                        if (end <= start) return;

                        filter += `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1[v${i}]; `;
                        filter += `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=44100[a${i}]; `;
                        inputs += `[v${i}][a${i}]`;
                    });

                    const segmentCount = inputs.match(/\[v\d+\]/g)?.length || 0;
                    if (segmentCount === 0) return reject(new Error("No valid segments."));

                    filter += `${inputs}concat=n=${segmentCount}:v=1:a=1[v][a]`;

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
                        .on("end", () => resolve(true))
                        .on("error", reject)
                        .run();
                });

                // 3. Upload cut back to storage
                const destination = `results/${cut.id}_${cut.length}s.mp4`;
                await bucket.upload(outputPath, { destination });
                const file = bucket.file(destination);
                const url = await getDownloadURL(file);

                // Cleanup output file
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                return { length: cut.length, url };
            });

            const results = await Promise.all(cutdownPromises);
            return { status: "success", cutdowns: results };
        } catch (err: any) {
            functions.logger.error("Video processing failed", err);
            throw new functions.https.HttpsError("internal", `FFmpeg processing failed: ${err.message}`);
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        }
    });

/**
 * Maintenance: Clear out all files in results/ and uploads/
 * Use with caution.
 */
export const deleteStorageFiles = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onCall(async (data, context) => {
        // Simple security check: in a real app, check for admin role
        // if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "...");

        const bucket = admin.storage().bucket();
        const folders = ["results/", "uploads/"];
        let deletedCount = 0;

        for (const folder of folders) {
            functions.logger.info(`Cleaning up folder: ${folder}`);
            const [files] = await bucket.getFiles({ prefix: folder });

            for (const file of files) {
                await file.delete();
                deletedCount++;
            }
        }

        return { status: "success", deletedCount };
    });
