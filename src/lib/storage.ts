
// Safe localStorage wrapper for Safari and other browsers with strict privacy settings
export const storage = {
  isAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  },

  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage is not available:', e);
      return (window as any).__mem_storage?.[key] || null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage is not available:', e);
      if (!(window as any).__mem_storage) (window as any).__mem_storage = {};
      (window as any).__mem_storage[key] = value;
    }
  },

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage is not available:', e);
      if ((window as any).__mem_storage) delete (window as any).__mem_storage[key];
    }
  }
};
