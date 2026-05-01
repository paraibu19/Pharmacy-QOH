/**
 * Formats a number with thousands separators (e.g., 1200 -> 1,200).
 */
export const formatNumber = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '0';
  
  const num = typeof value === 'number' ? value : parseFloat(value.toString().replace(/,/g, ''));
  
  if (isNaN(num)) return value.toString();
  
  return num.toLocaleString('en-US');
};
