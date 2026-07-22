import re

for filename in ['server.ts', 'src/lib/firebaseOperations.ts']:
    with open(filename, 'r') as f:
        content = f.read()
    
    old_queue = """  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const nextPromise = this.promise.then(async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Firestore operation timed out')), 60000);
        });
        const result = await Promise.race([operation(), timeoutPromise]);"""
        
    new_queue = """  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const nextPromise = this.promise.then(async () => {
      try {
        const result = await operation();"""
        
    content = content.replace(old_queue, new_queue)
    
    with open(filename, 'w') as f:
        f.write(content)
