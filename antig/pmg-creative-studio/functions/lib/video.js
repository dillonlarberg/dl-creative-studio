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
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
/**
 * Process video cuts for the given timestamps and lengths.
 * This takes the 'config' (start/stop times for each desired cutdown)
 * and generates multiple stitched or cut MP4 files.
 */
exports.processVideoCutdowns = functions.https.onCall(async (data) => {
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
            const parts = timeStr.split(':').map(Number);
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        };
        for (const cut of cuts) {
            const outputPath = path.join(tempDir, `output_${cut.id}.mp4`);
            functions.logger.info(`Processing stitched cut for ${cut.length}s with ${cut.segments.length} segments.`);
            // 2. Perform FFmpeg stitching
            await new Promise((resolve, reject) => {
                let command = (0, fluent_ffmpeg_1.default)(inputPath);
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