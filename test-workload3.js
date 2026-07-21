import admin from 'firebase-admin';
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();

async function run() {
  try {
    const snap = await db.collection('workload_records').select().limit(500).get();
    console.log('workload_records docs:', snap.size);
  } catch (err) {
    console.error(err);
  }
}
run();
