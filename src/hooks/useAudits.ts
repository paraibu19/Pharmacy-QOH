import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export interface AuditLog {
  id: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  physicalCount: number;
  recordedQoh: number;
  variance: number;
  auditedAt: any;
  auditedBy: string;
}

export function useAudits(maxItems: number = 50) {
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const auditsRef = collection(db, 'inventory_audits');
    const q = query(auditsRef, orderBy('auditedAt', 'desc'), limit(maxItems));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AuditLog[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as AuditLog);
        });
        setAudits(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'inventory_audits');
      }
    );

    return () => unsubscribe();
  }, [maxItems]);

  return { audits, loading, error };
}
