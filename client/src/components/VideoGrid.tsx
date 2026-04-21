import { useEffect, useRef } from 'react';
import { useRoomStore } from '../store/useRoomStore';
import { MicOff } from 'lucide-react';

// Hidden audio element that plays a remote audio track
const AudioElement = ({ track }: { track: MediaStreamTrack | null }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    if (track) {
      const stream = new MediaStream([track]);
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.srcObject = null;
    }
  }, [track]);

  // Not muted, not visible — just plays the remote audio
  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
};

interface VideoElementProps {
  track: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  muted?: boolean;
  label?: string;
  micMuted?: boolean;
}

const VideoElement = ({ track, audioTrack, muted = false, label, micMuted = false }: VideoElementProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (track) {
      const stream = new MediaStream([track]);
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [track]);

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center relative shadow-lg aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover"
      />

      {/* Remote audio — rendered separately to avoid mute conflict with video element */}
      {audioTrack && <AudioElement track={audioTrack} />}

      {/* No video avatar */}
      {!track && (
        <div className="text-gray-400 absolute flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-xl font-bold mb-2">
            {label ? label[0].toUpperCase() : 'U'}
          </div>
          <span className="text-sm">No Video</span>
        </div>
      )}

      {/* Name + mic indicator */}
      {label && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <div className="bg-black/60 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
            {micMuted && <MicOff size={11} className="text-red-400" />}
            {label}
          </div>
        </div>
      )}

      {/* Mic muted badge top-right */}
      {micMuted && (
        <div className="absolute top-2 right-2 bg-red-600/90 rounded-full p-1.5">
          <MicOff size={14} className="text-white" />
        </div>
      )}
    </div>
  );
};

interface VideoGridProps {
  localVideoTrack?: MediaStreamTrack | null;
  localScreenTrack?: MediaStreamTrack | null;
  localUserId?: string;
  localMicOn?: boolean;
}

export const VideoGrid = ({ localVideoTrack, localScreenTrack, localUserId, localMicOn = true }: VideoGridProps) => {
  const { peers } = useRoomStore();

  const remotePeers = Object.entries(peers).filter(([id]) => id !== localUserId);

  const localHasVideo  = !!localVideoTrack;
  const localHasScreen = !!localScreenTrack;
  const remoteOnCam    = remotePeers.filter(([, p]) => p.video && !p.videoMuted);
  const remoteOffCam   = remotePeers.filter(([, p]) => !p.video || p.videoMuted);
  
  // Find who is sharing screen (prioritize remote screens)
  const remoteSharer = remotePeers.find(([, p]) => p.screen);
  const someoneSharingScreen = localHasScreen || !!remoteSharer;

  // Function to calculate responsive tile sizes
  const getResponsiveClass = (count: number) => {
    if (count === 1) return 'w-full max-w-4xl';
    if (count === 2) return 'w-full md:w-[48%] max-w-2xl';
    if (count <= 4)  return 'w-[48%] sm:w-[48%]';
    return 'w-[48%] sm:w-[31%] lg:w-[23%]';
  };

  // ── FEATURED SCREEN SHARE LAYOUT ──────────────────────────────────────────
  if (someoneSharingScreen) {
    return (
      <div className="w-full h-full bg-gray-950 flex flex-col pt-2 sm:pt-4">
        {/* Main: The Screen Share */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
            <div className="w-full h-full max-w-7xl">
                {localHasScreen ? (
                    <VideoElement track={localScreenTrack} muted label="Your Screen" />
                ) : (
                    <VideoElement 
                        track={remoteSharer![1].screen} 
                        label={`User ${remoteSharer![0]}'s Screen`} 
                    />
                )}
            </div>
        </div>

        {/* Bottom: All participants' cameras */}
        <div className="h-32 sm:h-48 flex flex-nowrap items-center justify-start sm:justify-center gap-2 sm:gap-3 p-2 sm:p-4 flex-shrink-0 overflow-x-auto w-full custom-scrollbar bg-gray-900/50">
          {/* Local Camera */}
          <div className="w-40 sm:w-64 flex-shrink-0">
             <VideoElement track={localVideoTrack} muted label="You" micMuted={!localMicOn} />
          </div>
          {/* Remote Cameras */}
          {remotePeers.map(([uid, peer]) => (
            <div key={uid} className="w-40 sm:w-64 flex-shrink-0">
              <VideoElement 
                track={peer.video ?? null} 
                audioTrack={peer.audio ?? null} 
                label={`User ${uid}`} 
                micMuted={peer.audioMuted} 
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── STANDARD GRID LAYOUT (Existing logic) ─────────────────────────────────
  const anyoneHasCam = localHasVideo || remoteOnCam.length > 0;

  if (!anyoneHasCam) {
    const total = 1 + remotePeers.length;
    const flatClass = getResponsiveClass(total);

    return (
      <div className="w-full h-full bg-gray-900 flex items-center justify-center overflow-y-auto">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 sm:p-4 w-full max-w-6xl">
          <div className={flatClass}>
            <VideoElement track={null} muted label="You" micMuted={!localMicOn} />
          </div>
          {remotePeers.map(([uid, peer]) => (
            <div key={uid} className={flatClass}>
              <VideoElement track={null} audioTrack={peer.audio ?? null} label={`User ${uid}`} micMuted={peer.audioMuted} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const mainCount = (localHasVideo ? 1 : 0) + remoteOnCam.length;
  const mainClass = getResponsiveClass(mainCount);
  const hasBottom = !localHasVideo || remoteOffCam.length > 0;

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col pt-2 sm:pt-4">
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 w-full max-w-6xl">
          {localHasVideo && (
            <div className={mainClass}>
              <VideoElement track={localVideoTrack} muted label="You" micMuted={!localMicOn} />
            </div>
          )}
          {remoteOnCam.map(([uid, peer]) => (
            <div key={uid} className={mainClass}>
              <VideoElement
                track={peer.video ?? null}
                audioTrack={peer.audio ?? null}
                label={`User ${uid}`}
                micMuted={peer.audioMuted}
              />
            </div>
          ))}
        </div>
      </div>

      {hasBottom && (
        <div className="flex flex-nowrap items-center justify-start sm:justify-center gap-2 sm:gap-3 p-2 sm:p-4 flex-shrink-0 overflow-x-auto w-full custom-scrollbar">
          {!localHasVideo && (
            <div className="w-24 sm:w-36 flex-shrink-0">
              <VideoElement track={null} muted label="You" micMuted={!localMicOn} />
            </div>
          )}
          {remoteOffCam.map(([uid, peer]) => (
            <div key={uid} className="w-24 sm:w-36 flex-shrink-0">
              <VideoElement track={null} audioTrack={peer.audio ?? null} label={`User ${uid}`} micMuted={peer.audioMuted} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
