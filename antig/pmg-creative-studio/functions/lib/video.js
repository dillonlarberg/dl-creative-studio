"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoCutdowns = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const storage_1 = require("firebase-admin/storage");
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
/**
 * Process video cuts for the given timestamps and lengths.
 * This takes the 'config' (start/stop times for each desired cutdown)
 * and generates multiple stitched or cut MP4 files.
 */
exports.processVideoCutdowns = functions
    .runWith({
    timeoutSeconds: 540,
    memory: "2GB"
})
    .https.onCall(async (data) => {
    const { videoUrl, cuts, platform } = data;
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
        const response = await (0, axios_1.default)({
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
        const timeToSeconds = (timeStr) => {
            if (!timeStr)
                return 0;
            functions.logger.debug(`Parsing time: ${timeStr}`);
            const parts = timeStr.split(':').reverse().map(Number);
            let seconds = 0;
            if (parts[0])
                seconds += parts[0]; // seconds
            if (parts[1])
                seconds += parts[1] * 60; // minutes
            if (parts[2])
                seconds += parts[2] * 3600; // hours
            return seconds;
        };
        for (const cut of cuts) {
            const outputPath = path.join(tempDir, `output_${cut.id}.mp4`);
            functions.logger.info(`[FFmpeg] Processing cut: ${cut.id} | Length: ${cut.length}s | Segments: ${cut.segments.length}`);
            // 2. Perform FFmpeg stitching
            await new Promise((resolve, reject) => {
                let command = (0, fluent_ffmpeg_1.default)(inputPath);
                // Construct Complex Filter
                let filter = "";
                let inputs = "";
                cut.segments.forEach((seg, i) => {
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
            const url = await (0, storage_1.getDownloadURL)(file);
            results.push({ length: cut.length, url });
            // Cleanup
            fs.unlinkSync(outputPath);
        }
        return { status: "success", cutdowns: results };
    }
    catch (err) {
        functions.logger.error("Video processing failed", err);
        throw new functions.https.HttpsError("internal", `FFmpeg processing failed: ${err.message}`);
    }
    finally {
        if (fs.existsSync(inputPath))
            fs.unlinkSync(inputPath);
    }
});
//# sourceMappingURL=video.js.map