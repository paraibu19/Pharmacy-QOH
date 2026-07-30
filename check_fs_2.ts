import { ClientFirestoreAdapter } from './server.ts';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const adapter = new ClientFirestoreAdapter(config);

async function run() {
  await new Promise(r => setTimeout(r, 1000));
  const snap = await adapter.collection('system').doc('metadata').get();
  console.log(snap.exists ? snap.data() : 'not found');
  process.exit(0);
}
run();
