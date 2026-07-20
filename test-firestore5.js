import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
  const q = query(collection(db, 'application_storage'), limit(500));
  const snap = await getDocs(q);
  console.log('Docs:', snap.docs.length);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
