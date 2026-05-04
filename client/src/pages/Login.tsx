import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useRoomStore } from '../store/useRoomStore';
import { Video, AlertCircle } from 'lucide-react';

const API_URL = '/api';

export default function Login() {
  const [searchParams] = useSearchParams();
  const initialRoomId = searchParams.get('room') ?? '';

  const [mode, setMode] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState(initialRoomId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { setAuth, setRoom } = useRoomStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let token = '';
      let user = null;

      if (authMode === 'login') {
        const { data } = await axios.post(`${API_URL}/login`, { email, password });
        token = data.access_token;
        user = data.user;
      } else {
        if (!name) { setError('Harap masukkan nama lengkap Anda untuk mendaftar.'); setLoading(false); return; }
        const { data } = await axios.post(`${API_URL}/register`, { name, email, password });
        token = data.access_token;
        user = data.user;
      }

      setAuth(token, user.id);
      const headers = { Authorization: `Bearer ${token}` };
      let targetRoomId = '';

      if (mode === 'create') {
        const finalRoomName = roomName || 'Sesi Baru';
        const { data: roomData } = await axios.post(`${API_URL}/rooms`, { name: finalRoomName }, { headers });
        targetRoomId = roomData.uuid;
      } else {
        const id = roomId.trim().replace(/.*\/room\//, '');
        if (!id) { setError('Harap masukkan ID Rapat atau tautan yang valid.'); setLoading(false); return; }
        targetRoomId = id;
      }

      const { data: joinData } = await axios.post(`${API_URL}/rooms/${targetRoomId}/join`, {}, { headers });
      setRoom(targetRoomId, joinData.media_token, joinData.node_id, joinData.room.created_at);
      navigate(`/room/${targetRoomId}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Autentikasi gagal. Harap periksa kembali kredensial Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-blue-100 selection:text-blue-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <Video className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          SignalCore
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Platform konferensi video tingkat Enterprise
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl sm:px-10">
          
          {/* Mode Selector */}
          <div className="flex bg-gray-100 p-1 rounded-lg mb-8">
             <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${mode === 'create' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-700'}`}
             >
                Rapat Baru
             </button>
             <button
                type="button"
                onClick={() => setMode('join')}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${mode === 'join' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-700'}`}
             >
                Gabung Rapat
             </button>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Auth Toggle */}
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Detail Akun</span>
                <div className="flex gap-4">
                    <button type="button" onClick={() => setAuthMode('login')} className={`text-sm font-medium transition-colors ${authMode === 'login' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Masuk</button>
                    <button type="button" onClick={() => setAuthMode('register')} className={`text-sm font-medium transition-colors ${authMode === 'register' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Daftar</button>
                </div>
            </div>

            {authMode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
                <div className="mt-1">
                  <input
                    type="text"
                    required={authMode === 'register'}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="Budi Santoso"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Email Kerja</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                  placeholder="nama@perusahaan.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Kata Sandi</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100 mb-4">
                    <span className="text-sm font-semibold text-gray-900">Detail Rapat</span>
                </div>
                {mode === 'create' ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700">Judul Rapat (Opsional)</label>
                    <div className="mt-1">
                    <input
                        type="text"
                        value={roomName}
                        onChange={e => setRoomName(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="Evaluasi Mingguan"
                    />
                    </div>
                </div>
                ) : (
                <div>
                    <label className="block text-sm font-medium text-gray-700">ID Rapat atau Tautan</label>
                    <div className="mt-1">
                    <input
                        type="text"
                        required={mode === 'join'}
                        value={roomId}
                        onChange={e => setRoomId(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="Tempel tautan undangan atau ID"
                    />
                    </div>
                </div>
                )}
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                    mode === 'create' ? 'Mulai Rapat' : 'Gabung Rapat'
                )}
              </button>
            </div>
          </form>
        </div>
        
        <p className="mt-8 text-center text-sm text-gray-500">
          Diberdayakan oleh SignalCore Real-time Engine
        </p>
      </div>
    </div>
  );
}
