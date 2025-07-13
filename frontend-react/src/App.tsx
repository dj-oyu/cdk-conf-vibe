import { useState, useEffect, useCallback } from 'react';
import { Canvas, type DrawingTool } from './components/Whiteboard/Canvas';
import { DrawingTools } from './components/Toolbar/DrawingTools';
import { RoomManager } from './components/Room/RoomManager';
import { SignalingService } from './services/signaling';
import { useWebRTC } from './hooks/useWebRTC';
import { getConfig } from './services/config';
import './App.css';

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [signalingService, setSignalingService] = useState<SignalingService | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [currentTool, setCurrentTool] = useState<DrawingTool>({
    type: 'pen',
    color: '#000000',
    size: 4
  });

  const { connections } = useWebRTC(signalingService, currentUser || '');

  const generateUserId = () => {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleJoinRoom = useCallback(async (roomId: string, userDisplayName: string) => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const config = getConfig();
      const userId = generateUserId();
      
      setCurrentUser(userId);
      setUserName(userDisplayName);
      setCurrentRoom(roomId);

      // Create signaling service
      const signaling = new SignalingService(config.websocketUrl, userId, roomId);
      setSignalingService(signaling);

      // Set up connection handlers
      signaling.onMessage('room-joined', (data) => {
        console.log('Successfully joined room:', data);
        setIsConnecting(false);
      });

      signaling.onMessage('room-error', (data) => {
        console.error('Room error:', data);
        setConnectionError(data.message || 'Failed to join room');
        setIsConnecting(false);
      });

    } catch (error) {
      console.error('Failed to join room:', error);
      setConnectionError('Failed to connect to room');
      setIsConnecting(false);
    }
  }, []);

  const handleCreateRoom = useCallback(async (_roomName: string, userDisplayName: string, _isPrivate: boolean) => {
    // For now, treat create room the same as join room with a generated ID
    const roomId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`.toUpperCase();
    await handleJoinRoom(roomId, userDisplayName);
  }, [handleJoinRoom]);

  const handleLeaveRoom = useCallback(() => {
    if (signalingService) {
      signalingService.disconnect();
      setSignalingService(null);
    }
    
    setCurrentRoom(null);
    setCurrentUser(null);
    setUserName(null);
    setConnectionError(null);
    setIsConnecting(false);
  }, [signalingService]);

  const handleToolChange = useCallback((tool: DrawingTool) => {
    setCurrentTool(tool);
  }, []);

  // Handle keyboard shortcuts for tools
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'p':
          setCurrentTool(prev => ({ ...prev, type: 'pen' }));
          break;
        case 'e':
          setCurrentTool(prev => ({ ...prev, type: 'eraser' }));
          break;
        case 'r':
          setCurrentTool(prev => ({ ...prev, type: 'rectangle' }));
          break;
        case 'c':
          setCurrentTool(prev => ({ ...prev, type: 'circle' }));
          break;
        case 'l':
          setCurrentTool(prev => ({ ...prev, type: 'line' }));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Show room manager if not in a room
  if (!currentRoom || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <RoomManager
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
          isConnecting={isConnecting}
          error={connectionError || undefined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">
                Collaborative Whiteboard
              </h1>
              <div className="text-sm text-gray-500">
                Room: <span className="font-medium">{currentRoom}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Welcome, <span className="font-medium">{userName}</span>
              </div>
              <div className="text-sm text-gray-500">
                Connected users: {connections.size + 1}
              </div>
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Toolbar */}
          <div className="flex-shrink-0">
            <DrawingTools
              currentTool={currentTool}
              onToolChange={handleToolChange}
            />
          </div>

          {/* Canvas Container */}
          <div className="flex-1">
            <div className="whiteboard-container bg-white rounded-lg shadow-sm overflow-hidden">
              <Canvas
                roomId={currentRoom}
                userId={currentUser}
                currentTool={currentTool}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      {isConnecting && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          Connecting to room...
        </div>
      )}

      {connectionError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {connectionError}
          <button
            onClick={() => setConnectionError(null)}
            className="ml-2 text-white hover:text-gray-200"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
