/**
 * Formats a year + 0-indexed month into a stable 'YYYY-MM' key.
 * Used to scope duty/leave grid data per month so that navigating between
 * months never bleeds one month's data into another.
 */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}
