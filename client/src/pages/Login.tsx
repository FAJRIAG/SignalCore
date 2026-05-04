import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useRoomStore } from '../store/useRoomStore';
import { Video, LogIn, User, Mail, Lock, PlusCircle, ArrowRight, ShieldCheck } from 'lucide-react';

const API_URL = '/api';

export default function Login() {
  const [searchParams] = useSearchParams();
  const initialRoomId = searchParams.get('room') ?? '';

  const [mode, setMode] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('New Session');
  const [roomId, setRoomId] = useState(initialRoomId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { setAuth, setRoom } = useRoomStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let token = '';
      let user = null;

      // Auth Logic
      if (authMode === 'login') {
        const { data } = await axios.post(`${API_URL}/login`, { email, password });
        token = data.access_token;
        user = data.user;
      } else {
        if (!name) { setError('Please enter your name to register.'); setLoading(false); return; }
        const { data } = await axios.post(`${API_URL}/register`, { name, email, password });
        token = data.access_token;
        user = data.user;
      }

      setAuth(token, user.id);
      const headers = { Authorization: `Bearer ${token}` };
      let targetRoomId = '';

      if (mode === 'create') {
        const { data: roomData } = await axios.post(`${API_URL}/rooms`, { name: roomName }, { headers });
        targetRoomId = roomData.uuid;
      } else {
        const id = roomId.trim().replace(/.*\/room\//, '');
        if (!id) { setError('Please enter a valid Room ID or link.'); setLoading(false); return; }
        targetRoomId = id;
      }

      const { data: joinData } = await axios.post(`${API_URL}/rooms/${targetRoomId}/join`, {}, { headers });
      setRoom(targetRoomId, joinData.media_token, joinData.node_id, joinData.room.created_at);
      navigate(`/room/${targetRoomId}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[160px] animate-pulse" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-600/10 rounded-full blur-[160px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />

      {/* Header / Clock - Responsive */}
      <div className="absolute top-4 right-4 sm:top-8 sm:right-10 flex items-center gap-3 sm:gap-4 bg-white/5 backdrop-blur-md px-4 py-1.5 sm:px-5 sm:py-2 rounded-full border border-white/10 transition-all duration-300 hover:bg-white/10 z-20">
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
        <span className="text-xs sm:text-sm font-medium tracking-wider text-gray-300 tabular-nums">
          {currentTime} <span className="ml-0.5 opacity-50 font-light text-[10px] sm:text-xs">WIB</span>
        </span>
      </div>

      <div className="w-full max-w-[440px] z-10 mt-12 sm:mt-0">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8 sm:mb-10">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 ring-4 ring-blue-500/10">
            <Video size={24} className="text-white sm:w-[28px] sm:h-[28px]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">SignalCore</h1>
          <p className="text-gray-500 text-[12px] sm:text-sm font-medium">Enterprise-grade Video Collaboration</p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 relative overflow-hidden group">
          {/* Subtle top light effect */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          {/* Mode Selector */}
          <div className="flex p-1 bg-black/40 rounded-xl mb-8 border border-white/5">
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                mode === 'create' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <PlusCircle size={16} />
              Host Room
            </button>
            <button
              onClick={() => setMode('join')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                mode === 'join' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LogIn size={16} />
              Join Room
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Auth Toggle */}
            <div className="flex justify-center gap-4 mb-2">
              <button 
                type="button"
                onClick={() => setAuthMode('login')}
                className={`text-xs uppercase tracking-widest font-bold transition-all ${authMode === 'login' ? 'text-blue-400 border-b border-blue-400' : 'text-gray-600 hover:text-gray-400'}`}
              >
                Login
              </button>
              <button 
                type="button"
                onClick={() => setAuthMode('register')}
                className={`text-xs uppercase tracking-widest font-bold transition-all ${authMode === 'register' ? 'text-blue-400 border-b border-blue-400' : 'text-gray-600 hover:text-gray-400'}`}
              >
                Register
              </button>
            </div>

            {authMode === 'register' && (
              <div className="space-y-1.5 group/input">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Full Name</label>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within/input:text-blue-500 transition-colors" />
                  <input
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                    placeholder="Enter your name"
                    value={name} onChange={e => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5 group/input">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within/input:text-blue-500 transition-colors" />
                <input
                  type="email"
                  required
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                  placeholder="name@company.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5 group/input">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Secure Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within/input:text-blue-500 transition-colors" />
                <input
                  type="password"
                  required
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                  placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            {mode === 'create' ? (
              <div className="space-y-1.5 group/input">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Meeting Title</label>
                <input
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                  placeholder="e.g. Executive Board Meeting"
                  value={roomName} onChange={e => setRoomName(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5 group/input">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Room Identity / Link</label>
                <input
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                  placeholder="Paste invitation link or UUID"
                  value={roomId} onChange={e => setRoomId(e.target.value)}
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 animate-shake">
                <ShieldCheck size={14} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-xl transition-all flex items-center justify-center gap-3 group/btn shadow-xl shadow-blue-600/20 active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="tracking-tight">{mode === 'create' ? 'Initialize Meeting' : 'Connect to Meeting'}</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Footer inside card */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em]">
              Powered by SignalCore Real-time Engine
            </p>
          </div>
        </div>

        {/* Outer Footer */}
        <p className="mt-10 text-center text-gray-500 text-xs">
          Secure, Encrypted, and Low-latency Communication.
        </p>
      </div>
    </div>
  );
}

