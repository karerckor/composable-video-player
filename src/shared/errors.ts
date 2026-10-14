import type { ErrorKind, PlayerError } from '../types';

const MEDIA_ERROR_KINDS: Record<number, ErrorKind> = { 1: 'unknown', 2: 'network', 3: 'decode', 4: 'unsupported' };

export function mediaErrorToPlayerError(err: MediaError | null): PlayerError {
  if (!err) return { kind: 'unknown', message: 'Unknown media error' };
  return { kind: MEDIA_ERROR_KINDS[err.code] ?? 'unknown', message: err.message || `MediaError ${err.code}` };
}

export function isPlayerError(value: unknown): value is PlayerError {
  return typeof value === 'object' && value !== null && 'kind' in value && 'message' in value;
}

export function toPlayerError(value: unknown): PlayerError {
  if (isPlayerError(value)) return { kind: value.kind, message: value.message };
  if (value instanceof Error) return { kind: 'unknown', message: value.message };
  return { kind: 'unknown', message: String(value) };
}
