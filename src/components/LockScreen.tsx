import React, { useState, useEffect } from 'react';
import { Lock, Unlock } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [storedPassword, setStoredPassword] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = localStorage.getItem('readflow_password');
    setStoredPassword(p);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storedPassword) {
      if (password.length < 4) {
        setError('Password must be at least 4 characters');
        return;
      }
      localStorage.setItem('readflow_password', password);
      onUnlock();
    } else {
      if (password === storedPassword) {
        onUnlock();
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center p-4 z-50">
      <div className="w-full max-w-sm bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl text-center">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
          {storedPassword ? <Lock size={32} className="text-zinc-400" /> : <Unlock size={32} className="text-zinc-400" />}
        </div>
        
        <h2 className="text-2xl font-bold mb-2">
          {storedPassword ? 'Welcome Back' : 'Set Password'}
        </h2>
        <p className="text-zinc-400 mb-8 text-sm">
          {storedPassword 
            ? 'Enter your password to access your library.' 
            : 'Set a local password to protect your library.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder="••••"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
          
          <button 
            type="submit"
            className="w-full bg-zinc-100 text-zinc-900 font-medium py-3 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            {storedPassword ? 'Unlock' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};
