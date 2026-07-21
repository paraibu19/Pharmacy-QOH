import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();
async function count() {
  const c = await db.collection('workload_records').count().get();
  console.log("Total docs:", c.data().count);
}
count();
