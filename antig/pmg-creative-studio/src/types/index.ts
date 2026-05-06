// Types for the Creative Studio

import type { AppId } from '../platform/firebase/paths';
export type UseCaseId = AppId;

export type EntryPath = 'create-new' | 'edit-existing';

export type AIProvider = 'openai' | 'google' | 'stability';

export type OutputFormat = 'jpeg' | 'png' | 'html' | 'mp4';

export interface UseCase {
    id: UseCaseId;
    title: string;
    description: string;
    icon: string;
    entryPaths: EntryPath[];
    outputFormats: OutputFormat[];
    requiresBrandStandards?: boolean;
}

export interface WizardStep {
    id: string;
    name: string;
    status: 'complete' | 'current' | 'upcoming' | 'disabled';
}

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
