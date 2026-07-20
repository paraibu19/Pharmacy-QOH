import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getCountFromServer } from 'firebase/firestore';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    const snap = await getCountFromServer(collection(db, 'application_storage'));
    console.log('Count:', snap.data().count);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
