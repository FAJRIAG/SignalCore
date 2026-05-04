import { spawn, ChildProcess } from 'child_process';
import { routers } from './mediasoup';
import fs from 'fs';
import path from 'path';

export const activeRecordings = new Map<string, ChildProcess>();

export async function startRecording(roomId: string) {
    if (activeRecordings.has(roomId)) {
        throw new Error("Recording already in progress for this room");
    }

    const router = routers.get(roomId);
    if (!router) throw new Error("Router not found");

    const recordDir = path.join(__dirname, '../../sfu/recordings');
    if (!fs.existsSync(recordDir)) {
        fs.mkdirSync(recordDir, { recursive: true });
    }

    const outputPath = path.join(recordDir, `room-${roomId}-${Date.now()}.webm`);

    // Scaffold for FFmpeg recording. 
    // To record real media, we would create a PlainTransport:
    // const transport = await router.createPlainTransport({ ... });
    // And consume producers: await transport.consume({ ... });
    // Then pipe RTP to ffmpeg's UDP ports.
    
    console.log(`[RECORDING] Starting FFmpeg recording for room ${roomId} at ${outputPath}`);
    
    // We spawn ffmpeg with a dummy input as scaffolding
    const ffmpegProcess = spawn('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'color=c=black:s=640x480:r=30', // Dummy video
        '-f', 'lavfi', '-i', 'anullsrc', // Dummy audio
        '-c:v', 'libvpx',
        '-c:a', 'libvorbis',
        '-t', '3600', // max 1 hour for dummy
        '-f', 'webm',
        outputPath
    ]);

    ffmpegProcess.on('error', (err) => {
        console.error(`[RECORDING] FFmpeg error for room ${roomId}:`, err);
    });

    ffmpegProcess.on('close', (code) => {
        console.log(`[RECORDING] FFmpeg process closed for room ${roomId} with code ${code}`);
        activeRecordings.delete(roomId);
    });

    activeRecordings.set(roomId, ffmpegProcess);
    return { success: true, outputPath };
}

export function stopRecording(roomId: string) {
    const process = activeRecordings.get(roomId);
    if (process) {
        console.log(`[RECORDING] Stopping recording for room ${roomId}`);
        process.kill('SIGINT');
        activeRecordings.delete(roomId);
        return { success: true };
    }
    return { success: false, message: 'No active recording found' };
}
