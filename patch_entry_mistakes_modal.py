import re

with open('src/pages/AdminEntryMistakes.tsx', 'r') as f:
    content = f.read()

old_text = "Continuing will permanently delete all stored Daily HBKMC Workload records from both this server and Cloud Firestore. Please verify your"
new_text = "Continuing will permanently clear the loaded Workload records from this Entry Mistakes Report Board. The Workload Analysis database will not be affected. Please verify your"

content = content.replace(old_text, new_text)

with open('src/pages/AdminEntryMistakes.tsx', 'w') as f:
    f.write(content)
