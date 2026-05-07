import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';

interface AdminLoginProps {
  onLogin: () => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });

      if (res.ok) {
        if (auth) {
          // Sign in anonymously to Firebase to allow database writes
          await signInAnonymously(auth).catch(err => {
             console.warn('Anonymous sign-in failed (ensure it is enabled in Firebase Console):', err);
          });
        }
        onLogin();
        navigate('/admin/dashboard');
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid password');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('Connection error. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-2xl border border-[#141414]/10 shadow-sm"
      >
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-[#F27D26]/10 rounded-full">
            <Key className="w-8 h-8 text-[#F27D26]" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">Admin Access</h1>
        <p className="text-center text-[#141414]/60 text-sm mb-8">
          Sign in with your authorized password to manage the inventory system.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
              Admin Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#141414]/40 hover:text-[#141414] transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-xs font-medium ml-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#141414]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Access Dashboard
          </button>
        </form>

        <div className="pt-6 mt-6 border-t border-[#141414]/5 text-center">
          <p className="text-[10px] text-[#141414]/40 leading-relaxed">
            Authorized access only. All actions are logged and audited for pharmacy compliance.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
