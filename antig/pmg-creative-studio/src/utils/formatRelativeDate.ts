import type { Timestamp } from 'firebase/firestore';

type DateInput = Date | Timestamp | string | null | undefined;

function toDate(input: DateInput): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input === 'string') return new Date(input);
  // Firestore Timestamp
  if (typeof (input as Timestamp).toDate === 'function') return (input as Timestamp).toDate();
  return null;
}

export function formatRelativeDate(input: DateInput): string {
  const date = toDate(input);
  if (!date || isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Within 30 days — use relative
  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  // Older than 30 days — absolute month + year
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
