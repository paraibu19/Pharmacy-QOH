import admin from 'firebase-admin';
import fs from 'fs';
const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${config.projectId}.firebaseio.com`
});
const db = admin.firestore(admin.app(), config.firestoreDatabaseId);

async function run() {
  const docs = await db.collection('workload_records').listDocuments();
  console.log(docs.length);
}
run();
