import React, { useState, useEffect } from 'react';
import { Pill, Lock, Mail, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { technicianAuthOps } from '../lib/firebaseOperations';

interface PharmacistLoginProps {
  onLogin: () => void;
}

export default function PharmacistLogin({ onLogin }: PharmacistLoginProps) {
  const [password, setPassword] = useState('');
  const [persistedPassword, setPersistedPassword] = useState('pharmacist123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    technicianAuthOps.getPassword()
      .then(setPersistedPassword)
      .catch(() => setPersistedPassword('pharmacist123'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (password === persistedPassword) {
        onLogin();
        navigate('/pharmacist');
      } else {
        setError('Incorrect password. Access denied.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl border border-[#141414]/10 shadow-xl overflow-hidden"
      >
        <div className="bg-[#141414] p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl" />
          
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4 backdrop-blur-sm">
            <Pill className="w-8 h-8 text-[#F27D26]" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Pharmacist Access</h2>
          <p className="text-white/40 text-sm mt-1 uppercase tracking-widest font-bold">Enter Password</p>
        </div>

        <div className="p-8">
          <form 
            onSubmit={handleSubmit} 
            className="space-y-6"
          >
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                  Security Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-4 bg-[#141414]/5 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all text-sm font-bold tracking-widest"
                />
              </div>
              <p className="text-[10px] text-[#141414]/30 px-1 italic">
                * Password can be managed by Admin in the Security Portal
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#141414] text-white py-4 rounded-xl font-bold text-sm hover:bg-[#141414]/90 transition-all flex items-center justify-center gap-2 group"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
