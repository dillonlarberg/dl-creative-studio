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
        const inputPath = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp4`);

        try {
            functions.logger.info(`[FFmpeg] Received ${cuts?.length || 0} cuts to process.`);
            functions.logger.info(`[FFmpeg] Full Cuts Data: ${JSON.stringify(cuts)}`);

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
                if (!timeStr || typeof timeStr !== "string") return 0;
                const parts = timeStr.trim().split(':').reverse().map(p => {
                    const n = parseFloat(p);
                    return isNaN(n) ? 0 : n;
                });
                let seconds = 0;
                if (parts[0]) seconds += parts[0];
                if (parts[1]) seconds += parts[1] * 60;
                if (parts[2]) seconds += parts[2] * 3600;
                return seconds;
            };

            // 2. Process all cuts SEQUENTIALLY to prevent OOM/CPU throttling
            const results = [];
            for (const cut of cuts) {
                const outputPath = path.join(tempDir, `output_${cut.id}.mp4`);
                functions.logger.info(`[FFmpeg] Starting sequential cut: ${cut.id} | Length: ${cut.length}s`);

                // Unified logic for joint A/V segments
                const segments = cut.segments || cut.videoTrack || [];

                await new Promise((resolve, reject) => {
                    let command = ffmpeg(inputPath);
                    let filter = "";
                    let vInputs = "";
                    let aInputs = "";
                    let validCount = 0;

                    segments.forEach((seg: any) => {
                        const start = Math.max(0, timeToSeconds(seg.start));
                        const end = timeToSeconds(seg.end);
                        if (end <= start) return;

                        const i = validCount;
                        const duration = end - start;
                        const fadeLen = Math.min(0.05, duration / 2);

                        // Normalization for reliable concat
                        filter += `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,format=yuv420p[v${i}]; `;
                        vInputs += `[v${i}]`;

                        // Audio with full normalization + cross-segment awareness
                        const prevSeg = segments[validCount - 1];
                        const nextSeg = segments[validCount + 1];
                        const isPrevContiguous = prevSeg && Math.abs(start - timeToSeconds(prevSeg.end || prevSeg.stop)) < 0.05;
                        const isNextContiguous = nextSeg && Math.abs(timeToSeconds(nextSeg.start || nextSeg.startTime) - end) < 0.05;

                        const inFade = (i === 0 || !isPrevContiguous) ? `,afade=t=in:st=0:d=${fadeLen}` : "";
                        const outFade = isNextContiguous ? "" : `,afade=t=out:st=${Math.max(0, duration - fadeLen)}:d=${fadeLen}`;

                        filter += `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${inFade}${outFade},aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]; `;
                        aInputs += `[a${i}]`;

                        validCount++;
                    });

                    if (validCount === 0) return reject(new Error("No valid segments for sync processing."));

                    filter += `${vInputs}concat=n=${validCount}:v=1:a=0[v]; `;
                    filter += `${aInputs}concat=n=${validCount}:v=0:a=1[a]`;

                    functions.logger.info(`[FFmpeg] Generated Sync-Filter: ${filter}`);

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
                        .on("start", (cmd) => functions.logger.info(`[FFmpeg] Spawned command for cut ${cut.id} (length: ${cut.length}s): ${cmd}`))
                        .on("progress", (p) => functions.logger.debug(`[FFmpeg] Processing cut ${cut.id}: ${p.percent}% done`))
                        .on("end", () => {
                            functions.logger.info(`[FFmpeg] Finished processing cut ${cut.id}`);
                            resolve(true);
                        })
                        .on("error", (err) => {
                            functions.logger.error(`FFmpeg error for cut ${cut.id}:`, err);
                            reject(err);
                        })
                        .run();
                });

                // 3. Upload cut back to storage
                const destination = `results/${cut.id}_${cut.length}s.mp4`;
                await bucket.upload(outputPath, { destination });
                const file = bucket.file(destination);
                const url = await getDownloadURL(file);

                // Cleanup output file
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                results.push({ length: cut.length, url });
            }

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
