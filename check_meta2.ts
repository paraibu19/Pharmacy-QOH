import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

async function check() {
  const d = await getDoc(doc(db, 'system', 'metadata'));
  if (d.exists()) {
    console.log(d.data());
  } else {
    console.log("No metadata doc");
  }
  process.exit(0);
}
check();
