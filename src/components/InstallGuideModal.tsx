import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Share, PlusSquare, MoreVertical, LayoutGrid, Copy, Check, Laptop, QrCode } from 'lucide-react';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstallGuideModal({ isOpen, onClose }: InstallGuideModalProps) {
  const [appUrl, setAppUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin);
    }
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy text:', err);
    }
  };

  const qrCodeUrl = appUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appUrl)}&color=141414&bgcolor=ffffff&margin=10`
    : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            className="relative w-full max-w-2xl bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-[#141414]/10"
          >
            {/* Header */}
            <div className="p-6 border-b border-[#141414]/5 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                  <Smartphone className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-[#141414] tracking-tight">Multi-Device Setup Guide</h2>
                  <p className="text-[10px] font-bold text-[#F27D26] uppercase tracking-wider">Access AW-PharmaStock Pro anywhere</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/40 transition-colors"
                id="close-guide-modal-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Container */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh] custom-scrollbar">
              
              {/* Application Link Card */}
              <div className="p-5 bg-[#F27D26]/5 rounded-3xl border border-[#F27D26]/10 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#F27D26]">Application Link</span>
                <div className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    readOnly 
                    value={appUrl || 'Loading portal URL...'} 
                    className="flex-1 bg-white border border-[#141414]/10 text-xs font-mono px-4 py-3 rounded-2xl text-[#141414] shadow-inner outline-none focus:border-[#F27D26]"
                  />
                  <button 
                    onClick={handleCopy}
                    className="p-3 bg-white hover:bg-stone-50 border border-[#141414]/10 rounded-2xl text-[#141414] active:scale-95 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                    title="Copy Portal Link"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#F27D26]" />}
                  </button>
                </div>
                {copied && <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">✓ Copied link successfully to clipboard!</p>}
              </div>

              {/* Dynamic QR Code Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-stone-50/50 p-5 rounded-3xl border border-[#141414]/5">
                <div className="flex flex-col items-center justify-center">
                  <div className="bg-white p-3.5 rounded-3xl shadow-md border border-[#141414]/5 flex items-center justify-center">
                    {qrCodeUrl ? (
                      <img 
                        src={qrCodeUrl} 
                        alt="Scan QR Address" 
                        className="w-40 h-40 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-40 h-40 bg-stone-100 animate-pulse rounded-2xl flex items-center justify-center">
                        <QrCode className="w-10 h-10 text-stone-300 animate-spin" />
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#141414]/40 mt-3 flex items-center gap-1.5 justify-center">
                    <QrCode className="w-3.5 h-3.5 text-[#F27D26]" /> Scan with Camera
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-[#141414] flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#F27D26]" />
                    Instant Mobile Setup
                  </h4>
                  <ul className="space-y-2 text-xs leading-relaxed text-[#141414]/70">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#141414]/5 flex items-center justify-center text-[10px] font-black font-mono shrink-0">1</span>
                      <span>Scan the QR code with your mobile smartphone or tablet camera.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#141414]/5 flex items-center justify-center text-[10px] font-black font-mono shrink-0">2</span>
                      <span>Save as dynamic shortcut on home screen for full app control.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Steps for devices */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* PC Instructions */}
                <div className="p-5 bg-white border border-[#141414]/5 rounded-3xl shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#F27D26]">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-sm text-[#141414]">Personal PC / Desktop</h3>
                  </div>
                  <div className="space-y-3 text-xs leading-relaxed text-[#141414]/70 pl-2">
                    <p>
                      1. Copy the URL above and paste it into <span className="font-bold text-[#141414]">Chrome, Edge, or safari</span> on your computer.
                    </p>
                    <p>
                      2. Bookmark the page (<kbd className="bg-stone-100 px-1 py-0.5 rounded text-[10px] border">Ctrl+D</kbd> or <kbd className="bg-stone-100 px-1 py-0.5 rounded text-[10px] border">⌘+D</kbd>) or right-click the tab and select <span className="font-bold text-[#141414]">"Pin Tab"</span> to keep it available during your shift.
                    </p>
                  </div>
                </div>

                {/* Mobile Instructions */}
                <div className="p-5 bg-white border border-[#141414]/5 rounded-3xl shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-sm text-[#141414]">Smartphones & Tablets</h3>
                  </div>
                  <div className="space-y-3 text-xs leading-relaxed text-[#141414]/70 pl-2">
                    <p className="flex items-start gap-1">
                      <span>• <span className="font-bold text-[#141414]">iOS Safari</span>: Tap the <span className="font-bold text-[#141414]">Share Button</span> in Safari browser, scroll down, and select <span className="font-bold text-[#141414]">"Add to Home Screen"</span>.</span>
                    </p>
                    <p className="flex items-start gap-1">
                      <span>• <span className="font-bold text-[#141414]">Android Chrome</span>: Tap the <span className="font-bold text-[#141414]">Three-Dot Menu</span>, and select <span className="font-bold text-[#141414]">"Install App"</span> or <span className="font-bold text-[#141414]">"Add to Home Screen"</span>.</span>
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5">
              <button 
                onClick={onClose}
                className="w-full py-4 bg-[#141414] text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-black/10 active:scale-[0.98] cursor-pointer"
                id="understand-guide-btn"
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

