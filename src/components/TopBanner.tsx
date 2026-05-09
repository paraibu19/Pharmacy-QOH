import React from 'react';
import { useSystemConfig } from '../hooks/useSystemConfig';
import { Megaphone, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function TopBanner() {
  const { config, loading } = useSystemConfig();
  const [showAnnouncement, setShowAnnouncement] = React.useState(true);

  if (loading || !config) return null;

  return (
    <div className="flex flex-col w-full overflow-hidden">
      {/* Visual Poster Banner */}
      {config.topPosterUrl && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full h-32 md:h-48 lg:h-64 relative overflow-hidden bg-[#141414]"
        >
          <img 
            src={config.topPosterUrl} 
            alt="Pharmacy Top Banner" 
            className="w-full h-full object-cover opacity-90"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414]/40 to-transparent" />
        </motion.div>
      )}

      {/* Announcement Bar */}
      <AnimatePresence>
        {config.announcement && showAnnouncement && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#F27D26] text-white py-2 px-4 shadow-sm flex items-center justify-between relative overflow-hidden"
          >
            <div className="flex items-center gap-3 max-w-4xl mx-auto flex-1">
              <Megaphone className="w-4 h-4 animate-bounce" />
              <p className="text-xs md:text-sm font-bold tracking-wide uppercase">
                {config.announcement}
              </p>
            </div>
            <button 
              onClick={() => setShowAnnouncement(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
