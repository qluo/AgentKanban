import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Feature, FeatureMetadata } from './types';
import { ValidationError } from './validation';
import { cancelTasksForFeature, listTaskSummariesForFeature } from './repository';

const FEATURES_FILE = 'FEATURES.md';
const FEATURE_ID = /^[A-Z][A-Z0-9]*-\d{3,}$/;
const METADATA = /^\s*<!--\s*agent-kanban:feature\s+({[\s\S]*?})\s*-->/;
const HEADINGS = /^##\s+(?:\[([^\]]+)\]\s+)?(.+?)\s*$/gm;

interface ParsedFeature extends Omit<Feature, 'tasks'> {
  start: number;
  end: number;
  headingEnd: number;
  metadataMatch: RegExpMatchArray | null;
}

export interface FeaturesDocument {
  exists: boolean;
  path: string;
  markdown: string | null;
  features: Feature[];
}

function featuresPath(repoPath: string) {
  return path.join(repoPath, FEATURES_FILE);
}

function parseMetadata(raw: string | undefined, index: number): FeatureMetadata {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.status !== undefined && value.status !== 'active' && value.status !== 'canceled') {
      throw new Error('invalid status');
    }
    if (
      value.cancellationReason !== undefined &&
      typeof value.cancellationReason !== 'string'
    ) {
      throw new Error('invalid cancellation reason');
    }
    return value as FeatureMetadata;
  } catch {
    throw new ValidationError({
      features: `Feature ${index + 1} has invalid agent-kanban metadata.`,
    });
  }
}

function parseFeatures(markdown: string): ParsedFeature[] {
  const headings = [...markdown.matchAll(HEADINGS)];
  const features = headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const headingEnd = start + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const segment = markdown.slice(headingEnd, end);
    const metadataMatch = segment.match(METADATA);
    const metadata = parseMetadata(metadataMatch?.[1], index);
    const id = heading[1]?.trim() || null;
    if (id && !FEATURE_ID.test(id)) {
      throw new ValidationError({ features: `Feature ${index + 1} has an invalid ID.` });
    }
    const body = metadataMatch
      ? segment.replace(metadataMatch[0], '').replace(/^\n/, '').trim()
      : segment.trim();
    return {
      index,
      id,
      title: heading[2].trim(),
      body,
      metadata,
      status: metadata.status ?? 'active',
      start,
      end,
      headingEnd,
      metadataMatch,
    };
  });
  const ids = features.flatMap((feature) => (feature.id ? [feature.id] : []));
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError({ features: 'Feature IDs must be unique.' });
  }
  return features;
}

export function parseFeaturesDocument(markdown: string) {
  return parseFeatures(markdown).map(publicFeature);
}

function publicFeature(feature: ParsedFeature): Feature {
  return {
    index: feature.index,
    id: feature.id,
    title: feature.title,
    body: feature.body,
    metadata: feature.metadata,
    status: feature.status,
    tasks: [],
  };
}

function readMarkdown(repoPath: string) {
  const filePath = featuresPath(repoPath);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

function requireMarkdown(repoPath: string) {
  const markdown = readMarkdown(repoPath);
  if (markdown === null) {
    throw new ValidationError({ features: 'Create FEATURES.md before managing features.' });
  }
  return markdown;
}

function atomicWrite(filePath: string, markdown: string) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, markdown, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      // The primary write error is more useful to the caller.
    }
    throw error;
  }
}

function assertFeatureIndex(features: ParsedFeature[], featureIndex: number) {
  if (!Number.isInteger(featureIndex) || featureIndex < 0 || featureIndex >= features.length) {
    throw new ValidationError({ featureIndex: 'Feature index is invalid.' });
  }
  return features[featureIndex];
}

function renderFeature(feature: ParsedFeature, update: { title?: string; body?: string; metadata?: FeatureMetadata; id?: string | null }) {
  const id = update.id === undefined ? feature.id : update.id;
  const title = update.title ?? feature.title;
  const body = update.body ?? feature.body;
  const metadata = update.metadata ?? feature.metadata;
  const heading = `## ${id ? `[${id}] ` : ''}${title}`;
  const metadataText = Object.keys(metadata).length > 0
    ? `\n<!-- agent-kanban:feature ${JSON.stringify(metadata)} -->`
    : '';
  return `${heading}${metadataText}${body ? `\n\n${body.trim()}\n` : '\n'}`;
}

function replaceFeature(markdown: string, feature: ParsedFeature, replacement: string) {
  return `${markdown.slice(0, feature.start)}${replacement}${markdown.slice(feature.end)}`;
}

function validateFeatureContent(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError({ [field]: `${field} is required.` });
  }
  return value.trim();
}

export function getFeaturesDocument(db: Database.Database, projectId: string, repoPath: string): FeaturesDocument {
  const markdown = readMarkdown(repoPath);
  const parsed = markdown === null ? [] : parseFeatures(markdown);
  return {
    exists: markdown !== null,
    path: featuresPath(repoPath),
    markdown,
    features: parsed.map((feature) => ({
      ...publicFeature(feature),
      tasks: feature.id ? listTaskSummariesForFeature(db, projectId, feature.id) : [],
    })),
  };
}

export function getFeatureById(repoPath: string, featureId: string) {
  const feature = parseFeatures(requireMarkdown(repoPath)).find(
    (item) => item.id === featureId,
  );
  if (!feature) throw new ValidationError({ featureId: 'Feature does not exist in FEATURES.md.' });
  return publicFeature(feature);
}

