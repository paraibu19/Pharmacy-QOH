import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query, writeBatch } from 'firebase/firestore';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    let hasMore = true;
    let deleted = 0;
    while (hasMore) {
      const q = query(collection(db, 'application_storage'), limit(100));
      const snap = await getDocs(q);
      if (snap.empty) {
        hasMore = false;
        break;
      }
      const batch = writeBatch(db);
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += snap.docs.length;
      console.log(`Deleted ${deleted} docs...`);
    }
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}
run();
