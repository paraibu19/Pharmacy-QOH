import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const config = {
  "projectId": "ai-studio-applet-webapp-460eb",
  "appId": "1:773048036826:web:87212bf304ceb920fda4e3",
  "apiKey": "AIzaSyA9DHQnmnnRnvzj6bJu1sxdaVahokPUICY",
  "authDomain": "ai-studio-applet-webapp-460eb.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-abfb0483-2d9c-41c1-bab8-4bc8fbf75e69",
  "storageBucket": "ai-studio-applet-webapp-460eb.firebasestorage.app",
  "messagingSenderId": "773048036826",
  "measurementId": ""
};
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const coll = collection(db, 'medications');
  const q = query(coll, where('locationId', '==', 'pediatric'), where('updatedBy', '==', 'Oracle QOH Upload'));
  const snap = await getDocs(q);
  console.log("Pediatric Oracle QOH Upload count:", snap.size);
  let latest = 0;
  snap.forEach(doc => {
    const ts = new Date(doc.data().lastUpdatedAt).getTime();
    if (ts > latest) latest = ts;
  });
  console.log("Latest pediatric upload date:", new Date(latest).toISOString());
  process.exit(0);
}
run();
