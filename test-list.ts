import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault()
});
const db = getFirestore(app);
db.collection('workload_records').listDocuments().then(d => console.log(d.length));
