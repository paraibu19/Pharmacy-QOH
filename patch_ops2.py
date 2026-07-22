import re

with open('src/lib/firebaseOperations.ts', 'r') as f:
    content = f.read()

old_update = """async function queuedUpdateDoc(docRef: any, data: any) {
  return firestoreWriteQueue.enqueue(() => updateDoc(docRef, data));
}"""
new_update = """async function queuedUpdateDoc(docRef: any, data: any) {
  return firestoreWriteQueue.enqueue(async () => {
    await updateDoc(docRef, data);
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_update, new_update)

old_delete = """async function queuedDeleteDoc(docRef: any) {
  return firestoreWriteQueue.enqueue(() => deleteDoc(docRef));
}"""
new_delete = """async function queuedDeleteDoc(docRef: any) {
  return firestoreWriteQueue.enqueue(async () => {
    await deleteDoc(docRef);
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_delete, new_delete)

old_add = """async function queuedAddDoc(colRef: any, data: any) {
  return firestoreWriteQueue.enqueue(() => addDoc(colRef, data));
}"""
new_add = """async function queuedAddDoc(colRef: any, data: any) {
  return firestoreWriteQueue.enqueue(async () => {
    const res = await addDoc(colRef, data);
    await waitForPendingWrites(db);
    return res;
  });
}"""
content = content.replace(old_add, new_add)

old_set = """async function queuedSetDoc(docRef: any, data: any, options?: any) {
  return firestoreWriteQueue.enqueue(() => options ? setDoc(docRef, data, options) : setDoc(docRef, data));
}"""
new_set = """async function queuedSetDoc(docRef: any, data: any, options?: any) {
  return firestoreWriteQueue.enqueue(async () => {
    if (options) {
      await setDoc(docRef, data, options);
    } else {
      await setDoc(docRef, data);
    }
    await waitForPendingWrites(db);
  });
}"""
content = content.replace(old_set, new_set)

with open('src/lib/firebaseOperations.ts', 'w') as f:
    f.write(content)
