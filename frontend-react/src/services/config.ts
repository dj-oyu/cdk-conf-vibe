// Configuration service for the whiteboard application
export interface AppConfig {
  websocketUrl: string;
  maxRoomSize: number;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export const getConfig = (): AppConfig => {
  // In production, this would be injected during build
  const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001';
  
  return {
    websocketUrl,
    maxRoomSize: 8,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
  };
};

export default getConfig;