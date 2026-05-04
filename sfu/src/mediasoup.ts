import * as mediasoup from 'mediasoup';
import os from 'os';
import { RedisClientType } from 'redis';
import { EventEmitter } from 'events';

export const sfuEvents = new EventEmitter();

function getLocalIp() {
    if (process.env.ANNOUNCED_IP) {
        return process.env.ANNOUNCED_IP;
    }
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces) continue;
        for (const iface of ifaces) {
            if ((iface.family === 'IPv4' || (iface.family as any) === 4) && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

export let workers: mediasoup.types.Worker[] = [];
export let nextMediasoupWorkerIdx = 0;
// Room Routers: roomId -> Router
export const routers: Map<string, mediasoup.types.Router> = new Map();
// Transports: transportId -> Transport
export const transports: Map<string, mediasoup.types.WebRtcTransport> = new Map();
// Producers: producerId -> Producer
export const producers: Map<string, mediasoup.types.Producer> = new Map();
// Consumers: consumerId -> Consumer
export const consumers: Map<string, mediasoup.types.Consumer> = new Map();
// AudioLevelObservers: roomId -> AudioLevelObserver
export const observers: Map<string, mediasoup.types.AudioLevelObserver> = new Map();

export async function createMediasoupWorkers() {
    const numWorkers = Object.keys(os.cpus()).length;
    console.log(`Starting ${numWorkers} Mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
        const worker = await mediasoup.createWorker({
            logLevel: 'warn',
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
        });

        worker.on('died', () => {
            console.error(`Mediasoup worker died, exiting in 2 seconds... [pid:${worker.pid}]`);
            setTimeout(() => process.exit(1), 2000);
        });

        workers.push(worker);
    }
}

function getNextWorker() {
    const worker = workers[nextMediasoupWorkerIdx];
    if (++nextMediasoupWorkerIdx === workers.length) {
        nextMediasoupWorkerIdx = 0;
    }
    return worker;
}

// Pending Router creations: roomId -> Promise<Router>
const routerPromises: Map<string, Promise<mediasoup.types.Router>> = new Map();

export async function createRoomRouter(roomId: string) {
    if (routers.has(roomId)) return routers.get(roomId);
    
    // If a creation is already in progress, return the existing promise
    if (routerPromises.has(roomId)) return routerPromises.get(roomId);

    const createPromise = (async () => {
        try {
            const worker = getNextWorker();
            if (!worker) throw new Error('No Mediasoup worker available');
            const router = await worker.createRouter({
                mediaCodecs: [
                    {
                        kind: 'audio',
                        mimeType: 'audio/opus',
                        clockRate: 48000,
                        channels: 2
                    },
                    {
                        kind: 'video',
                        mimeType: 'video/VP8',
                        clockRate: 90000,
                        parameters: {
                            'x-google-start-bitrate': 1000
                        }
                    }
                ]
            });

            // Create AudioLevelObserver for Active Speaker Detection
            const audioLevelObserver = await router.createAudioLevelObserver({
                maxEntries: 1,
                threshold: -80,
                interval: 800
            });

            audioLevelObserver.on('volumes', (volumes) => {
                const activeSpeakers = volumes.map(v => {
                    const producer = producers.get(v.producer.id);
                    return producer ? producer.appData.socketId : null;
                }).filter(Boolean);
                
                sfuEvents.emit('activeSpeakers', { roomId, activeSpeakers });
            });

            audioLevelObserver.on('silence', () => {
                sfuEvents.emit('activeSpeakers', { roomId, activeSpeakers: [] });
            });

            routers.set(roomId, router);
            observers.set(roomId, audioLevelObserver);
            return router;
        } finally {
            // Cleanup promise once done
            routerPromises.delete(roomId);
        }
    })();

    routerPromises.set(roomId, createPromise);
    return createPromise;
}

export async function createWebRtcTransport(roomId: string) {
    const router = routers.get(roomId);
    if (!router) throw new Error("Router not found for room");

    const transport = await router.createWebRtcTransport({
        listenIps: [
            {
                ip: '0.0.0.0',
                announcedIp: getLocalIp() // dynamically resolved for LAN access
            }
        ],
        enableUdp: true,
        enableTcp: true,
        preferTcp: true, // Prefer TCP to bypass strict NAT/Firewalls
        initialAvailableOutgoingBitrate: 1000000,
    });

    // Store roomId in appData so we can find the router later
    transport.appData.roomId = roomId;

    transports.set(transport.id, transport);

    transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed' || dtlsState === 'failed') {
            transport.close();
            transports.delete(transport.id);
        }
    });

    transport.on('routerclose', () => {
        transport.close();
        transports.delete(transport.id);
    });

    const transportData = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
    };

    // Force a plain JSON-serializable object (mediasoup internals are proxy objects)
    return JSON.parse(JSON.stringify(transportData));
}

export async function connectTransport(transportId: string, dtlsParameters: any) {
    const transport = transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);
    await transport.connect({ dtlsParameters });
}

export async function produce(transportId: string, kind: any, rtpParameters: any, appData: any) {
    const transport = transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const producer = await transport.produce({ kind, rtpParameters, appData });
    producers.set(producer.id, producer);

    if (kind === 'audio' && appData.roomId) {
        const observer = observers.get(appData.roomId);
        if (observer) {
            observer.addProducer({ producerId: producer.id }).catch(console.error);
        }
    }

    producer.on('transportclose', () => {
        producer.close();
        producers.delete(producer.id);
    });

    return producer.id;
}


export async function resumeConsumer(consumerId: string) {
    const consumer = consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer ${consumerId} not found`);
    await consumer.resume();
}

export function getCpuUsage(): number {
    const cpus = os.cpus().length;
    // os.loadavg()[0] is 1 minute load avg
    const load = os.loadavg()[0] || 0;
    const usage = Math.min(100, Math.round((load / cpus) * 100));
    return usage;
}
