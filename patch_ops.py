import re

with open('src/lib/firebaseOperations.ts', 'r') as f:
    content = f.read()

content = re.sub(r"  serverTimestamp, writeBatch, query, where, getDocs, getDoc, setDoc \n\} from 'firebase/firestore';", "  serverTimestamp, writeBatch, query, where, getDocs, getDoc, setDoc,\n  waitForPendingWrites\n} from 'firebase/firestore';", content)

old_commit = """async function queuedCommit(batch: any) {
  return firestoreWriteQueue.enqueue(() => batch.commit());
}"""
new_commit = """async function queuedCommit(batch: any) {
  return firestoreWriteQueue.enqueue(async () => {
    await batch.commit();
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_commit, new_commit)

old_update = """async function queuedUpdateDoc(ref: any, data: any) {
  return firestoreWriteQueue.enqueue(() => updateDoc(ref, data));
}"""
new_update = """async function queuedUpdateDoc(ref: any, data: any) {
  return firestoreWriteQueue.enqueue(async () => {
    await updateDoc(ref, data);
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_update, new_update)

old_delete = """async function queuedDeleteDoc(ref: any) {
  return firestoreWriteQueue.enqueue(() => deleteDoc(ref));
}"""
new_delete = """async function queuedDeleteDoc(ref: any) {
  return firestoreWriteQueue.enqueue(async () => {
    await deleteDoc(ref);
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_delete, new_delete)

old_add = """async function queuedAddDoc(collectionRef: any, data: any) {
  return firestoreWriteQueue.enqueue(() => addDoc(collectionRef, data));
}"""
new_add = """async function queuedAddDoc(collectionRef: any, data: any) {
  return firestoreWriteQueue.enqueue(async () => {
    const res = await addDoc(collectionRef, data);
    await waitForPendingWrites(db);
    return res;
  });
}"""
content = content.replace(old_add, new_add)

old_set = """async function queuedSetDoc(ref: any, data: any, options?: any) {
  return firestoreWriteQueue.enqueue(() => setDoc(ref, data, options));
}"""
new_set = """async function queuedSetDoc(ref: any, data: any, options?: any) {
  return firestoreWriteQueue.enqueue(async () => {
    if (options) {
      await setDoc(ref, data, options);
    } else {
      await setDoc(ref, data);
    }
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_set, new_set)

with open('src/lib/firebaseOperations.ts', 'w') as f:
    f.write(content)
