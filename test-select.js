import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp();
const db = getFirestore();

async function run() {
  try {
    const snap = await db.collection('workload_records').select().limit(5).get();
    console.log(snap.docs.map(d => d.id));
  } catch (err) {
    console.error(err);
  }
}
run();
