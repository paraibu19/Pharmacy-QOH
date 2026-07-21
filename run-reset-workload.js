import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

import admin from 'firebase-admin';
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${config.projectId}.firebaseio.com`
}, 'test');
const db = admin.firestore(admin.app('test'), config.firestoreDatabaseId);

async function run() {
  const snap = await db.collection('workload_records').select().limit(500).get();
  console.log('workload_records docs:', snap.size);
}
run();
