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
      } else {
        await fetch('/api/system/metadata/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isMesaieedHidden: hidden })
        }).catch(err => console.warn('Failed to sync setting to server:', err));
      }
    } catch (e) {
      console.warn('Failed to set Mesaieed hidden setting:', e);
    }
  };

  useEffect(() => {
    // Initial fetch from server to get latest global metadata (handles local/fallback mode sync)
    fetch('/api/system/metadata')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch metadata');
      })
      .then(data => {
        if (data && data.lastDataUpdate) {
          const dateObj = new Date(data.lastDataUpdate);
          const timestamp = dateObj.toISOString();
          const localTime = localDb.getLastUpdateTime();
          if (!localTime || new Date(timestamp) >= new Date(localTime)) {
            storage.setItem('aw_pharmacy_last_update', timestamp);
            setLastUpdate(timestamp);
          }
        }
        if (data && data.isMesaieedHidden !== undefined) {
          const hidden = !!data.isMesaieedHidden;
          storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
          setIsMesaieedHidden(hidden);
        }
      })
      .catch(err => console.warn('Error fetching initial metadata:', err));
  }, []);

  useEffect(() => {
    // 1. Listen to Local Storage (for offline/immediate changes)
    const handleLocalUpdate = () => {
      setLastUpdate(localDb.getLastUpdateTime());
      setIsMesaieedHidden(storage.getItem('aw_pharmacy_hide_mesaieed') === 'true');
    };
    window.addEventListener('local-storage-update', handleLocalUpdate);

    // 2. Listen to real-time sync-update events via SSE (extremely Realtime sync between containers)
    const handleSyncUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.type === 'metadata') {
        const data = customEvent.detail.data;
        if (data && data.lastDataUpdate) {
          try {
            const timestamp = new Date(data.lastDataUpdate).toISOString();
            storage.setItem('aw_pharmacy_last_update', timestamp);
            setLastUpdate(timestamp);
          } catch (err) {
            console.error('Error parsing SSE metadata timestamp:', err);
          }
        }
        if (data && data.isMesaieedHidden !== undefined) {
          const hidden = !!data.isMesaieedHidden;
          storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
          setIsMesaieedHidden(hidden);
        }
      }
    };
    window.addEventListener('sync-update', handleSyncUpdate);

    // 3. Listen to Firestore (if in Cloud mode, to ensure direct client synchronization)
    let unsubscribe: (() => void) | null = null;
    if (db) {
      const metaRef = doc(db, 'system', 'metadata');
      unsubscribe = onSnapshot(metaRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data({ serverTimestamps: 'estimate' });
          if (data.lastDataUpdate) {
            try {
              const dateObj = (data.lastDataUpdate as any).toDate ? data.lastDataUpdate.toDate() : new Date(data.lastDataUpdate);
              const timestamp = dateObj.toISOString();
              
              const localTime = localDb.getLastUpdateTime();
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
    }

    return () => {
      window.removeEventListener('local-storage-update', handleLocalUpdate);
      window.removeEventListener('sync-update', handleSyncUpdate);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { lastUpdate, isMesaieedHidden, setMesaieedHidden };
}
