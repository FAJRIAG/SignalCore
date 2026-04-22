import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eraser, Pencil, Trash2, X } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface DrawData {
  prevPoint: Point | null;
  currentPoint: Point;
  color: string;
  lineWidth: number;
}

interface WhiteboardProps {
  onDraw: (data: DrawData) => void;
  onClear: () => void;
  onClose: () => void;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ onDraw, onClear, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(3);
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');
  const prevPointRef = useRef<Point | null>(null);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      contextRef.current = ctx;
    }

    // Set background
    if (ctx) {
      ctx.fillStyle = '#111827'; // gray-900
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // Listen for custom whiteboard signals
    const handleSignal = (e: any) => {
      const { type, payload } = e.detail;
      if (!contextRef.current) return;

      if (type === 'whiteboardDraw') {
        const { prevPoint, currentPoint, color, lineWidth } = payload;
        drawOnCanvas(prevPoint, currentPoint, color, lineWidth);
      } else if (type === 'whiteboardClear') {
        clearLocalCanvas();
      }
    };

    window.addEventListener('whiteboard-signal', handleSignal);
    return () => window.removeEventListener('whiteboard-signal', handleSignal);
  }, []);

  const drawOnCanvas = useCallback((prevPoint: Point | null, currentPoint: Point, drawColor: string, width: number) => {
    const ctx = contextRef.current;
    if (!ctx) return;

    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = width;
    
    if (prevPoint) {
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
    } else {
      ctx.arc(currentPoint.x, currentPoint.y, width / 2, 0, Math.PI * 2);
      ctx.fillStyle = drawColor;
      ctx.fill();
    }
    ctx.stroke();
    ctx.closePath();
  }, []);

  const clearLocalCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const point = getCoordinates(e);
    if (!point) return;

    setIsDrawing(true);
    prevPointRef.current = point;
    
    const drawColor = mode === 'erase' ? '#111827' : color;
    drawOnCanvas(null, point, drawColor, lineWidth);
    onDraw({ prevPoint: null, currentPoint: point, color: drawColor, lineWidth });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const currentPoint = getCoordinates(e);
    if (!currentPoint || !prevPointRef.current) return;

    const drawColor = mode === 'erase' ? '#111827' : color;
    drawOnCanvas(prevPointRef.current, currentPoint, drawColor, lineWidth);
    onDraw({ prevPoint: prevPointRef.current, currentPoint, color: drawColor, lineWidth });
    
    prevPointRef.current = currentPoint;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    prevPointRef.current = null;
  };

  const colors = ['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#a855f7'];

  return (
    <div className="absolute inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Toolbar */}
      <div className="h-14 px-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-lg border border-gray-700">
            <button
              onClick={() => setMode('draw')}
              className={`p-2 rounded-md transition ${mode === 'draw' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Pencil"
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => setMode('erase')}
              className={`p-2 rounded-md transition ${mode === 'erase' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Eraser"
            >
              <Eraser size={18} />
            </button>
          </div>

          <div className="h-6 w-px bg-gray-700" />

          {/* Color Palette */}
          <div className="flex items-center gap-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  setMode('draw');
                }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c && mode === 'draw' ? 'border-white scale-125' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="h-6 w-px bg-gray-700" />

          {/* Brush Size */}
          <input
            type="range"
            min="1"
            max="20"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-24 accent-blue-600 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
                clearLocalCanvas();
                onClear();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-600/10 text-red-500 hover:bg-red-600/20 transition text-sm font-medium border border-red-600/20"
          >
            <Trash2 size={16} />
            Clear
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full touch-none"
        />
      </div>
    </div>
  );
};
