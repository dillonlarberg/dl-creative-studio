// Types for the Creative Studio

export type AIProvider = 'openai' | 'google' | 'stability';

export type OutputFormat = 'jpeg' | 'png' | 'html' | 'mp4';

export interface Client {
    slug: string;
    name: string;
}

export interface CreativeAsset {
    id: string;
    url: string;
    type: 'image' | 'video';
    name?: string;
    platform?: string;
}

export interface ApprovalRequest {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
    reviewerNotes?: string;
}

export interface GeneratedOutput {
    id: string;
    url: string;
    format: OutputFormat;
    width: number;
    height: number;
    aiScore?: number;
    aiReasoning?: string;
}
