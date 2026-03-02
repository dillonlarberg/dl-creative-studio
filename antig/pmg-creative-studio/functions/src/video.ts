import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import axios from "axios";
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Process video cuts for the given timestamps and lengths.
 * This takes the 'config' (start/stop times for each desired cutdown)
 * and generates multiple stitched or cut MP4 files.
 */
export const processVideoCutdowns = functions.https.onCall(async (data: {
    videoUrl: string,
    cuts: Array<{
        length: number,
        id: string,
        segments: Array<{ start: string, end: string }>
    }>
}) => {
    const { videoUrl, cuts } = data;
    if (!videoUrl || !cuts || cuts.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Missing videoUrl or cut specifications.");
    }

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
            const parts = timeStr.split(':').map(Number);
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        };

        for (const cut of cuts) {
            const outputPath = path.join(tempDir, `output_${cut.id}.mp4`);
            functions.logger.info(`Processing stitched cut for ${cut.length}s with ${cut.segments.length} segments.`);

            // 2. Perform FFmpeg stitching
            await new Promise((resolve, reject) => {
                let command = ffmpeg(inputPath);

                // Construct Complex Filter
                // [0:v]trim=start=S:end=E,setpts=PTS-STARTPTS[v0]; [0:a]atrim=start=S:end=E,asetpts=PTS-STARTPTS[a0];
                let filter = "";
                let inputs = "";

                cut.segments.forEach((seg, i) => {
                    const start = timeToSeconds(seg.start);
                    const end = timeToSeconds(seg.end);
                    filter += `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]; `;
                    filter += `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]; `;
                    inputs += `[v${i}][a${i}]`;
                });

                filter += `${inputs}concat=n=${cut.segments.length}:v=1:a=1[v][a]`;

                command
                    .complexFilter(filter)
                    .map('[v]')
                    .map('[a]')
                    .output(outputPath)
                    .on("end", resolve)
                    .on("error", (err) => {
                        console.error(`FFmpeg error for cut ${cut.id}:`, err);
                        reject(err);
                    })
                    .run();
            });

            // 3. Upload cut back to storage
            const destination = `results/${cut.id}_${cut.length}s.mp4`;
            await bucket.upload(outputPath, { destination });
            const file = bucket.file(destination);
            const [url] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });

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
