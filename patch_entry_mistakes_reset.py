import re

with open('src/pages/AdminEntryMistakes.tsx', 'r') as f:
    content = f.read()

old_reset = """    try {
      const res = await fetch('/api/workload-records/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: resetWorkloadPassword })
      });

      if (!res.ok) {
        const error = await res.json();
        setResetWorkloadError(error.error || 'Failed to reset workload.');
        setIsResettingWorkload(false);
        return;
      }

      setWorkloadRecords([]);"""

new_reset = """    try {
      // Verify password via backend API to clear local workload session securely
      const verifyRes = await fetch('/api/auth/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetWorkloadPassword.trim() })
      });

      if (!verifyRes.ok) {
        setResetWorkloadError('Incorrect password. Reset aborted.');
        setIsResettingWorkload(false);
        return;
      }

      setWorkloadRecords([]);"""

content = content.replace(old_reset, new_reset)
with open('src/pages/AdminEntryMistakes.tsx', 'w') as f:
    f.write(content)
