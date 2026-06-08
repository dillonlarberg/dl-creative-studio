// src/services/templateLibrary.types.ts
import type { Timestamp } from 'firebase/firestore';

export type FieldMappingSource = 'feed' | 'upload' | 'brand' | 'static';

export interface FieldMapping {
  source: FieldMappingSource;
  column?: string;       // required when source === 'feed'
  assetPath?: string;    // required when source === 'upload' — GCS path, not signed URL
  brandKey?: string;     // required when source === 'brand' — key of brandOverrides
  value?: string;        // required when source === 'static'
}

export interface AdSize {
  width: number;
  height: number;
  label?: string;
}

export interface TemplateLibraryRecord {
  id: string;
  name: string;
  status: 'draft' | 'published';
  version: number;

  channel: 'social' | 'programmatic' | 'print' | 'signage';
  adSizes: AdSize[];

  scaffoldId: string;
  scaffoldSnapshot: {
    expectedFields: string[];
    contentHash: string;
    capturedAt: Timestamp;
  };
  thumbnailUrl?: string;

  datasourceId: string;
  datasourceName: string;
  feedSnapshot: {
    columns: string[];
    capturedAt: Timestamp;
  };

  fieldMappings: Record<string, FieldMapping>;

  brandOverrides: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    showPrice?: boolean;
    showCTA?: boolean;
    ctaText?: string;
  };

  brief?: string;
  aiRequirements?: {
    intent: string;
    keyMessages: string[];
    tone?: string;
    targetAudience?: string;
  };

  createdBy: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedByUid: string;
  updatedAt: Timestamp;
  publishedBy?: string;
  publishedByUid?: string;
  publishedAt?: Timestamp;
}

export interface TemplateHistoryEntry {
  snapshot: Omit<TemplateLibraryRecord, 'id'>;
  savedBy: string;
  savedByUid: string;
  savedAt: Timestamp;
}

export type NewTemplateData = Pick<
  TemplateLibraryRecord,
  | 'name'
  | 'channel'
  | 'adSizes'
  | 'scaffoldId'
  | 'scaffoldSnapshot'
  | 'datasourceId'
  | 'datasourceName'
  | 'feedSnapshot'
  | 'fieldMappings'
  | 'brandOverrides'
> & { brief?: string; aiRequirements?: TemplateLibraryRecord['aiRequirements'] };

export class TemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplatePermissionError extends Error {
  constructor(templateId: string) {
    super(`Permission denied for template: ${templateId}`);
    this.name = 'TemplatePermissionError';
  }
}

export class TemplatePublishedError extends Error {
  constructor(templateId: string) {
    super(`Template ${templateId} is already published. Use updatePublished() to edit it.`);
    this.name = 'TemplatePublishedError';
  }
}

export class TemplateDraftError extends Error {
  constructor(templateId: string) {
    super(`Template ${templateId} is a draft. Use publish() first.`);
    this.name = 'TemplateDraftError';
  }
}
