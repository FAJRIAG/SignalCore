import { useEffect, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';
import { useRoomStore } from '../store/useRoomStore';
import { VideoGrid } from '../components/VideoGrid';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Link2, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingProducer {
    producerId: string;
    userId: string;
    kind: string;
}

export default function Room() {
    const { mediaToken, roomId, userId, setConnected, addPeer, removePeer, setPeerMediaState } = useRoomStore();
    const navigate = useNavigate();
    
    const wsRef = useRef<WebSocket | null>(null);
    const deviceRef = useRef<Device | null>(null);
    const sendTransportRef = useRef<types.Transport | null>(null);
    const recvTransportRef = useRef<types.Transport | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingProducersRef = useRef<PendingProducer[]>([]);

    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    // Local video track exposed as state so VideoGrid re-renders when camera starts
    const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
    const [copied, setCopied] = useState(false);

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
        const ws = new WebSocket('ws://localhost:3000');
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
                            pendingProducersRef.current.push({
                                producerId: p.producerId,
                                userId: p.userId,
                                kind: p.kind
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
                    const { producerId, userId: peerId, kind } = payload;
                    console.info(`[ROOM] New producer available: ${kind} from ${peerId}`);
                    if (!recvTransportRef.current) {
                        pendingProducersRef.current.push({ producerId, userId: peerId, kind });
                    } else {
                        consume(producerId, peerId, kind);
                    }
                    break;
                }

                case 'consumed': {
                    const { id, kind, rtpParameters, producerId, peerId } = payload;
                    console.info(`[ROOM] Consumed ${kind} from producer:${producerId}`);
                    const consumer = await recvTransportRef.current!.consume({
                        id,
                        producerId,
                        kind,
                        rtpParameters,
                    });
                    
                    ws.send(JSON.stringify({ type: 'resumeConsumer', payload: { consumerId: consumer.id } }));
                    addPeer(peerId, kind, consumer.track);
                    break;
                }

                case 'peerLeft': {
                    const { userId: leftUserId } = payload;
                    console.info(`[ROOM] Peer left: ${leftUserId}`);
                    removePeer(String(leftUserId));
                    break;
                }

                case 'peerToggledMedia': {
                    const { userId: toggleUserId, kind, isMuted } = payload;
                    console.info(`[ROOM] Peer ${toggleUserId} toggled ${kind} to ${isMuted ? 'muted' : 'unmuted'}`);
                    setPeerMediaState(String(toggleUserId), kind, isMuted);
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
                if (videoTrack) await transport.produce({ track: videoTrack });
                console.info('[MEDIA] Producing local audio track...');
                if (audioTrack) await transport.produce({ track: audioTrack });
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
                        if (videoTrack) await transport.produce({ track: videoTrack });
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
            setLocalVideoTrack(null);
            localStreamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, [roomId, mediaToken]);

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-white">
            <div className="flex-1 overflow-hidden">
                <VideoGrid
                    localVideoTrack={localVideoTrack}
                    localUserId={userId?.toString()}
                    localMicOn={micOn}
                />
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
