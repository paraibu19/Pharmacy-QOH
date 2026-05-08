import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { localDb } from './localStorageDb';

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
        const data = snapshot.data();
        if (data.lastDataUpdate) {
          const timestamp = data.lastDataUpdate.toDate().toISOString();
          // Sync to local storage if it's newer
          const localTime = localDb.getLastUpdateTime();
          if (!localTime || new Date(timestamp) > new Date(localTime)) {
             localStorage.setItem('last_data_update', timestamp);
             setLastUpdate(timestamp);
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