export function saveFeaturesFile(repoPath: string, markdown: unknown) {
  if (typeof markdown !== 'string') {
    throw new ValidationError({ markdown: 'Markdown is required.' });
  }
  parseFeatures(markdown);
  atomicWrite(featuresPath(repoPath), markdown);
  return getFeaturesDocumentPlaceholder(repoPath, markdown);
}

function getFeaturesDocumentPlaceholder(repoPath: string, markdown: string): FeaturesDocument {
  return {
    exists: true,
    path: featuresPath(repoPath),
    markdown,
    features: parseFeatures(markdown).map(publicFeature),
  };
}

export function createFeature(repoPath: string, rawInput: unknown) {
  const value = (rawInput ?? {}) as Record<string, unknown>;
  const title = validateFeatureContent(value.title, 'title');
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  const original = requireMarkdown(repoPath);
  const separator = original.length === 0 || original.endsWith('\n\n') ? '' : '\n\n';
  const next = `${original}${separator}## ${title}${body ? `\n\n${body}\n` : '\n'}`;
  atomicWrite(featuresPath(repoPath), next);
  return publicFeature(parseFeatures(next).at(-1)!);
}

export function updateFeature(repoPath: string, featureIndex: number, rawInput: unknown) {
  const value = (rawInput ?? {}) as Record<string, unknown>;
  const original = requireMarkdown(repoPath);
  const parsed = parseFeatures(original);
  const feature = assertFeatureIndex(parsed, featureIndex);
  if (feature.status === 'canceled') {
    throw new ValidationError({ feature: 'Canceled features cannot be edited.' });
  }
  const title = value.title === undefined ? undefined : validateFeatureContent(value.title, 'title');
  const body = value.body === undefined ? undefined : typeof value.body === 'string' ? value.body : (() => { throw new ValidationError({ body: 'body must be text.' }); })();
  const next = replaceFeature(original, feature, renderFeature(feature, { title, body }));
  atomicWrite(featuresPath(repoPath), next);
  return publicFeature(assertFeatureIndex(parseFeatures(next), featureIndex));
}

export function assignApprovedFeatureId(repoPath: string, featureIndex: number, rawInput: unknown) {
  const value = (rawInput ?? {}) as Record<string, unknown>;
  if (value.approved !== true) {
    throw new ValidationError({ approved: 'A human approval assertion is required.' });
  }
  const id = validateFeatureContent(value.id, 'id');
  if (!FEATURE_ID.test(id)) {
    throw new ValidationError({ id: 'Feature ID must look like FEAT-001.' });
  }
  const original = requireMarkdown(repoPath);
  const parsed = parseFeatures(original);
  const feature = assertFeatureIndex(parsed, featureIndex);
  if (feature.id) throw new ValidationError({ id: 'Feature already has an approved ID.' });
  if (parsed.some((item) => item.id === id)) {
    throw new ValidationError({ id: 'Feature ID must be unique.' });
  }
  const next = replaceFeature(original, feature, renderFeature(feature, { id }));
  atomicWrite(featuresPath(repoPath), next);
  return publicFeature(assertFeatureIndex(parseFeatures(next), featureIndex));
}

export function cancelFeature(
  db: Database.Database,
  projectId: string,
  repoPath: string,
  featureIndex: number,
  rawInput: unknown,
) {
  const value = (rawInput ?? {}) as Record<string, unknown>;
  const userReason = validateFeatureContent(value.reason, 'reason');
  const original = requireMarkdown(repoPath);
  const parsed = parseFeatures(original);
  const feature = assertFeatureIndex(parsed, featureIndex);
  if (!feature.id) throw new ValidationError({ feature: 'Approve a feature ID before canceling it.' });
  if (feature.status === 'canceled') throw new ValidationError({ feature: 'Feature is already canceled.' });
  const cancellationReason = `Parent feature ${feature.id} was canceled: ${userReason}`;
  const metadata: FeatureMetadata = {
    ...feature.metadata,
    status: 'canceled',
    cancellationReason: userReason,
    canceledAt: new Date().toISOString(),
  };
  const next = replaceFeature(original, feature, renderFeature(feature, { metadata }));
  let wroteFile = false;
  try {
    const transaction = db.transaction(() => {
      atomicWrite(featuresPath(repoPath), next);
      wroteFile = true;
      cancelTasksForFeature(db, projectId, feature.id!, cancellationReason);
    });
    transaction();
  } catch (error) {
    if (wroteFile) atomicWrite(featuresPath(repoPath), original);
    throw error;
  }
  return publicFeature(assertFeatureIndex(parseFeatures(next), featureIndex));
}

export function deleteFeature(db: Database.Database, projectId: string, repoPath: string, featureIndex: number) {
  const original = requireMarkdown(repoPath);
  const parsed = parseFeatures(original);
  const feature = assertFeatureIndex(parsed, featureIndex);
  if (feature.id && listTaskSummariesForFeature(db, projectId, feature.id).length > 0) {
    throw new ValidationError({ feature: 'Features with tasks must be canceled, not deleted.' });
  }
  const next = `${original.slice(0, feature.start)}${original.slice(feature.end)}`.replace(/\n{3,}/g, '\n\n');
  atomicWrite(featuresPath(repoPath), next);
}
