import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
  const snap = await getDocs(collection(db, 'application_storage'));
  console.log('Docs:', snap.docs.length);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
