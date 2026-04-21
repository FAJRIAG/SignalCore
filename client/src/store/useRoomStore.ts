import { create } from 'zustand';

interface RoomState {
  roomId: string | null;
  userId: number | null;
  token: string | null;
  mediaToken: string | null;
  nodeId: string | null;
  connected: boolean;
  peers: Record<string, any>;
  activeSpeakers: string[];
  setAuth: (token: string, userId: number) => void;
  setRoom: (roomId: string, mediaToken: string, nodeId: string) => void;
  setConnected: (status: boolean) => void;
  addPeer: (userId: string, kind: string, track: any) => void;
  removePeer: (userId: string) => void;
  setPeerMediaState: (userId: string, kind: 'video' | 'audio', isMuted: boolean) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  userId: null,
  token: localStorage.getItem('token'),
  mediaToken: null,
  nodeId: null,
  connected: false,
  peers: {},
  activeSpeakers: [],
  setAuth: (token, userId) => {
    localStorage.setItem('token', token);
    set({ token, userId });
  },
  setRoom: (roomId, mediaToken, nodeId) => set({ roomId, mediaToken, nodeId }),
  setConnected: (status) => set({ connected: status }),
  addPeer: (userId, kind, track) => set((state) => {
    const peers = { ...state.peers };
    const peer = peers[userId] || { video: null, audio: null };
    if (kind === 'video') peer.video = track;
    if (kind === 'audio') peer.audio = track;
    peers[userId] = peer;
    return { peers };
  }),
  removePeer: (userId) => set((state) => {
    const peers = { ...state.peers };
    delete peers[userId];
    return { peers };
  }),
  setPeerMediaState: (userId, kind, isMuted) => set((state) => {
    const peers = { ...state.peers };
    const peer = peers[userId];
    if (peer) {
        if (kind === 'video') peer.videoMuted = isMuted;
        if (kind === 'audio') peer.audioMuted = isMuted;
    }
    return { peers };
  }),
}));
