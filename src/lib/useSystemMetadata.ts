import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { localDb } from './localStorageDb';
import { storage } from './storage';

export function useSystemMetadata() {
  const [lastUpdate, setLastUpdate] = useState<string | null>(localDb.getLastUpdateTime());

  useEffect(() => {
    // 1. Listen to Local Storage (for offline/immediate changes)
    const handleLocalUpdate = () => {
      setLastUpdate(localDb.getLastUpdateTime());
    };
    window.addEventListener('local-storage-update', handleLocalUpdate);

    // 2. Listen to Firestore (for cross-user synchronization)
    if (!db) return () => window.removeEventListener('local-storage-update', handleLocalUpdate);

    const metaRef = doc(db, 'system', 'metadata');
    const unsubscribe = onSnapshot(metaRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data({ serverTimestamps: 'estimate' });
        if (data.lastDataUpdate) {
          try {
            const dateObj = (data.lastDataUpdate as any).toDate ? data.lastDataUpdate.toDate() : new Date(data.lastDataUpdate);
            const timestamp = dateObj.toISOString();
            
            // For cloud updates, we generally want to reflect them
            // especially to sync between different browser tabs/sessions
            const localTime = localDb.getLastUpdateTime();
            
            // If it's newer than local or if we don't have local, update it
            if (!localTime || new Date(timestamp) >= new Date(localTime)) {
              storage.setItem('aw_pharmacy_last_update', timestamp);
              setLastUpdate(timestamp);
            }
          } catch (e) {
            console.error('Error parsing metadata timestamp:', e);
          }
        }
      }
    }, (error) => {
      console.warn('Metadata listener error:', error);
    });

    return () => {
      window.removeEventListener('local-storage-update', handleLocalUpdate);
      unsubscribe();
    };
  }, []);

  return { lastUpdate };
}
