import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge does not know the project's own `text-metric*` font-size
 * tokens (`src/styles/index.css`), so by default it reads them as text
 * COLOURS and drops them whenever a colour class follows - a figure set in
 * `text-metric` with a shade colour lost its size. Registering them as font
 * sizes keeps both.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['metric', 'metric-sm', 'metric-lg'] }],
    },
  },
})

/** Merge Tailwind class names with correct conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
