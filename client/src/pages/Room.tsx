import { useEffect, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';
import { useRoomStore } from '../store/useRoomStore';
import { VideoGrid } from '../components/VideoGrid';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Link2, Check, Monitor, Edit3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Whiteboard } from '../components/Whiteboard';

interface PendingProducer {
    producerId: string;
    userId: string;
    kind: string;
}

export default function Room() {
    const { 
        mediaToken, 
        roomId, 
        userId, 
        roomCreatedAt, 
        setConnected, 
        addPeer, 
        removePeer, 
        clearPeers, 
        setPeerMediaState,
        isWhiteboardOpen,
        setIsWhiteboardOpen
    } = useRoomStore();
    const navigate = useNavigate();
    
    const wsRef = useRef<WebSocket | null>(null);
    const deviceRef = useRef<Device | null>(null);
    const sendTransportRef = useRef<types.Transport | null>(null);
    const recvTransportRef = useRef<types.Transport | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenProducerRef = useRef<types.Producer | null>(null);
    const pendingProducersRef = useRef<PendingProducer[]>([]);

    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const [screenOn, setScreenOn] = useState(false);
    // Local video track exposed as state so VideoGrid re-renders when camera starts
    const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
    const [localScreenTrack, setLocalScreenTrack] = useState<MediaStreamTrack | null>(null);
    const localScreenTrackRef = useRef<MediaStreamTrack | null>(null);
    const [copied, setCopied] = useState(false);
    const [duration, setDuration] = useState('00:00');
    
    // Calculate start time based on room creation
    const startTimeRef = useRef(roomCreatedAt ? new Date(roomCreatedAt).getTime() : Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            const diff = Math.floor((now - startTimeRef.current) / 1000);
            
            // Protect against negative values if client time is slightly behind server
            const absDiff = Math.max(0, diff);
            
            const hours = Math.floor(absDiff / 3600);
            const minutes = Math.floor((absDiff % 3600) / 60);
            const seconds = absDiff % 60;

            const parts = [];
            if (hours > 0) parts.push(hours.toString().padStart(2, '0'));
            parts.push(minutes.toString().padStart(2, '0'));
            parts.push(seconds.toString().padStart(2, '0'));
            
            setDuration(parts.join(':'));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleCopyInvite = () => {
        const inviteUrl = `${window.location.origin}/?room=${roomId}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    useEffect(() => {
        if (!mediaToken || !roomId) {
            navigate('/');
            return;
        }

        let isMounted = true; // guard against StrictMode double-mount

        console.info('[ROOM] Connecting to SFU...');
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

        wsRef.current = ws;

        ws.onopen = () => {
            console.info('[WS] Connected, sending auth...');
            ws.send(JSON.stringify({ type: 'auth', payload: { token: mediaToken } }));
        };

        ws.onmessage = async (event) => {
            const { type, payload } = JSON.parse(event.data);

            switch (type) {
                case 'auth_success': {
                    if (!isMounted) break;
                    console.info('[AUTH] Success!');
                    clearPeers(); // Clear stale peers before adding new ones
                    setConnected(true);
                    const device = new Device();
                    await device.load({ routerRtpCapabilities: payload.routerRtpCapabilities });
                    if (!isMounted) break; // check again after await
                    deviceRef.current = device;

                    // 1. Create Send Transport
                    ws.send(JSON.stringify({ type: 'createWebRtcTransport', payload: { direction: 'send' } }));
                    
                    // Queue existing producers
                    if (payload.existingProducers) {
                        console.info(`[ROOM] Queuing ${payload.existingProducers.length} existing producers`);
                        payload.existingProducers.forEach((p: any) => {
                            const source = p.appData?.source || 'camera';
                            pendingProducersRef.current.push({
                                producerId: p.producerId,
                                userId: p.userId,
                                kind: source === 'screen' ? 'screen' : p.kind
                            });
                        });
                    }
                    break;
                }

                case 'transportCreated': {
                    const device = deviceRef.current;
                    if (!device) {
                        console.error('[TRANSPORT] deviceRef is null, ignoring transportCreated');
                        break;
                    }
                    const { direction } = payload;
                    // Support both nested { transportInfo: {...} } and flat payload structures
                    const transportInfo = payload.transportInfo ?? payload;
                    if (!transportInfo?.id) {
                        console.error('[TRANSPORT] Invalid transportInfo. Full payload:', JSON.stringify(payload));
                        break;
                    }
                    console.info(`[TRANSPORT] Created ${direction} transport: ${transportInfo.id}`);

                    
                    if (direction === 'send') {
                        const transport = device.createSendTransport(transportInfo);
                        sendTransportRef.current = transport;

                        transport.on('connect', ({ dtlsParameters }, callback, _errback) => {
                            ws.send(JSON.stringify({ type: 'connectTransport', payload: { transportId: transport.id, dtlsParameters } }));
                            ws.addEventListener('message', function listener(e) {
                                const data = JSON.parse(e.data);
                                if (data.type === 'transportConnected' && data.payload.transportId === transport.id) {
                                    ws.removeEventListener('message', listener);
                                    callback();
                                }
                            });
                        });

                        transport.on('produce', async ({ kind, rtpParameters, appData }, callback, _errback) => {
                            ws.send(JSON.stringify({ type: 'produce', payload: { transportId: transport.id, kind, rtpParameters, appData } }));
                            ws.addEventListener('message', function listener(e) {
                                const data = JSON.parse(e.data);
                                if (data.type === 'produced' && data.payload.id) {
                                    ws.removeEventListener('message', listener);
                                    callback({ id: data.payload.id });
                                }
                            });
                        });

                        await startLocalMedia(transport);
                        // Request Recv Transport
                        ws.send(JSON.stringify({ type: 'createWebRtcTransport', payload: { direction: 'recv' } }));
                    } else {
                        const transport = device.createRecvTransport(transportInfo);
                        recvTransportRef.current = transport;

                        transport.on('connect', ({ dtlsParameters }, callback, _errback) => {
                            ws.send(JSON.stringify({ type: 'connectTransport', payload: { transportId: transport.id, dtlsParameters } }));
                            ws.addEventListener('message', function listener(e) {
                                const data = JSON.parse(e.data);
                                if (data.type === 'transportConnected' && data.payload.transportId === transport.id) {
                                    ws.removeEventListener('message', listener);
                                    callback();
                                }
                            });
                        });

                        // Drain pending producers
                        console.info(`[ROOM] Draining ${pendingProducersRef.current.length} pending producers`);
                        while (pendingProducersRef.current.length > 0) {
                            const p = pendingProducersRef.current.shift()!;
                            consume(p.producerId, p.userId, p.kind);
                        }
                    }
                    break;
                }

                case 'newProducer': {
                    const { producerId, userId: peerId, kind, appData } = payload;
                    const source = appData?.source || 'camera';
                    console.info(`[ROOM] New producer available: ${kind} (${source}) from ${peerId}`);
                    if (!recvTransportRef.current) {
                        pendingProducersRef.current.push({ producerId, userId: peerId, kind: source === 'screen' ? 'screen' : kind });
                    } else {
                        consume(producerId, peerId, source === 'screen' ? 'screen' : kind);
                    }
                    break;
                }

                case 'consumed': {
                    const { id, kind, rtpParameters, producerId, peerId, appData } = payload;
                    const source = appData?.source || 'camera';
                    console.info(`[ROOM] Consumed ${kind} (${source}) from producer:${producerId}`);
                    const consumer = await recvTransportRef.current!.consume({
                        id,
                        producerId,
                        kind,
                        rtpParameters,
                    });
                    
                    ws.send(JSON.stringify({ type: 'resumeConsumer', payload: { consumerId: consumer.id } }));
                    addPeer(peerId, source === 'screen' ? 'screen' : kind, consumer.track);
                    break;
                }

                case 'peerLeft': {
                    const { userId: leftUserId } = payload;
                    console.info(`[ROOM] Peer left signal received for: ${leftUserId}`);
                    removePeer(String(leftUserId));
                    break;
                }

                case 'peerToggledMedia': {
                    const { userId: toggleUserId, kind, isMuted } = payload;
                    console.info(`[ROOM] Peer ${toggleUserId} toggled ${kind} to ${isMuted ? 'muted' : 'unmuted'}`);
                    setPeerMediaState(String(toggleUserId), kind, isMuted);
                    break;
                }

                case 'producerClosed': {
                    const { userId: closedUserId, kind } = payload;
                    console.info(`[ROOM] Producer closed: ${kind} from ${closedUserId}`);
                    addPeer(String(closedUserId), kind, null);
                    break;
                }

                case 'whiteboardDraw':
                case 'whiteboardClear':
                case 'whiteboardToggle': {
                    // Use custom events for high-frequency whiteboard data to avoid React state batching/dropping messages
                    window.dispatchEvent(new CustomEvent('whiteboard-signal', { detail: { type, payload } }));
                    
                    if (type === 'whiteboardToggle') {
                        setIsWhiteboardOpen(payload.isOpen);
                    }
                    break;
                }
            }
        };

        async function startLocalMedia(transport: types.Transport) {
            try {
                console.info('[MEDIA] Fetching local user media...');
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStreamRef.current = stream;

                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];

                if (audioTrack) {
                    console.info(`[MEDIA] Audio track: ${audioTrack.label}, enabled=${audioTrack.enabled}`);
                } else {
                    console.warn('[MEDIA] No audio track found!');
                }

                // Set state so VideoGrid re-renders with local camera
                setLocalVideoTrack(videoTrack ?? null);

                addPeer(userId!.toString(), 'video', videoTrack);
                addPeer(userId!.toString(), 'audio', audioTrack);

                console.info('[MEDIA] Producing local video track...');
                if (videoTrack) await transport.produce({ track: videoTrack, appData: { source: 'camera' } });
                console.info('[MEDIA] Producing local audio track...');
                if (audioTrack) await transport.produce({ track: audioTrack, appData: { source: 'mic' } });
            } catch (err: any) {
                console.error("[MEDIA] Error accessing media:", err?.name, err?.message);
                // If audio fails, try video-only
                if (err?.name === 'NotFoundError' || err?.name === 'NotAllowedError') {
                    try {
                        console.warn('[MEDIA] Retrying with video-only...');
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                        localStreamRef.current = stream;
                        const videoTrack = stream.getVideoTracks()[0];
                        setLocalVideoTrack(videoTrack ?? null);
                        setMicOn(false); // No mic available
                        if (videoTrack) await transport.produce({ track: videoTrack, appData: { source: 'camera' } });
                    } catch (e) {
                        console.error('[MEDIA] Video-only also failed:', e);
                    }
                }
            }
        }

        async function consume(producerId: string, peerId: string, _kind: string) {
            if (!wsRef.current || !recvTransportRef.current || !deviceRef.current) return;
            
            console.info(`[ROOM] Requesting to consume producer:${producerId}`);
            wsRef.current.send(JSON.stringify({ 
                type: 'consume', 
                payload: { 
                    transportId: recvTransportRef.current.id, 
                    producerId, 
                    peerId,
                    rtpCapabilities: deviceRef.current.rtpCapabilities 
                } 
            }));
        }

        return () => {
            console.info('[ROOM] Cleaning up...');
            isMounted = false;
            wsRef.current?.close();
            wsRef.current = null;
            deviceRef.current = null;
            sendTransportRef.current = null;
            recvTransportRef.current = null;
            setConnected(false);
            clearPeers();
            setLocalVideoTrack(null);
            localStreamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, [roomId, mediaToken]);

    async function handleShareScreen() {
        if (!sendTransportRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const track = stream.getVideoTracks()[0];
            
            localScreenTrackRef.current = track; // Track in ref for reliable cleanup
            setLocalScreenTrack(track);
            setScreenOn(true);
            addPeer(userId!.toString(), 'screen', track);

            const producer = await sendTransportRef.current.produce({ 
                track, 
                appData: { source: 'screen' } 
            });
            screenProducerRef.current = producer;

            track.onended = () => {
                stopShareScreen();
            };
        } catch (err) {
            console.error('[SCREEN] Error sharing screen:', err);
        }
    }

    function stopShareScreen() {
        // Cleanup producers owned by this peer
        if (screenProducerRef.current) {
            const producerId = screenProducerRef.current.id;
            console.log(`[WS] Closing screen producer:${producerId} for user:${userId}`);
            screenProducerRef.current.close();
            screenProducerRef.current = null;
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'closeProducer',
                    payload: { producerId }
                }));
            }
        }

        // 2. Stop and clear local track
        const track = localScreenTrackRef.current;
        if (track) {
            track.stop();
            localScreenTrackRef.current = null;
        }
        setLocalScreenTrack(null);
        setScreenOn(false);

        // 3. Update store
        addPeer(userId!.toString(), 'screen', null);
    }

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-white font-sans">
            {/* Header with Clock */}
            <header className="h-14 px-6 flex items-center justify-between bg-gray-900/80 backdrop-blur-md border-b border-gray-800 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <Video size={16} className="text-white" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-white tracking-tight">SignalCore</span>
                        <span className="text-gray-600">/</span>
                        <span className="text-sm text-gray-400 font-medium bg-gray-800 px-2 py-0.5 rounded border border-gray-700">Room: {roomId}</span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-xl font-semibold text-white leading-none tracking-tight tabular-nums">
                            {duration}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">
                            Duration
                        </span>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-hidden relative">
                <VideoGrid
                    localVideoTrack={localVideoTrack}
                    localScreenTrack={localScreenTrack}
                    localUserId={userId?.toString()}
                    localMicOn={micOn}
                />

                {isWhiteboardOpen && (
                    <Whiteboard
                        onDraw={(data) => {
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ type: 'whiteboardDraw', payload: data }));
                            }
                        }}
                        onClear={() => {
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ type: 'whiteboardClear' }));
                            }
                        }}
                        onClose={() => {
                            setIsWhiteboardOpen(false);
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ type: 'whiteboardToggle', payload: { isOpen: false } }));
                            }
                        }}
                    />
                )}
            </div>
            <div className="h-20 bg-gray-900 border-t border-gray-800 flex items-center justify-center space-x-6 px-6">
                <button 
                    onClick={() => {
                        const stream = localStreamRef.current;
                        if (!stream) return;
                        const audioTrack = stream.getAudioTracks()[0];
                        if (audioTrack) {
                            audioTrack.enabled = !audioTrack.enabled;
                            setMicOn(audioTrack.enabled);
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({
                                    type: 'toggleMedia',
                                    payload: { kind: 'audio', isMuted: !audioTrack.enabled }
                                }));
                            }
                        }
                    }}
                    className={`p-4 rounded-full transition ${micOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                    {micOn ? <Mic size={24} /> : <MicOff size={24} />}
                </button>
                <button 
                    onClick={() => {
                        const stream = localStreamRef.current;
                        if (!stream) return;
                        const videoTrack = stream.getVideoTracks()[0];
                        if (videoTrack) {
                            videoTrack.enabled = !videoTrack.enabled;
                            setVideoOn(videoTrack.enabled);
                            setLocalVideoTrack(videoTrack.enabled ? videoTrack : null);
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({
                                    type: 'toggleMedia',
                                    payload: { kind: 'video', isMuted: !videoTrack.enabled }
                                }));
                            }
                        }
                    }}
                    className={`p-4 rounded-full transition ${videoOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                    {videoOn ? <Video size={24} /> : <VideoOff size={24} />}
                </button>
                <button 
                    onClick={() => {
                        if (screenOn) {
                            stopShareScreen();
                        } else {
                            handleShareScreen();
                        }
                    }}
                    className={`p-4 rounded-full transition ${screenOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                    title={screenOn ? "Stop sharing screen" : "Share screen"}
                >
                    <Monitor size={24} />
                </button>
                <button 
                    onClick={() => {
                        const newState = !isWhiteboardOpen;
                        setIsWhiteboardOpen(newState);
                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({ type: 'whiteboardToggle', payload: { isOpen: newState } }));
                        }
                    }}
                    className={`p-4 rounded-full transition ${isWhiteboardOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                    title="Whiteboard"
                >
                    <Edit3 size={24} />
                </button>
                <button className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition" onClick={() => navigate('/')}>
                    <PhoneOff size={24} />
                </button>

                {/* Invite button */}
                <button
                    onClick={handleCopyInvite}
                    title="Copy invite link"
                    className={`p-4 rounded-full transition flex items-center gap-2 ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                    {copied ? <Check size={24} /> : <Link2 size={24} />}
                </button>
            </div>
        </div>
    );
}
