import re

with open('src/pages/AdminWorkload.tsx', 'r') as f:
    content = f.read()

old_code = """        {uploadedFilesList.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="text-xs font-bold text-[#141414]/50 px-1">Already Uploaded Files (Skipped automatically)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {uploadedFilesList.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-[#141414]/5 bg-[#141414]/[0.02] opacity-60">
                  <FileText className="w-4 h-4 text-[#141414]/40 shrink-0" />
                  <span className="text-[11px] font-bold text-[#141414]/60 truncate flex-1" title={file.filename}>
                    {file.filename}
                  </span>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600/60 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}"""

new_code = """"""

content = content.replace(old_code, new_code)
with open('src/pages/AdminWorkload.tsx', 'w') as f:
    f.write(content)
