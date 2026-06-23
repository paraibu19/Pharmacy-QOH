import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { localDb } from './localStorageDb';
import { storage } from './storage';

export function useSystemMetadata() {
  const [lastUpdate, setLastUpdate] = useState<string | null>(localDb.getLastUpdateTime());
  const [isMesaieedHidden, setIsMesaieedHidden] = useState<boolean>(() => {
    return storage.getItem('aw_pharmacy_hide_mesaieed') === 'true';
  });

  const setMesaieedHidden = async (hidden: boolean) => {
    try {
      storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
      setIsMesaieedHidden(hidden);
      window.dispatchEvent(new Event('local-storage-update'));

      if (db) {
        const metaRef = doc(db, 'system', 'metadata');
        await setDoc(metaRef, {
          isMesaieedHidden: hidden,
          lastSettingUpdate: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Failed to set Mesaieed hidden setting:', e);
    }
  };

  useEffect(() => {
    // 1. Listen to Local Storage (for offline/immediate changes)
    const handleLocalUpdate = () => {
      setLastUpdate(localDb.getLastUpdateTime());
      setIsMesaieedHidden(storage.getItem('aw_pharmacy_hide_mesaieed') === 'true');
    };
    window.addEventListener('local-storage-update', handleLocalUpdate);

    // 2. Listen to Firestore (for cross-user synchronization)
    if (!db) return () => window.removeEventListener('local-storage-update', handleLocalUpdate);

    const metaRef = doc(db, 'system', 'metadata');
    const unsubscribe = onSnapshot(metaRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data({ serverTimestamps: 'estimate' });
        
        if (data.lastResetTime) {
          const storedResetTime = storage.getItem('aw_pharmacy_last_reset');
          if (storedResetTime && storedResetTime !== data.lastResetTime) {
            console.log('[useSystemMetadata] System reset detected from cloud, reloading...');
            storage.setItem('aw_pharmacy_last_reset', data.lastResetTime);
            window.location.reload();
            return;
          } else if (!storedResetTime) {
            storage.setItem('aw_pharmacy_last_reset', data.lastResetTime);
          }
        }

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
        if (data.isMesaieedHidden !== undefined) {
          const hidden = !!data.isMesaieedHidden;
          storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
          setIsMesaieedHidden(hidden);
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

  return { lastUpdate, isMesaieedHidden, setMesaieedHidden };
}
