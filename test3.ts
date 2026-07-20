import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const app = initializeApp(config);
const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false } as any, config.firestoreDatabaseId);
async function test() {
  try {
    const snap = await getDocs(collection(db, 'system'));
    console.log('Success, docs:', snap.docs.length);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
test();
