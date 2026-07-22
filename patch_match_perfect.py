import re

with open('src/pages/AdminEntryMistakes.tsx', 'r') as f:
    content = f.read()

# Replace the ternary that renders "Match Perfect"
old_block = """                                    {r.reasons.length === 0 ? (
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded shadow-sm">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Match Perfect
                                      </span>
                                    ) : (
                                      r.reasons.map((re, reIdx) => (
                                        <span key={`reason-${r.id || 'row'}-${reIdx}`} className="inline-flex items-start justify-between gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[10px] font-semibold px-2.5 py-1.5 rounded-md leading-normal shadow-sm flex w-full">
                                          <span className="flex items-start gap-1.5 min-w-0 whitespace-normal break-words py-0.5">
                                            <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0 mt-0.5" />
                                            <span className="whitespace-normal break-words" title={re}>{re}</span>
                                          </span>
                                          <button
                                            onClick={() => handleDeleteReason(r.id, re)}
                                            title="Delete this mismatch detail"
                                            className="text-red-400 hover:text-red-700 hover:bg-red-200/50 p-0.5 rounded cursor-pointer transition-colors ml-1 shrink-0 self-start"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </span>
                                      ))
                                    )}"""

new_block = """                                    {r.reasons.map((re, reIdx) => (
                                        <span key={`reason-${r.id || 'row'}-${reIdx}`} className="inline-flex items-start justify-between gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[10px] font-semibold px-2.5 py-1.5 rounded-md leading-normal shadow-sm flex w-full">
                                          <span className="flex items-start gap-1.5 min-w-0 whitespace-normal break-words py-0.5">
                                            <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0 mt-0.5" />
                                            <span className="whitespace-normal break-words" title={re}>{re}</span>
                                          </span>
                                          <button
                                            onClick={() => handleDeleteReason(r.id, re)}
                                            title="Delete this mismatch detail"
                                            className="text-red-400 hover:text-red-700 hover:bg-red-200/50 p-0.5 rounded cursor-pointer transition-colors ml-1 shrink-0 self-start"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </span>
                                      ))}"""

content = content.replace(old_block, new_block)

with open('src/pages/AdminEntryMistakes.tsx', 'w') as f:
    f.write(content)

