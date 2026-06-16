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

/**
 * Safely parses and formats expiration date strings to standard "dd-MMM-yyyy" (e.g., 03-Mar-2027)
 */
export const formatExpirationDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (trimmed === '-' || trimmed === '.' || trimmed === 'N/A' || trimmed === '' || trimmed === 'Non-expiry' || trimmed.toLowerCase().includes('non')) {
    return trimmed;
  }

  try {
    const parts = trimmed.split(/[-/.]/);
    let parsedDate: Date | null = null;
    
    if (parts.length === 3) {
      let d = parseInt(parts[0]);
      let m = parseInt(parts[1]);
      let y = parseInt(parts[2]);
      
      if (parts[0].length === 4 || d > 31) {
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
        d = parseInt(parts[2]);
      }
      
      const fullYear = y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
      const date = new Date(fullYear, m - 1, d);
      if (!isNaN(date.getTime())) parsedDate = date;
    } else if (parts.length === 2) {
      let m = parseInt(parts[0]);
      let y = parseInt(parts[1]);
      if (parts[0].length === 4 || m > 12) {
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
      }
      const fullYear = y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
      const date = new Date(fullYear, m - 1, 1);
      if (!isNaN(date.getTime())) parsedDate = date;
    } else {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) parsedDate = d;
    }

    if (parsedDate) {
      const day = String(parsedDate.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthStr = months[parsedDate.getMonth()];
      const year = parsedDate.getFullYear();
      return `${day}-${monthStr}-${year}`;
    }
  } catch (error) {
    console.warn("formatExpirationDate error:", error, dateStr);
  }
  return dateStr;
};

