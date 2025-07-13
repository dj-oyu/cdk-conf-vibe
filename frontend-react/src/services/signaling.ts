// WebSocket signaling service
export type MessageType = 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice-candidate' | 
                         'user-joined' | 'user-left' | 'room-joined' | 'room-error';

export interface SignalingMessage {
  type: MessageType;
  fromUserId?: string;
  toUserId?: string;
  data: any;
}

export class SignalingService {
  private ws: WebSocket | null = null;
  private messageHandlers = new Map<MessageType, ((data: any) => void)[]>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private userId: string;
  private roomId: string;

  constructor(websocketUrl: string, userId: string, roomId: string) {
    this.userId = userId;
    this.roomId = roomId;
    this.connect(websocketUrl);
  }

  private connect(url: string) {
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.joinRoom();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SignalingMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse signaling message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect(url);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.attemptReconnect(url);
    }
  }

  private attemptReconnect(url: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.connect(url);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private joinRoom() {
    this.send('join-room', {
      roomId: this.roomId,
      userId: this.userId
    });
  }

  private handleMessage(message: SignalingMessage) {
    const handlers = this.messageHandlers.get(message.type) || [];
    handlers.forEach(handler => handler(message.data));
  }

  public onMessage(type: MessageType, handler: (data: any) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  public send(type: string, data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type,
        fromUserId: this.userId,
        data
      }));
    } else {
      console.warn('WebSocket not connected, message not sent:', { type, data });
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}