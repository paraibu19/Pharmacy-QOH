import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp({ credential: cert(config) });
const db = getFirestore(app);

async function run() {
  const snap = await db.collection('workload_records').select().limit(500).get();
  console.log('workload_records docs:', snap.size);
}
run();
