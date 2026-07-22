import re

with open('src/pages/AdminEntryMistakes.tsx', 'r') as f:
    content = f.read()

old_fetch = """  const fetchSavedWorkload = async () => {
    try {
      setWorkloadLoading(true);
      const res = await fetch('/api/workload-records?mismatchOnly=true');
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          const totalVal = data.summary.total || 0;
          setUploadedTotalCount(totalVal);
          sessionStorage.setItem('uploaded_total_count', String(totalVal));
        }
        if (data.records && data.records.length > 0) {
          setWorkloadRecords(data.records);
          setWorkloadUploaded(true);
          sessionStorage.setItem('daily_workload_records', JSON.stringify(data.records));
          sessionStorage.setItem('daily_workload_uploaded', 'true');
        }
      }
    } catch (err) {
      console.warn('Failed to load saved workload from server:', err);
    } finally {
      setWorkloadLoading(false);
    }
  };"""

new_fetch = """  const fetchSavedWorkload = async () => {
    // Isolated Workload for Entry Mistakes Report Board:
    // We intentionally DO NOT fetch from /api/workload-records here 
    // to keep it separated from the Workload Analysis Page as requested.
    setWorkloadLoading(false);
  };"""

content = content.replace(old_fetch, new_fetch)

with open('src/pages/AdminEntryMistakes.tsx', 'w') as f:
    f.write(content)
