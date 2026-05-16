import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Share, PlusSquare, MoreVertical, LayoutGrid } from 'lucide-react';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstallGuideModal({ isOpen, onClose }: InstallGuideModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-[#141414]/10"
          >
            {/* Header */}
            <div className="p-6 border-b border-[#141414]/5 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#141414]">Mobile App Guide</h2>
                  <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Add AW-PharmaStock Pro to Home Screen</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/40 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content searching for tabs / scrollable area */}
            <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
              {/* Logo Preview */}
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                 <div className="relative group">
                    <div className="absolute inset-0 bg-[#F27D26]/20 blur-2xl rounded-full group-hover:bg-[#F27D26]/30 transition-all duration-500" />
                    <img 
                      src="/icon.svg?v=8" 
                      alt="App Icon" 
                      className="relative w-24 h-24 rounded-3xl shadow-2xl border-4 border-white transform hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                 </div>
                 <div className="text-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#141414]/30">Previewing App Logo</span>
                 </div>
              </div>

              {/* iOS Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-black text-xs">iOS</div>
                  <h3 className="font-bold text-[#141414]">For iPhone (Safari)</h3>
                </div>
                <div className="space-y-4 pl-4 border-l-2 border-blue-100">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-0.5">
                      <Share className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-[#141414]/70 leading-relaxed font-medium">
                      1. Open this website in <span className="font-bold text-[#141414]">Safari</span> and tap the <span className="font-bold text-[#141414]">Share</span> icon in the bottom menu.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-0.5">
                      <PlusSquare className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-[#141414]/70 leading-relaxed font-medium">
                      2. Scroll down the list of options and tap <span className="font-bold text-[#141414]">"Add to Home Screen"</span>.
                    </p>
                  </div>
                </div>
              </section>

              {/* Android Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-black text-xs">Droid</div>
                  <h3 className="font-bold text-[#141414]">For Android (Chrome)</h3>
                </div>
                <div className="space-y-4 pl-4 border-l-2 border-emerald-100">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0 mt-0.5">
                      <MoreVertical className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-[#141414]/70 leading-relaxed font-medium">
                      1. Open this website in <span className="font-bold text-[#141414]">Chrome</span> and tap the <span className="font-bold text-[#141414]">Three Dots</span> (Menu) in the top right.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0 mt-0.5">
                      <LayoutGrid className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-[#141414]/70 leading-relaxed font-medium">
                      2. Tap <span className="font-bold text-[#141414]">"Install app"</span> or <span className="font-bold text-[#141414]">"Add to Home screen"</span> from the menu.
                    </p>
                  </div>
                </div>
              </section>

            </div>

            {/* Footer */}
            <div className="p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5">
              <button 
                onClick={onClose}
                className="w-full py-4 bg-[#141414] text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-black/10 active:scale-[0.98]"
              >
                Understood, Got it!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
