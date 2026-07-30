const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, query, where, limit, getDocs } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  const d = await getDoc(doc(db, 'system', 'metadata'));
  console.log('Metadata:', d.data());
  
  const q = query(collection(db, 'medications'), where('updatedBy', '==', 'Oracle QOH Upload'), limit(1));
  const meds = await getDocs(q);
  console.log('Medications updated by Oracle QOH:', meds.size);
  if (meds.size > 0) {
      console.log('First med date:', meds.docs[0].data().lastUpdatedAt);
  }
}

check().catch(console.error).finally(() => process.exit(0));
