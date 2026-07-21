import re

with open('server.ts', 'r') as f:
    content = f.read()

replacement = """
      if (adminDb) {
        const idToDelete = itemToDelete.id || `${itemToDelete.mrnOrganization || ''}_${itemToDelete.actionDateTime || ''}_${itemToDelete.itemNumber || ''}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
        adminDb.collection('application_storage').doc(idToDelete).delete().catch(err => console.error(err));
      }
"""

content = re.sub(r'      if \(adminDb\) \{\n        saveMismatchesBulkToFirestore\(newlyAddedItems\)\.catch\(err => console\.error\(err\)\);\n      \}', replacement, content)

with open('server.ts', 'w') as f:
    f.write(content)
