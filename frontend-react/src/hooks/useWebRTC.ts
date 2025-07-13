import { useEffect, useRef, useState, useCallback } from 'react';
import { SignalingService } from '../services/signaling';

export interface WebRTCConnection {
  userId: string;
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  connectionState: RTCPeerConnectionState;
}

export const useWebRTC = (signalingService: SignalingService | null, _userId: string) => {
  const [connections, setConnections] = useState<Map<string, WebRTCConnection>>(new Map());
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());

  const configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  };

  const handleOffer = useCallback(async (fromUserId: string, offer: RTCSessionDescriptionInit) => {
    if (connectionsRef.current.has(fromUserId)) {
      return; // Connection already exists
    }

    console.log(`Handling WebRTC offer from ${fromUserId}`);

    const peerConnection = new RTCPeerConnection(configuration);
    connectionsRef.current.set(fromUserId, peerConnection);

    // Set up event handlers
    peerConnection.onconnectionstatechange = () => {
      updateConnectionState(fromUserId, peerConnection.connectionState);
    };

    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      dataChannelsRef.current.set(fromUserId, dataChannel);
      setupDataChannelHandlers(dataChannel, fromUserId);
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && signalingService) {
        signalingService.send('webrtc-ice-candidate', {
          toUserId: fromUserId,
          candidate: event.candidate
        });
      }
    };

    try {
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (signalingService) {
        signalingService.send('webrtc-answer', {
          toUserId: fromUserId,
          answer: answer
        });
      }
    } catch (error) {
      console.error(`Failed to handle offer from ${fromUserId}:`, error);
    }
  }, [signalingService]);

  const handleAnswer = useCallback(async (fromUserId: string, answer: RTCSessionDescriptionInit) => {
    const peerConnection = connectionsRef.current.get(fromUserId);
    if (!peerConnection) {
      console.error(`No peer connection found for ${fromUserId}`);
      return;
    }

    try {
      await peerConnection.setRemoteDescription(answer);
      console.log(`WebRTC answer handled for ${fromUserId}`);
    } catch (error) {
      console.error(`Failed to handle answer from ${fromUserId}:`, error);
    }
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const peerConnection = connectionsRef.current.get(fromUserId);
    if (!peerConnection) {
      console.error(`No peer connection found for ${fromUserId}`);
      return;
    }

    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error(`Failed to add ICE candidate from ${fromUserId}:`, error);
    }
  }, []);

  const initiateConnection = useCallback(async (targetUserId: string) => {
    if (connectionsRef.current.has(targetUserId)) {
      return; // Connection already exists
    }

    console.log(`Initiating WebRTC connection to ${targetUserId}`);

    const peerConnection = new RTCPeerConnection(configuration);
    connectionsRef.current.set(targetUserId, peerConnection);

    // Create data channel
    const dataChannel = peerConnection.createDataChannel('whiteboard', {
      ordered: true
    });
    dataChannelsRef.current.set(targetUserId, dataChannel);
    setupDataChannelHandlers(dataChannel, targetUserId);

    // Set up event handlers
    peerConnection.onconnectionstatechange = () => {
      updateConnectionState(targetUserId, peerConnection.connectionState);
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && signalingService) {
        signalingService.send('webrtc-ice-candidate', {
          toUserId: targetUserId,
          candidate: event.candidate
        });
      }
    };

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (signalingService) {
        signalingService.send('webrtc-offer', {
          toUserId: targetUserId,
          offer: offer
        });
      }
    } catch (error) {
      console.error(`Failed to initiate connection to ${targetUserId}:`, error);
    }
  }, [signalingService]);

  const closeConnection = useCallback((targetUserId: string) => {
    const peerConnection = connectionsRef.current.get(targetUserId);
    if (peerConnection) {
      peerConnection.close();
      connectionsRef.current.delete(targetUserId);
    }

    const dataChannel = dataChannelsRef.current.get(targetUserId);
    if (dataChannel) {
      dataChannel.close();
      dataChannelsRef.current.delete(targetUserId);
    }

    setConnections(prev => {
      const newMap = new Map(prev);
      newMap.delete(targetUserId);
      return newMap;
    });
  }, []);

  const setupDataChannelHandlers = (dataChannel: RTCDataChannel, userId: string) => {
    dataChannel.onopen = () => {
      console.log(`Data channel opened for ${userId}`);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed for ${userId}`);
    };

    dataChannel.onmessage = (event) => {
      // Handle incoming data from peers
      // This will be used for whiteboard data synchronization
      console.log(`Data received from ${userId}:`, event.data);
    };
  };

  const updateConnectionState = (userId: string, state: RTCPeerConnectionState) => {
    setConnections(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(userId);
      if (existing) {
        newMap.set(userId, { ...existing, connectionState: state });
      }
      return newMap;
    });
  };

  const sendDataToPeer = useCallback((targetUserId: string, data: any) => {
    const dataChannel = dataChannelsRef.current.get(targetUserId);
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(data));
    } else {
      console.warn(`Data channel not ready for ${targetUserId}`);
    }
  }, []);

  const broadcastData = useCallback((data: any) => {
    dataChannelsRef.current.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
      }
    });
  }, []);

  // Set up signaling handlers
  useEffect(() => {
    if (!signalingService) return;

    signalingService.onMessage('webrtc-offer', (data) => {
      handleOffer(data.fromUserId, data.offer);
    });

    signalingService.onMessage('webrtc-answer', (data) => {
      handleAnswer(data.fromUserId, data.answer);
    });

    signalingService.onMessage('webrtc-ice-candidate', (data) => {
      handleIceCandidate(data.fromUserId, data.candidate);
    });

    signalingService.onMessage('user-joined', (data) => {
      initiateConnection(data.userId);
    });

    signalingService.onMessage('user-left', (data) => {
      closeConnection(data.userId);
    });
  }, [signalingService, handleOffer, handleAnswer, handleIceCandidate, initiateConnection, closeConnection]);

  // Update connections state
  useEffect(() => {
    const updateConnections = () => {
      const newConnections = new Map<string, WebRTCConnection>();
      
      connectionsRef.current.forEach((peerConnection, userId) => {
        const dataChannel = dataChannelsRef.current.get(userId);
        newConnections.set(userId, {
          userId,
          peerConnection,
          dataChannel: dataChannel || null,
          connectionState: peerConnection.connectionState
        });
      });
      
      setConnections(newConnections);
    };

    const interval = setInterval(updateConnections, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    connections,
    initiateConnection,
    closeConnection,
    sendDataToPeer,
    broadcastData
  };
};