import re

with open('server.ts', 'r') as f:
    content = f.read()
    
old_delete = """      const commitPromise = batch.commit();
      const commitTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore commit timeout')), 60000));
      await Promise.race([commitPromise, commitTimeout]);"""

new_delete = """      await batch.commit();"""

content = content.replace(old_delete, new_delete)

with open('server.ts', 'w') as f:
    f.write(content)
