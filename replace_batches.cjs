const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/saveMedicationsBulkToFirestore\(newMeds\)\.catch\(err => console\.error\(err\)\);/g, 'await saveMedicationsBulkToFirestore(newMeds).catch(err => console.error(err));');
code = code.replace(/saveMedicationsBulkToFirestore\(allToSync\)\.catch\(err => console\.error\('\\[Oracle QOH\\] Firestore save error:', err\)\);/g, 'await saveMedicationsBulkToFirestore(allToSync).catch(err => console.error(\'[Oracle QOH] Firestore save error:\', err));');
code = code.replace(/updateSystemMetadataInFirestore\(\)\.catch\(err => console\.error\(err\)\);/g, 'await updateSystemMetadataInFirestore().catch(err => console.error(err));');
code = code.replace(/updateSystemMetadataInFirestore\(\)\.catch\(err => console\.error\('\\[Oracle QOH\\] Metadata update error:', err\)\);/g, 'await updateSystemMetadataInFirestore().catch(err => console.error(\'[Oracle QOH] Metadata update error:\', err));');
fs.writeFileSync('server.ts', code);
