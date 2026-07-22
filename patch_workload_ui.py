import re

with open('src/pages/AdminWorkload.tsx', 'r') as f:
    content = f.read()

old_fetch = """      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);"""

new_fetch = """      if (res.ok) {
        let data = await res.json();
        if (data._base64) {
          const binaryString = window.atob(data._base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          data = JSON.parse(new TextDecoder().decode(bytes));
        }
        setRecords(data.records || []);"""

content = content.replace(old_fetch, new_fetch)

with open('src/pages/AdminWorkload.tsx', 'w') as f:
    f.write(content)
