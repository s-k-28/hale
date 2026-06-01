import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind class merge — used by React Native Reusables components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
