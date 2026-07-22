import re

with open('server.ts', 'r') as f:
    content = f.read()

old_meta = """  if (adminDb) {
    adminDb.collection('system').doc('metadata').set({
      lastDataUpdate: new Date(),
      updatedBy: 'server'
    }, { merge: true }).catch((err: any) => {
      console.error('[Firebase Admin] Failed to update global metadata:', err.message);
    });
  }"""

new_meta = """  if (adminDb) {
    firestoreWriteQueue.enqueue(async () => {
      await adminDb.collection('system').doc('metadata').set({
        lastDataUpdate: new Date(),
        updatedBy: 'server'
      }, { merge: true });
      await waitForPendingWrites(adminDb.db);
    }).catch((err: any) => {
      console.error('[Firebase Admin] Failed to update global metadata:', err.message);
    });
  }"""
content = content.replace(old_meta, new_meta)

old_uploaded = """    if (adminDb) {
      adminDb.collection('system').doc('uploaded_files').set({ files: list }).catch((err: any) => {
        console.error('[Firebase Admin] Failed to sync uploaded files list:', err.message);
      });
    }"""
new_uploaded = """    if (adminDb) {
      firestoreWriteQueue.enqueue(async () => {
        await adminDb.collection('system').doc('uploaded_files').set({ files: list });
        await waitForPendingWrites(adminDb.db);
      }).catch((err: any) => {
        console.error('[Firebase Admin] Failed to sync uploaded files list:', err.message);
      });
    }"""
content = content.replace(old_uploaded, new_uploaded)

old_app_storage = """        adminDb.collection('application_storage').doc(idToDelete).delete().catch(err => console.error(err));"""
new_app_storage = """        firestoreWriteQueue.enqueue(async () => {
          await adminDb.collection('application_storage').doc(idToDelete).delete();
          await waitForPendingWrites(adminDb.db);
        }).catch(err => console.error(err));"""
content = content.replace(old_app_storage, new_app_storage)

old_reset_app_storage = """      await adminDb.collection('system').doc('uploaded_files').set({ files: [] }).catch((err: any) => {
        console.error('[Firebase Reset Error] Failed to reset uploaded files in Firestore:', err.message);
      });"""
new_reset_app_storage = """      firestoreWriteQueue.enqueue(async () => {
        await adminDb.collection('system').doc('uploaded_files').set({ files: [] });
        await waitForPendingWrites(adminDb.db);
      }).catch((err: any) => {
        console.error('[Firebase Reset Error] Failed to reset uploaded files in Firestore:', err.message);
      });"""
content = content.replace(old_reset_app_storage, new_reset_app_storage)

old_mesaieed = """    if (adminDb) {
      adminDb.collection('system').doc('metadata').set({
        isMesaieedHidden: !!isMesaieedHidden,
        lastSettingUpdate: new Date()
      }, { merge: true }).catch((err: any) => console.error(err));
    }"""
new_mesaieed = """    if (adminDb) {
      firestoreWriteQueue.enqueue(async () => {
        await adminDb.collection('system').doc('metadata').set({
          isMesaieedHidden: !!isMesaieedHidden,
          lastSettingUpdate: new Date()
        }, { merge: true });
        await waitForPendingWrites(adminDb.db);
      }).catch((err: any) => console.error(err));
    }"""
content = content.replace(old_mesaieed, new_mesaieed)

with open('server.ts', 'w') as f:
    f.write(content)
