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
  addPeer: (socketId: string, userId: string, kind: string, track: any) => void;
  removePeer: (socketId: string) => void;
  clearPeers: () => void;
  clearRoom: () => void;
  setPeerMediaState: (socketId: string, kind: 'video' | 'audio', isMuted: boolean) => void;
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
  addPeer: (socketId, userId, kind, track) => set((state) => {
    const peers = { ...state.peers };
    const existingPeer = peers[socketId] || { 
        userId, 
        video: null, 
        audio: null, 
        screen: null, 
        videoMuted: false, 
        audioMuted: false 
    };
    
    // Create a new object for the peer to ensure React detects the change
    const peer = { ...existingPeer };
    
    if (kind === 'video') peer.video = track;
    if (kind === 'audio') peer.audio = track;
    if (kind === 'screen') peer.screen = track;
    
    peers[socketId] = peer;
    return { peers };
  }),
  removePeer: (socketId) => set((state) => {
    const peers = { ...state.peers };
    delete peers[socketId];
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
  setPeerMediaState: (socketId, kind, isMuted) => set((state) => {
    const peers = { ...state.peers };
    if (peers[socketId]) {
        const peer = { ...peers[socketId] };
        if (kind === 'video') peer.videoMuted = isMuted;
        if (kind === 'audio') peer.audioMuted = isMuted;
        peers[socketId] = peer;
    }
    return { peers };
  }),
  isWhiteboardOpen: false,
  setIsWhiteboardOpen: (isOpen) => set({ isWhiteboardOpen: isOpen }),
}));
