import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for merging Tailwind CSS classes.
 * Matches the Alli design system's `cn()` pattern.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
