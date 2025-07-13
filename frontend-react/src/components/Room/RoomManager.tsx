import React, { useState, useEffect } from 'react';

export interface RoomInfo {
  id: string;
  name: string;
  participantCount: number;
  maxParticipants: number;
  createdAt: number;
  isPrivate: boolean;
}

interface RoomManagerProps {
  onJoinRoom: (roomId: string, userName: string) => void;
  onCreateRoom: (roomName: string, userName: string, isPrivate: boolean) => void;
  isConnecting?: boolean;
  error?: string;
}

export const RoomManager: React.FC<RoomManagerProps> = ({
  onJoinRoom,
  onCreateRoom,
  isConnecting = false,
  error
}) => {
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [recentRooms, setRecentRooms] = useState<RoomInfo[]>([]);

  // Load recent rooms from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('whiteboard-recent-rooms');
    if (saved) {
      try {
        const rooms = JSON.parse(saved);
        setRecentRooms(rooms.slice(0, 5)); // Keep only 5 most recent
      } catch (error) {
        console.error('Failed to load recent rooms:', error);
      }
    }

    // Load saved user name
    const savedUserName = localStorage.getItem('whiteboard-user-name');
    if (savedUserName) {
      setUserName(savedUserName);
    }
  }, []);

  // Save user name to localStorage
  useEffect(() => {
    if (userName) {
      localStorage.setItem('whiteboard-user-name', userName);
    }
  }, [userName]);

  const handleJoinRoom = () => {
    if (!roomId.trim() || !userName.trim()) {
      return;
    }

    // Add to recent rooms
    const roomInfo: RoomInfo = {
      id: roomId,
      name: roomId,
      participantCount: 1,
      maxParticipants: 8,
      createdAt: Date.now(),
      isPrivate: false
    };
    
    const updatedRecent = [roomInfo, ...recentRooms.filter(r => r.id !== roomId)].slice(0, 5);
    setRecentRooms(updatedRecent);
    localStorage.setItem('whiteboard-recent-rooms', JSON.stringify(updatedRecent));

    onJoinRoom(roomId.trim(), userName.trim());
  };

  const handleCreateRoom = () => {
    if (!roomName.trim() || !userName.trim()) {
      return;
    }

    onCreateRoom(roomName.trim(), userName.trim(), isPrivate);
  };

  const handleJoinRecentRoom = (room: RoomInfo) => {
    if (!userName.trim()) {
      return;
    }
    onJoinRoom(room.id, userName.trim());
  };

  const generateRoomId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomId(result);
  };

  const generateRoomName = () => {
    const adjectives = ['Creative', 'Collaborative', 'Innovative', 'Dynamic', 'Productive'];
    const nouns = ['Workspace', 'Studio', 'Lab', 'Board', 'Canvas'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    setRoomName(`${adj} ${noun}`);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center">
          Collaborative Whiteboard
        </h1>
        <p className="text-gray-600 text-center mt-2">
          Join or create a room to start collaborating
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700">
          {error}
        </div>
      )}

      {/* User Name Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Your Name
        </label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isConnecting}
        />
      </div>

      {/* Mode Toggle */}
      <div className="mb-6">
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Join Room
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Create Room
          </button>
        </div>
      </div>

      {/* Join Room Mode */}
      {mode === 'join' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter room ID"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnecting}
              />
              <button
                onClick={generateRoomId}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                disabled={isConnecting}
                title="Generate random room ID"
              >
                🎲
              </button>
            </div>
          </div>

          <button
            onClick={handleJoinRoom}
            disabled={!roomId.trim() || !userName.trim() || isConnecting}
            className="w-full py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      )}

      {/* Create Room Mode */}
      {mode === 'create' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnecting}
              />
              <button
                onClick={generateRoomName}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                disabled={isConnecting}
                title="Generate random room name"
              >
                🎲
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="private"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mr-2"
              disabled={isConnecting}
            />
            <label htmlFor="private" className="text-sm text-gray-700">
              Private room (invite only)
            </label>
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={!roomName.trim() || !userName.trim() || isConnecting}
            className="w-full py-2 px-4 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? 'Creating...' : 'Create Room'}
          </button>
        </div>
      )}

      {/* Recent Rooms */}
      {recentRooms.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Rooms</h3>
          <div className="space-y-2">
            {recentRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleJoinRecentRoom(room)}
                disabled={!userName.trim() || isConnecting}
                className="w-full p-3 text-left border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-900">{room.name}</div>
                    <div className="text-sm text-gray-500">ID: {room.id}</div>
                  </div>
                  <div className="text-sm text-gray-400">
                    {new Date(room.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Room Limits Info */}
      <div className="mt-6 p-3 bg-blue-50 rounded-md">
        <div className="text-sm text-blue-800">
          <div className="font-medium">Room Limits:</div>
          <div>• Maximum 8 participants per room</div>
          <div>• Rooms auto-expire after 24 hours of inactivity</div>
          <div>• All drawing data is synchronized in real-time</div>
        </div>
      </div>
    </div>
  );
};