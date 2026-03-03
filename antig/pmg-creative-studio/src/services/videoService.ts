import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

export interface VideoCutdownRecco {
    length: number;
    options: Array<{
        id: number;
        reason: string;
        segments: Array<{ start: string, end: string }>;
    }>;
}

export const videoService = {
    /**
     * Call the Firebase Function to analyze a video and get cutdown recommendations.
     */
    async getCutdownRecommendations(videoUrl: string, targetLengths: number[], model: string = "gemini-3-pro-preview"): Promise<VideoCutdownRecco[]> {
        const analyzeVideo = httpsCallable(functions, "analyzeVideoForCutdowns", { timeout: 600000 });
        const result = await analyzeVideo({ videoUrl, targetLengths, model });
        const data = result.data as any;

        if (data.status === "success") {
            return data.recommendations;
        } else {
            throw new Error("Failed to get video recommendations.");
        }
    },

    /**
     * Call the Firebase Function to perform the actual cutting and stitching.
     */
    async processCutdowns(videoUrl: string, cuts: Array<{
        length: number,
        id: string,
        segments: Array<{ start: string, end: string }>
    }>, platform?: string): Promise<any> {
        const processCuts = httpsCallable(functions, "processVideoCutdowns", { timeout: 600000 });
        const result = await processCuts({ videoUrl, cuts, platform });
        return result.data;
    },

    async clearStorage(): Promise<any> {
        const cleanup = httpsCallable(functions, "deleteStorageFiles");
        const result = await cleanup();
        return result.data;
    }
};
