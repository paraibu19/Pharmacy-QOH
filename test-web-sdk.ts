import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function testWebSdk() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('firebase-applet-config.json not found!');
    process.exit(1);
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Initializing Web SDK with config:', config.projectId, config.firestoreDatabaseId);
  
  try {
    const app = initializeApp(config);
    const db = getFirestore(app);
    
    console.log('Attempting to write a document to /system/test_connection_node ...');
    const testRef = doc(db, 'system', 'test_connection_node');
    await setDoc(testRef, {
      testedAt: new Date().toISOString(),
      status: 'success_web_sdk'
    });
    console.log('Successfully wrote to Firestore via Web SDK!');
    
    console.log('Attempting to read the document...');
    const snap = await getDoc(testRef);
    if (snap.exists()) {
      console.log('Successfully read from Firestore via Web SDK:', snap.data());
    } else {
      console.log('Document not found!');
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Web SDK connection failed with error:', err.message);
    process.exit(1);
  }
}

testWebSdk();
