// Jest test setup file
import { jest } from '@jest/globals';

// Mock WebSocket for testing
global.WebSocket = jest.fn(() => ({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readyState: 1, // OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
}));

// Mock RTCPeerConnection for WebRTC testing
global.RTCPeerConnection = jest.fn(() => ({
    createOffer: jest.fn().mockResolvedValue({}),
    createAnswer: jest.fn().mockResolvedValue({}),
    setLocalDescription: jest.fn().mockResolvedValue(),
    setRemoteDescription: jest.fn().mockResolvedValue(),
    addIceCandidate: jest.fn().mockResolvedValue(),
    createDataChannel: jest.fn(() => ({
        send: jest.fn(),
        close: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        readyState: 'open'
    })),
    close: jest.fn(),
    getStats: jest.fn().mockResolvedValue(new Map()),
    restartIce: jest.fn().mockResolvedValue(),
    connectionState: 'connected',
    iceConnectionState: 'connected',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
}));

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true
});

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
});

// Mock document visibility API
Object.defineProperty(document, 'hidden', {
    writable: true,
    value: false
});

Object.defineProperty(document, 'visibilityState', {
    writable: true,
    value: 'visible'
});

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Mock Y.js modules
jest.unstable_mockModule('yjs', () => ({
    Doc: jest.fn(() => ({
        getArray: jest.fn(() => ({
            push: jest.fn(),
            delete: jest.fn(),
            observe: jest.fn(),
            toArray: jest.fn(() => []),
            length: 0
        })),
        getMap: jest.fn(() => ({
            set: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            observe: jest.fn(),
            forEach: jest.fn()
        })),
        getText: jest.fn(() => ({
            insert: jest.fn(),
            delete: jest.fn(),
            observe: jest.fn(),
            toString: jest.fn(() => '')
        })),
        transact: jest.fn((fn) => fn()),
        destroy: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
    }))
}));

jest.unstable_mockModule('y-webrtc', () => ({
    WebrtcProvider: jest.fn(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        destroy: jest.fn(),
        synced: true,
        awareness: {
            setLocalStateField: jest.fn(),
            getStates: jest.fn(() => new Map()),
            on: jest.fn(),
            off: jest.fn(),
            meta: new Map()
        },
        on: jest.fn(),
        off: jest.fn()
    }))
}));

jest.unstable_mockModule('y-indexeddb', () => ({
    IndexeddbPersistence: jest.fn(() => ({
        destroy: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
    }))
}));

// Global test utilities
global.createMockWebSocket = () => {
    const ws = {
        send: jest.fn(),
        close: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        readyState: 1,
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null
    };
    
    // Helper to simulate events
    ws.simulateOpen = () => {
        if (ws.onopen) ws.onopen({ type: 'open' });
    };
    
    ws.simulateMessage = (data) => {
        if (ws.onmessage) ws.onmessage({ data: JSON.stringify(data) });
    };
    
    ws.simulateClose = (code = 1000, reason = '') => {
        if (ws.onclose) ws.onclose({ code, reason });
    };
    
    ws.simulateError = (error) => {
        if (ws.onerror) ws.onerror(error);
    };
    
    return ws;
};

global.createMockRTCPeerConnection = () => {
    const pc = {
        createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: jest.fn().mockResolvedValue(),
        setRemoteDescription: jest.fn().mockResolvedValue(),
        addIceCandidate: jest.fn().mockResolvedValue(),
        createDataChannel: jest.fn(),
        close: jest.fn(),
        getStats: jest.fn().mockResolvedValue(new Map()),
        restartIce: jest.fn().mockResolvedValue(),
        connectionState: 'connected',
        iceConnectionState: 'connected',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        onicecandidate: null,
        onconnectionstatechange: null,
        ondatachannel: null
    };
    
    // Helper to simulate data channel creation
    pc.createDataChannel.mockImplementation((label, options) => ({
        label,
        send: jest.fn(),
        close: jest.fn(),
        readyState: 'open',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null
    }));
    
    return pc;
};

// Cleanup after each test
afterEach(() => {
    jest.clearAllMocks();
    if (localStorageMock.getItem.mockClear) {
        localStorageMock.getItem.mockClear();
        localStorageMock.setItem.mockClear();
        localStorageMock.removeItem.mockClear();
        localStorageMock.clear.mockClear();
    }
});