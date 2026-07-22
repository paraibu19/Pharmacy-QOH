import re

with open('src/pages/AdminWorkload.tsx', 'r') as f:
    content = f.read()

# Remove the Detailed Workload Log block
pattern = r'      \{\/\* Filtered Records Log Table with Download Reports Actions \*\/\}.*?      \{\/\* Admin Password Reset/Purge Modal \*\/\}'

# Replace with just the comment for the modal
content = re.sub(pattern, '      {/* Admin Password Reset/Purge Modal */}', content, flags=re.DOTALL)

with open('src/pages/AdminWorkload.tsx', 'w') as f:
    f.write(content)

