import { create } from 'zustand';

interface RoomState {
  roomId: string | null;
  userId: number | null;
  token: string | null;
  mediaToken: string | null;
  nodeId: string | null;
  roomCreatedAt: string | null;
  connected: boolean;
  peers: Record<string, any>;
  activeSpeakers: string[];
  setAuth: (token: string, userId: number) => void;
  setRoom: (roomId: string, mediaToken: string, nodeId: string, roomCreatedAt: string) => void;
  setConnected: (status: boolean) => void;
  addPeer: (userId: string, kind: string, track: any) => void;
  removePeer: (userId: string) => void;
  clearPeers: () => void;
  clearRoom: () => void;
  setPeerMediaState: (userId: string, kind: 'video' | 'audio', isMuted: boolean) => void;
  isWhiteboardOpen: boolean;
  setIsWhiteboardOpen: (isOpen: boolean) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: localStorage.getItem('roomId'),
  userId: localStorage.getItem('userId') ? parseInt(localStorage.getItem('userId')!) : null,
  token: localStorage.getItem('token'),
  mediaToken: localStorage.getItem('mediaToken'),
  nodeId: localStorage.getItem('nodeId'),
  roomCreatedAt: localStorage.getItem('roomCreatedAt'),
  connected: false,
  peers: {},
  activeSpeakers: [],
  setAuth: (token, userId) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId.toString());
    set({ token, userId });
  },
  setRoom: (roomId, mediaToken, nodeId, roomCreatedAt) => {
    localStorage.setItem('roomId', roomId);
    localStorage.setItem('mediaToken', mediaToken);
    localStorage.setItem('nodeId', nodeId);
    localStorage.setItem('roomCreatedAt', roomCreatedAt);
    set({ roomId, mediaToken, nodeId, roomCreatedAt });
  },
  setConnected: (status) => set({ connected: status }),
  addPeer: (userId, kind, track) => set((state) => {
    const peers = { ...state.peers };
    // Create a new object for the peer to ensure React detects the change
    const peer = { ...(peers[userId] || { video: null, audio: null, screen: null, videoMuted: false, audioMuted: false }) };
    
    if (kind === 'video') peer.video = track;
    if (kind === 'audio') peer.audio = track;
    if (kind === 'screen') peer.screen = track;
    
    peers[userId] = peer;
    return { peers };
  }),
  removePeer: (userId) => set((state) => {
    const peers = { ...state.peers };
    delete peers[userId];
    return { peers };
  }),
  clearPeers: () => set({ peers: {} }),
  clearRoom: () => {
    localStorage.removeItem('roomId');
    localStorage.removeItem('mediaToken');
    localStorage.removeItem('nodeId');
    localStorage.removeItem('roomCreatedAt');
    set({ roomId: null, mediaToken: null, nodeId: null, roomCreatedAt: null, peers: {} });
  },
  setPeerMediaState: (userId, kind, isMuted) => set((state) => {
    const peers = { ...state.peers };
    const peer = peers[userId];
    if (peer) {
        if (kind === 'video') peer.videoMuted = isMuted;
        if (kind === 'audio') peer.audioMuted = isMuted;
    }
    return { peers };
  }),
  isWhiteboardOpen: false,
  setIsWhiteboardOpen: (isOpen) => set({ isWhiteboardOpen: isOpen }),
}));
