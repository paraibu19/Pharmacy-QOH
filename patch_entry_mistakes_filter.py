import re

with open('src/pages/AdminEntryMistakes.tsx', 'r') as f:
    content = f.read()

# 1. Remove state and toggle function
old_state = """  const [filterMismatchesOnly, setFilterMismatchesOnly] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem('filter_mismatches_only');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleFilterMismatchesOnly = () => {
    setFilterMismatchesOnly(prev => {
      const next = !prev;
      try {
        sessionStorage.setItem('filter_mismatches_only', String(next));
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
  };"""
content = content.replace(old_state, "")

# 2. Update filteredRecords calculation
old_filter = """  const filteredRecords = React.useMemo(() => {
    const baseList = activeReportType === 'standard' 
      ? (filterMismatchesOnly ? workloadRecords.filter(r => r.isMismatch) : workloadRecords)
      : brandVsGenericRecords;"""
new_filter = """  const filteredRecords = React.useMemo(() => {
    const baseList = activeReportType === 'standard' 
      ? workloadRecords.filter(r => r.isMismatch)
      : brandVsGenericRecords;"""
content = content.replace(old_filter, new_filter)

# 3. Update dependency array
content = content.replace(", filterMismatchesOnly]);", "]);")

# 4. Remove toggle button in UI
old_btn = """                  {/* OPEN / CLOSE BUTTON FOR MISMATCH PARAMETERS FILTER */}
                  <button
                    onClick={toggleFilterMismatchesOnly}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 ${
                      filterMismatchesOnly 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                        : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    }`}
                    title={filterMismatchesOnly ? "Deactivate mismatch filtering (Show all records)" : "Activate mismatch filtering (Show mismatches only)"}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        filterMismatchesOnly ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        filterMismatchesOnly ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}></span>
                    </span>
                    <span>Mismatch Filter: {filterMismatchesOnly ? 'OPEN (Active)' : 'CLOSED (Deactive)'}</span>
                  </button>"""
content = content.replace(old_btn, "")

# 5. Remove the note
old_note = """                        {!filterMismatchesOnly && (
                          <p className="text-[9px] text-amber-700 font-bold mt-1 max-w-[200px]">
                            ⚡ Fast preview mode active (100 rows loaded in UI, full dataset saved to Server Workload Database).
                          </p>
                        )}"""
content = content.replace(old_note, "")

with open('src/pages/AdminEntryMistakes.tsx', 'w') as f:
    f.write(content)

