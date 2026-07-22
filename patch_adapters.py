import re

with open('server.ts', 'r') as f:
    content = f.read()

# Add waitForPendingWrites to import
content = re.sub(r"  startAfter\n\} from 'firebase/firestore';", "  startAfter,\n  waitForPendingWrites\n} from 'firebase/firestore';", content)

# Modify WriteBatchAdapter
old_batch = """class WriteBatchAdapter {
  private batch: any;
  constructor(db: any) {
    this.batch = writeBatch(db);
  }"""
new_batch = """class WriteBatchAdapter {
  private batch: any;
  private db: any;
  constructor(db: any) {
    this.batch = writeBatch(db);
    this.db = db;
  }"""
content = content.replace(old_batch, new_batch)

old_commit = """  async commit() {
    return firestoreWriteQueue.enqueue(async () => {
      await this.batch.commit();
    });
  }"""
new_commit = """  async commit() {
    return firestoreWriteQueue.enqueue(async () => {
      await this.batch.commit();
      await waitForPendingWrites(this.db);
    });
  }"""
content = content.replace(old_commit, new_commit)

# Modify DocumentRefAdapter
old_set = """  async set(data: any, options?: any) {
    return firestoreWriteQueue.enqueue(async () => {
      if (options) {
        await setDoc(this.ref, data, options);
      } else {
        await setDoc(this.ref, data);
      }
    });
  }"""
new_set = """  async set(data: any, options?: any) {
    return firestoreWriteQueue.enqueue(async () => {
      if (options) {
        await setDoc(this.ref, data, options);
      } else {
        await setDoc(this.ref, data);
      }
      await waitForPendingWrites(this.db);
    });
  }"""
content = content.replace(old_set, new_set)

old_delete = """  async delete() {
    return firestoreWriteQueue.enqueue(async () => {
      await deleteDoc(this.ref);
    });
  }"""
new_delete = """  async delete() {
    return firestoreWriteQueue.enqueue(async () => {
      await deleteDoc(this.ref);
      await waitForPendingWrites(this.db);
    });
  }"""
content = content.replace(old_delete, new_delete)

with open('server.ts', 'w') as f:
    f.write(content)
