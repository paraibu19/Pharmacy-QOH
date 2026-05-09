import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SystemConfig {
  topPosterUrl?: string;
  announcement?: string;
  updatedAt?: any;
}

export function useSystemConfig() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'settings', 'global_config');
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        setConfig(doc.data() as SystemConfig);
      } else {
        setConfig(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error listening to system config:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { config, loading };
}
