import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';
import { 
    createMediasoupWorkers, 
    createRoomRouter, 
    createWebRtcTransport, 
    connectTransport,
    produce,
    routers,
    transports,
    producers,
    consumers
} from './mediasoup';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const pubClient = createClient({ url: REDIS_URL });
const subClient = createClient({ url: REDIS_URL });

const NODE_ID = 'node-1'; // the id that laravel expects

const jwtPublicKeyPath = path.resolve(__dirname, '../../api/storage/jwt-public.key');
const jwtPublicKey = fs.readFileSync(jwtPublicKeyPath, 'utf8');

// Maps to keep track of sockets
const roomPeers: Record<string, Set<WebSocket>> = {};

wss.on('connection', (ws: WebSocket, req) => {
    let roomId = '';
    let userId = 0;
    
    ws.on('message', async (message: string) => {
        try {
            const data = JSON.parse(message);
            const { type, payload } = data;

            switch (type) {
                case 'auth': {
                    const { token } = payload;
                    console.log(`[AUTH] User attempting to auth...`);
                    try {
                        const decoded: any = jwt.verify(token, jwtPublicKey, { algorithms: ['RS256'] });
                        roomId = decoded.roomId;
                        userId = decoded.userId;
                        console.log(`[AUTH] success! User:${userId}, Room:${roomId}`);

                        if (!roomPeers[roomId]) roomPeers[roomId] = new Set();
                        roomPeers[roomId]!.add(ws);
                        
                        // Ensure Router exists
                        if (!routers.has(roomId)) {
                            await createRoomRouter(roomId);
                        }

                        // Find existing producers in this room
                        const existingProducers = [];
                        for (const producer of producers.values()) {
                            if (producer.appData.roomId === roomId && producer.appData.userId !== userId) {
                                existingProducers.push({
                                    producerId: producer.id,
                                    userId: producer.appData.userId,
                                    kind: producer.kind
                                });
                            }
                        }

                        ws.send(JSON.stringify({ 
                            type: 'auth_success', 
                            payload: { 
                                routerRtpCapabilities: routers.get(roomId)!.rtpCapabilities,
                                existingProducers
                            } 
                        }));
                    } catch (err) {
                        console.error(`[AUTH] error:`, err);
                        ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Invalid JWT' } }));
                        ws.close();
                    }
                    break;
                }
                
                case 'createWebRtcTransport': {
                    const { direction } = payload;
                    console.log(`[TRANSPORT] Creating ${direction} transport for User:${userId} in Room:${roomId}`);
                    const transportInfo = await createWebRtcTransport(roomId);
                    const transport = transports.get(transportInfo.id);
                    if (transport) transport.appData = { roomId, userId, direction };

                    console.log(`[TRANSPORT] Sending transportInfo id=${transportInfo.id}, direction=${direction}`);
                    ws.send(JSON.stringify({ 
                        type: 'transportCreated', 
                        payload: { transportInfo, direction } 
                    }));
                    break;
                }

                case 'connectTransport': {
                    const { transportId, dtlsParameters } = payload;
                    console.log(`[TRANSPORT] Connecting transport:${transportId}`);
                    await connectTransport(transportId, dtlsParameters);
                    ws.send(JSON.stringify({ type: 'transportConnected', payload: { transportId } }));
                    break;
                }

                case 'produce': {
                    const { transportId, kind, rtpParameters } = payload;
                    console.log(`[PRODUCE] User:${userId} producing ${kind} on transport:${transportId}`);
                    const producerId = await produce(transportId, kind, rtpParameters, { userId, roomId });
                    ws.send(JSON.stringify({ type: 'produced', payload: { id: producerId } }));
                    
                    // Broadcast new producer to room
                    broadcastToRoom(roomId, {
                        type: 'newProducer',
                        payload: { producerId, userId, kind }
                    }, ws);
                    break;
                }

                case 'consume': {
                    const { transportId, producerId, rtpCapabilities, peerId } = payload;
                    console.log(`[CONSUME] User:${userId} consuming Producer:${producerId} from Peer:${peerId}`);
                    const router = routers.get(roomId);
                    if (!router) throw new Error("Router not found");

                    if (!router.canConsume({ producerId, rtpCapabilities })) {
                        throw new Error('Cannot consume');
                    }

                    const transport = transports.get(transportId);
                    if(!transport) throw new Error("Transport not found");
                    
                    const consumer = await transport.consume({
                        producerId,
                        rtpCapabilities,
                        paused: true
                    });

                    consumers.set(consumer.id, consumer);

                    consumer.on('transportclose', () => {
                        consumer.close();
                        consumers.delete(consumer.id);
                    });
                    consumer.on('producerclose', () => {
                        consumer.close();
                        consumers.delete(consumer.id);
                    });

                    // Send back to client
                    ws.send(JSON.stringify({
                        type: 'consumed',
                        payload: {
                            id: consumer.id,
                            producerId,
                            kind: consumer.kind,
                            rtpParameters: consumer.rtpParameters,
                            peerId // Pass back the peerId so client knows who it's consuming from
                        }
                    }));
                    break;
                }
                
                case 'resumeConsumer': {
                    const { consumerId } = payload;
                    console.log(`[RESUME] Resuming consumer:${consumerId}`);
                    const consumer = consumers.get(consumerId);
                    if (consumer) {
                        await consumer.resume();
                        ws.send(JSON.stringify({ type: 'consumerResumed', payload: { consumerId } }));
                    }
                    break;
                }

                case 'toggleMedia': {
                    const { kind, isMuted } = payload;
                    console.log(`[MEDIA_TOGGLE] User:${userId} toggled ${kind} to ${isMuted ? 'muted' : 'unmuted'}`);
                    broadcastToRoom(roomId, {
                        type: 'peerToggledMedia',
                        payload: { userId, kind, isMuted }
                    }, ws);
                    break;
                }
            }
        } catch (error) {
            console.error('WS Error:', error);
            ws.send(JSON.stringify({ type: 'error', payload: 'Internal server error' }));
        }
    });

    ws.on('close', () => {
        console.log(`[WS] Connection closed. User:${userId}, Room:${roomId}`);
        const peerSet = roomPeers[roomId];
        if (roomId && peerSet) {
            peerSet.delete(ws);

            // Notify remaining peers that this user left
            if (userId) {
                broadcastToRoom(roomId, {
                    type: 'peerLeft',
                    payload: { userId }
                }, ws);
            }

            if (peerSet.size === 0) {
                delete roomPeers[roomId];
            }
        }

        // Cleanup producers owned by this peer
        for (const [id, producer] of producers.entries()) {
            if (producer.appData?.userId === userId && producer.appData?.roomId === roomId) {
                producer.close();
                producers.delete(id);
            }
        }

        // Cleanup consumers owned by this peer
        for (const [id, consumer] of consumers.entries()) {
            if ((consumer as any).appData?.userId === userId) {
                consumer.close();
                consumers.delete(id);
            }
        }
    });
});

function broadcastToRoom(roomId: string, message: any, excludeWs: WebSocket) {
    if(!roomPeers[roomId]) return;
    for (const ws of roomPeers[roomId]) {
        if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
}

async function start() {
    await pubClient.connect();
    await subClient.connect();

    await createMediasoupWorkers();

    // Subscribe to Laravel Redis pub/sub
    subClient.subscribe('signalcore:events', async (message) => {
        const data = JSON.parse(message);
        console.log("Redis EVENT:", data);
        if (data.type === 'USER_JOINING' && data.node_id === NODE_ID) {
            await createRoomRouter(data.room_id);
        }
    });
    
    // Periodically update Node metrics to Redis
    setInterval(async () => {
        try {
            await pubClient.set(`signalcore:node:${NODE_ID}:metrics`, JSON.stringify({
                node_id: NODE_ID,
                cpu_usage: Math.round(Math.random() * 20), // Placeholder CPU
                active_transports: Object.keys(transports).length, // Need correct count
                timestamp: Date.now()
            }));
        } catch(e) {}
    }, 5000);

    server.listen(3000, () => {
        console.log(`SFU Server listening on port 3000`);
    });
}

start();
