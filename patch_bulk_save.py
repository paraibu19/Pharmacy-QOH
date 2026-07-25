import sys

with open('server.ts', 'r') as f:
    content = f.read()

content = content.replace(
'''    if (adminDb) {
      await saveMedicationsBulkToFirestore(newMeds).catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));''',
'''    if (adminDb) {
      saveMedicationsBulkToFirestore(newMeds).catch(err => console.error(err));
    }

    updateSystemMetadataInFirestore().catch(err => console.error(err));'''
)

content = content.replace(
'''    if (adminDb) {
      const allToSync = [...updatedMeds, ...createdMeds];
      await saveMedicationsBulkToFirestore(allToSync).catch(err => console.error('[Oracle QOH] Firestore save error:', err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error('[Oracle QOH] Metadata update error:', err));''',
'''    if (adminDb) {
      const allToSync = [...updatedMeds, ...createdMeds];
      saveMedicationsBulkToFirestore(allToSync).catch(err => console.error('[Oracle QOH] Firestore save error:', err));
    }

    updateSystemMetadataInFirestore().catch(err => console.error('[Oracle QOH] Metadata update error:', err));'''
)

with open('server.ts', 'w') as f:
    f.write(content)
