import React from 'react';
import type { DrawingTool } from '../Whiteboard/Canvas';

interface DrawingToolsProps {
  currentTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
}

const COLORS = [
  '#000000', // Black
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
];

const SIZES = [2, 4, 8, 16, 24];

export const DrawingTools: React.FC<DrawingToolsProps> = ({
  currentTool,
  onToolChange
}) => {
  const handleToolTypeChange = (type: DrawingTool['type']) => {
    onToolChange({
      ...currentTool,
      type
    });
  };

  const handleColorChange = (color: string) => {
    onToolChange({
      ...currentTool,
      color
    });
  };

  const handleSizeChange = (size: number) => {
    onToolChange({
      ...currentTool,
      size
    });
  };

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-lg" data-testid="drawing-tools">
      <div className="space-y-4">
        {/* Tool Types */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Tools</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleToolTypeChange('pen')}
              className={`p-2 rounded text-sm font-medium transition-colors ${
                currentTool.type === 'pen'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Pen"
            >
              ✏️ Pen
            </button>
            <button
              onClick={() => handleToolTypeChange('eraser')}
              className={`p-2 rounded text-sm font-medium transition-colors ${
                currentTool.type === 'eraser'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Eraser"
            >
              🧹 Eraser
            </button>
            <button
              onClick={() => handleToolTypeChange('rectangle')}
              className={`p-2 rounded text-sm font-medium transition-colors ${
                currentTool.type === 'rectangle'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Rectangle"
            >
              ▭ Rectangle
            </button>
            <button
              onClick={() => handleToolTypeChange('circle')}
              className={`p-2 rounded text-sm font-medium transition-colors ${
                currentTool.type === 'circle'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Circle"
            >
              ⭕ Circle
            </button>
            <button
              onClick={() => handleToolTypeChange('line')}
              className={`p-2 rounded text-sm font-medium transition-colors col-span-2 ${
                currentTool.type === 'line'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Line"
            >
              📏 Line
            </button>
          </div>
        </div>

        {/* Colors */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Colors</h3>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className={`w-8 h-8 rounded border-2 transition-transform hover:scale-110 ${
                  currentTool.color === color
                    ? 'border-gray-800 scale-110'
                    : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          
          {/* Custom color picker */}
          <div className="mt-2">
            <input
              type="color"
              value={currentTool.color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-full h-8 rounded border border-gray-300 cursor-pointer"
              title="Custom color"
            />
          </div>
        </div>

        {/* Brush Size */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Size: {currentTool.size}px
          </h3>
          <div className="space-y-2">
            {/* Predefined sizes */}
            <div className="grid grid-cols-5 gap-1">
              {SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => handleSizeChange(size)}
                  className={`h-8 rounded border transition-colors ${
                    currentTool.size === size
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div
                    className="mx-auto rounded-full bg-gray-800"
                    style={{
                      width: Math.min(size, 16),
                      height: Math.min(size, 16)
                    }}
                  />
                </button>
              ))}
            </div>
            
            {/* Size slider */}
            <input
              type="range"
              min="1"
              max="50"
              value={currentTool.size}
              onChange={(e) => handleSizeChange(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        {/* Current tool preview */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
          <div className="h-12 border border-gray-300 rounded bg-gray-50 flex items-center justify-center">
            <div
              className="rounded-full"
              style={{
                backgroundColor: currentTool.color,
                width: Math.min(currentTool.size, 24),
                height: Math.min(currentTool.size, 24)
              }}
            />
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="text-xs text-gray-500 space-y-1">
          <div className="font-medium">Shortcuts:</div>
          <div>Ctrl+Z: Undo</div>
          <div>Ctrl+Y: Redo</div>
          <div>P: Pen tool</div>
          <div>E: Eraser</div>
          <div>R: Rectangle</div>
          <div>C: Circle</div>
          <div>L: Line</div>
        </div>
      </div>
    </div>
  );
};