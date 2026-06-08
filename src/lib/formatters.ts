import { format } from 'date-fns';

/**
 * Formats a number with thousands separators (e.g., 1200 -> 1,200).
 */
export const formatNumber = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '0';
  
  const num = typeof value === 'number' ? value : parseFloat(value.toString().replace(/,/g, ''));
  
  if (isNaN(num)) return value.toString();
  
  return num.toLocaleString('en-US');
};

/**
 * Safely parses any date-like value (Date object, string, number, Firestore Timestamp, or serialized Timestamp object)
 */
export function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {}
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'object') {
    if (typeof val.seconds === 'number') {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val._seconds === 'number') {
      const d = new Date(val._seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * Safely formats any date-like value, failing back gracefully to a fallback string if invalid
 */
export function formatSafeDate(val: any, formatStr: string, fallbackStr: string = 'No Data'): string {
  const d = parseSafeDate(val);
  if (!d) return fallbackStr;
  try {
    return format(d, formatStr);
  } catch (error) {
    console.warn("formatSafeDate error:", error, val);
    return fallbackStr;
  }
}

