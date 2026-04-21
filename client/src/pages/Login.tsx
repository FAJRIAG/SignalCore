import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useRoomStore } from '../store/useRoomStore';
import { Video, LogIn } from 'lucide-react';

const API_URL = 'http://localhost:8000/api';

export default function Login() {
  const [searchParams] = useSearchParams();
  const initialRoomId = searchParams.get('room') ?? '';

  const [mode, setMode] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('My Room');
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
      // 1. Login or Register
      let token = '';
      let user = null;
      try {
        const { data } = await axios.post(`${API_URL}/login`, { email, password });
        token = data.access_token;
        user = data.user;
      } catch {
        if (!name) { setError('Account not found. Enter your name to register.'); setLoading(false); return; }
        const { data } = await axios.post(`${API_URL}/register`, { name, email, password });
        token = data.access_token;
        user = data.user;
      }

      setAuth(token, user.id);
      const headers = { Authorization: `Bearer ${token}` };

      let targetRoomId = '';

      if (mode === 'create') {
        // 2a. Create new room
        const { data: roomData } = await axios.post(`${API_URL}/rooms`, { name: roomName }, { headers });
        targetRoomId = roomData.uuid;
      } else {
        // 2b. Join existing room — support full URL paste or just UUID
        const id = roomId.trim().replace(/.*\/room\//, '');
        if (!id) { setError('Please enter a valid Room ID or link.'); setLoading(false); return; }
        targetRoomId = id;
      }

      // 3. Join the room
      const { data: joinData } = await axios.post(`${API_URL}/rooms/${targetRoomId}/join`, {}, { headers });
      setRoom(targetRoomId, joinData.media_token, joinData.node_id, joinData.room.created_at);
      navigate(`/room/${targetRoomId}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to join. Check your credentials or room ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />

      {/* Floating Clock */}
      <div className="absolute top-8 right-8 text-right">
        <div className="text-3xl font-light text-white tracking-tighter tabular-nums">
          {currentTime}
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold mt-1">
          WIB
        </div>
      </div>

      <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-800 relative overflow-hidden z-10 transition-all hover:border-gray-700/50">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600" />

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Video size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SignalCore</h1>
        </div>

        {/* Mode Tabs */}
        <div className="flex rounded-lg bg-gray-800 p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${mode === 'create' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            New Room
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${mode === 'join' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Join Room
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name field — for new account registration */}
          <div>
            <label className="block text-gray-400 text-sm mb-1">
              Name <span className="text-gray-600 text-xs">(only needed for new accounts)</span>
            </label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              placeholder="Your name"
              value={name} onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>

          {mode === 'create' ? (
            <div>
              <label className="block text-gray-400 text-sm mb-1">Room Name</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                placeholder="e.g. Daily Standup"
                value={roomName} onChange={e => setRoomName(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="block text-gray-400 text-sm mb-1">Room ID or Invite Link</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                placeholder="Paste room link or ID here"
                value={roomId} onChange={e => setRoomId(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            {loading ? 'Connecting...' : mode === 'create' ? 'Create & Join Room' : 'Join Room'}
          </button>
        </form>
      </div>
    </div>
  );
}
