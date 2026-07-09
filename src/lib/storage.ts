

function getCookie(name: string): string | null {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  } catch (e) {}
  return null;
}

function setCookie(name: string, value: string, days = 7): void {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    // Use both Lax and None to handle sandbox or direct access contexts gracefully
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=None; Secure`;
  } catch (e) {}
}

function eraseCookie(name: string): void {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=None; Secure`;
  } catch (e) {}
}

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
      const localVal = window.localStorage.getItem(key);
      if (localVal !== null) return localVal;
    } catch (e) {
      console.warn('localStorage is not available:', e);
    }
    // Try cookie backup
    const cookieVal = getCookie(`storage_backup_${key}`);
    if (cookieVal !== null) return cookieVal;
    
    return (window as any).__mem_storage?.[key] || null;
  },

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage is not available:', e);
    }
    // Write cookie backup
    setCookie(`storage_backup_${key}`, value);
    
    if (!(window as any).__mem_storage) (window as any).__mem_storage = {};
    (window as any).__mem_storage[key] = value;
  },

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage is not available:', e);
    }
    // Erase cookie backup
    eraseCookie(`storage_backup_${key}`);
    
    if ((window as any).__mem_storage) delete (window as any).__mem_storage[key];
  }
};

// Safe sessionStorage wrapper for sandbox iframes
export const sessionStorage = {
  isAvailable(): boolean {
    try {
      const testKey = '__session_storage_test__';
      window.sessionStorage.setItem(testKey, testKey);
      window.sessionStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  },

  getItem(key: string): string | null {
    try {
      const sessionVal = window.sessionStorage.getItem(key);
      if (sessionVal !== null) return sessionVal;
    } catch (e) {
      console.warn('sessionStorage is not available:', e);
    }
    // Try cookie backup
    const cookieVal = getCookie(`session_backup_${key}`);
    if (cookieVal !== null) return cookieVal;
    
    return (window as any).__mem_session_storage?.[key] || null;
  },

  setItem(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (e) {
      console.warn('sessionStorage is not available:', e);
    }
    try {
      document.cookie = `session_backup_${key}=${value}; path=/; SameSite=None; Secure`;
    } catch (e) {}
    
    if (!(window as any).__mem_session_storage) (window as any).__mem_session_storage = {};
    (window as any).__mem_session_storage[key] = value;
  },

  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch (e) {
      console.warn('sessionStorage is not available:', e);
    }
    try {
      document.cookie = `session_backup_${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=None; Secure`;
    } catch (e) {}
    
    if ((window as any).__mem_session_storage) delete (window as any).__mem_session_storage[key];
  }
};

export function safeReload(reason: string): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem('last_auto_reload_time') || 0);
    if (now - lastReload < 15000) {
      console.error(`[Safeguard] Prevented rapid reload loop for: ${reason}. Last reload was ${(now - lastReload)/1000}s ago.`);
      return;
    }
    sessionStorage.setItem('last_auto_reload_time', String(now));
    console.warn(`[Safeguard] Auto-reloading page: ${reason}`);
    window.location.reload();
  } catch (e) {
    console.error('safeReload failed:', e);
    window.location.reload();
  }
}


