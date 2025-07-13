import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useCollaboration } from '../../hooks/useCollaboration';
import { usePresence } from '../../hooks/usePresence';

export interface DrawingTool {
  type: 'pen' | 'eraser' | 'rectangle' | 'circle' | 'line';
  color: string;
  size: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type: 'stroke' | 'rectangle' | 'circle' | 'line';
  points: Point[];
  style: {
    color: string;
    size: number;
  };
  userId: string;
  timestamp: number;
}

interface CanvasProps {
  width?: number;
  height?: number;
  roomId: string;
  userId: string;
  currentTool: DrawingTool;
}

export const Canvas: React.FC<CanvasProps> = ({
  width = 1200,
  height = 800,
  roomId,
  userId,
  currentTool
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);

  const { 
    drawingElements, 
    addDrawingData,
    undo,
    redo,
    canUndo,
    canRedo
  } = useCollaboration(roomId, userId);

  const { 
    users, 
    updateCursor
  } = usePresence(userId);

  // Draw on canvas
  const drawOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw all elements
    drawingElements.forEach((element) => {
      if (element.type === 'stroke' && element.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = element.style.color;
        ctx.lineWidth = element.style.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        element.points.forEach((point: Point, index: number) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });

        ctx.stroke();
      } else if (element.type === 'rectangle' && element.points.length >= 2) {
        const start = element.points[0];
        const end = element.points[element.points.length - 1];
        
        ctx.beginPath();
        ctx.strokeStyle = element.style.color;
        ctx.lineWidth = element.style.size;
        ctx.rect(
          start.x, 
          start.y, 
          end.x - start.x, 
          end.y - start.y
        );
        ctx.stroke();
      } else if (element.type === 'circle' && element.points.length >= 2) {
        const start = element.points[0];
        const end = element.points[element.points.length - 1];
        const radius = Math.sqrt(
          Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
        );

        ctx.beginPath();
        ctx.strokeStyle = element.style.color;
        ctx.lineWidth = element.style.size;
        ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (element.type === 'line' && element.points.length >= 2) {
        const start = element.points[0];
        const end = element.points[element.points.length - 1];

        ctx.beginPath();
        ctx.strokeStyle = element.style.color;
        ctx.lineWidth = element.style.size;
        ctx.lineCap = 'round';
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    });

    // Draw current stroke while drawing
    if (isDrawing && currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = currentTool.color;
      ctx.lineWidth = currentTool.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      currentStroke.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      ctx.stroke();
    }

    // Draw other users' cursors
    users.forEach((user) => {
      if (user.cursor) {
        ctx.beginPath();
        ctx.fillStyle = user.color;
        ctx.arc(user.cursor.x, user.cursor.y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw user name
        ctx.font = '12px Arial';
        ctx.fillText(
          user.name || user.userId.slice(0, 8),
          user.cursor.x + 10,
          user.cursor.y - 10
        );
      }

      // Draw selection if exists
      if (user.selection) {
        ctx.beginPath();
        ctx.strokeStyle = user.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.rect(
          user.selection.startX,
          user.selection.startY,
          user.selection.endX - user.selection.startX,
          user.selection.endY - user.selection.startY
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }, [drawingElements, isDrawing, currentStroke, currentTool, users, width, height]);

  // Redraw when elements change
  useEffect(() => {
    drawOnCanvas();
  }, [drawOnCanvas]);

  const getMousePos = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(event);
    setIsDrawing(true);
    setCurrentStroke([pos]);
    updateCursor(pos.x, pos.y);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(event);
    updateCursor(pos.x, pos.y);

    if (isDrawing) {
      setCurrentStroke(prev => [...prev, pos]);
    }
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const pos = getMousePos(event);
    const finalStroke = [...currentStroke, pos];

    if (finalStroke.length > 1) {
      let elementType: string;
      let finalPoints: Point[];

      switch (currentTool.type) {
        case 'pen':
          elementType = 'stroke';
          finalPoints = finalStroke;
          break;
        case 'rectangle':
          elementType = 'rectangle';
          finalPoints = [finalStroke[0], pos];
          break;
        case 'circle':
          elementType = 'circle';
          finalPoints = [finalStroke[0], pos];
          break;
        case 'line':
          elementType = 'line';
          finalPoints = [finalStroke[0], pos];
          break;
        default:
          elementType = 'stroke';
          finalPoints = finalStroke;
      }

      const drawingElement: DrawingElement = {
        id: `${userId}-${Date.now()}-${Math.random()}`,
        type: elementType as any,
        points: finalPoints,
        style: {
          color: currentTool.color,
          size: currentTool.size
        },
        userId,
        timestamp: Date.now()
      };

      addDrawingData(drawingElement);
    }

    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key === 'z' && event.shiftKey || event.key === 'y') {
        event.preventDefault();
        redo();
      }
    }
  }, [undo, redo]);

  // Add keyboard shortcuts
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="canvas-container relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-300 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDrawing(false)}
      />
      
      {/* Undo/Redo controls */}
      <div className="absolute top-2 right-2 flex gap-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Redo
        </button>
      </div>

      {/* User count display */}
      <div className="absolute top-2 left-2 bg-white px-3 py-1 rounded shadow">
        Users: {users.size + 1}
      </div>
    </div>
  );
};