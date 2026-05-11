import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Eye, EyeOff, Loader2, AlertCircle, Check } from 'lucide-react';
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
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'change'>('login');
  const [resetRequested, setResetRequested] = useState(false);
  
  // States for change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const navigate = useNavigate();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (res.ok) {
        setSuccess('Password changed successfully. You can now login with your new password.');
        setView('login');
        setPassword('');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
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
          try {
            await signInAnonymously(auth);
          } catch (err) {
            console.warn('Anonymous sign-in failed (ensure it is enabled in Firebase Console):', err);
          }
        }
        onLogin();
        navigate('/admin/dashboard');
      } else {
        let errorMessage = 'Invalid password';
        try {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } catch (e) {
          console.error('Failed to parse error response:', e);
          errorMessage = `Server error (${res.status})`;
        }
        setError(errorMessage);
      }
    } catch (err: any) {
      console.error('Auth error detail:', err);
      setError(err?.message === 'The string did not match the expected pattern.' 
        ? 'Login failed: Possible browser or network configuration issue.'
        : 'Connection error. Please check if the server is running.');
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
        
        <h1 className="text-2xl font-bold text-center mb-2">
          {view === 'login' && 'Admin Access'}
          {view === 'change' && 'Change Password'}
        </h1>
        <p className="text-center text-[#141414]/60 text-sm mb-8">
          {view === 'login' && 'Sign in with your authorized password to manage AW-PharmaStock Pro.'}
          {view === 'change' && 'Enter your current password to set a new one.'}
        </p>

        {success && view !== 'login' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-medium"
          >
            <Check size={18} />
            {success}
          </motion.div>
        )}

        {view === 'login' && (
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

            <div className="flex items-center justify-end px-1">
              <button 
                type="button" 
                onClick={() => { setView('change'); setError(''); }}
                className="text-[10px] font-bold text-[#141414]/60 hover:text-[#141414] uppercase tracking-widest"
              >
                Change Password?
              </button>
            </div>

            {error && (
              <p className="text-red-500 text-xs font-medium ml-1">{error}</p>
            )}

            {success && (
              <p className="text-green-600 text-xs font-medium ml-1">{success}</p>
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
        )}

        {view === 'change' && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-xs font-medium ml-1">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setView('login'); setError(''); }}
                className="flex-1 py-3 border-2 border-[#141414]/10 text-[#141414] rounded-xl font-bold hover:bg-[#141414]/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] py-3 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#F27D26]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#F27D26]/20"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Change Password
              </button>
            </div>
          </form>
        )}

        <div className="pt-6 mt-6 border-t border-[#141414]/5 text-center">
          <p className="text-[10px] text-[#141414]/40 leading-relaxed">
            Authorized access only. All actions are logged and audited for pharmacy compliance.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
