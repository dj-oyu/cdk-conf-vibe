# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WebRTC-based collaborative whiteboard application with a mesh P2P architecture designed to minimize backend costs. The system uses Y.js CRDT for conflict-free collaborative editing, WebRTC DataChannels for direct browser-to-browser communication, and minimal AWS Lambda signaling.

## Core Architecture

### Dual Frontend Structure
- `frontend/`: Legacy JavaScript modules (webrtc.js, collaboration.js, presence.js, etc.) - core P2P logic
- `frontend-react/`: Modern React UI layer that integrates the legacy modules via custom hooks

### Backend Infrastructure (AWS CDK)
- `cdk/`: Infrastructure as code using AWS CDK
- WebSocket API Gateway + Lambda for WebRTC signaling only
- DynamoDB for room management with TTL auto-cleanup
- S3 + CloudFront for static hosting

### Key Integration Points
- React hooks (`useWebRTC`, `useCollaboration`, `usePresence`) wrap legacy JS classes
- SignalingService handles WebSocket connections to Lambda backend
- Y.js document synchronization happens via both WebRTC DataChannels and WebSocket fallback

## Common Commands

### Frontend Development (React)
```bash
cd frontend-react
pnpm install
pnpm run dev          # Start development server
pnpm run build        # Production build
pnpm run lint         # ESLint check
```

### Legacy Frontend Testing
```bash
cd frontend
pnpm install
pnpm test             # Run all Jest tests
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests
pnpm test:coverage    # With coverage report
```

### Infrastructure (CDK)
```bash
cd cdk
pnpm install
pnpm run build        # Compile TypeScript
pnpm run cdk:diff     # Show infrastructure changes
pnpm run cdk:deploy   # Deploy to AWS
pnpm test             # CDK unit tests
```

### Full Deployment
```bash
./scripts/deploy.sh   # Automated deployment script
```

## Package Management Rules

- **ONLY use `pnpm`** - never npm or yarn to avoid dependency conflicts
- Each directory (frontend/, frontend-react/, cdk/) has its own package.json
- Install dependencies in the specific directory you're working in

## Development Workflow

1. Work in feature branches following naming: `feature/<description>`, `fix/<description>`, `docs/<description>`
2. Run quality checks before commits: `pnpm run lint && pnpm run format`
3. Ensure tests pass: `pnpm test`
4. Create pull requests to main branch (main is protected)

## Architecture Notes

### WebRTC Mesh Limitations
- Designed for ≤20 participants (mesh networking doesn't scale beyond this)
- Uses public STUN servers (Google/Cloudflare) for NAT traversal
- Optional TURN server (coturn) for restrictive networks

### State Management Flow
1. User actions → React components
2. React hooks → Legacy JS classes
3. JS classes → Y.js CRDT document
4. Y.js → WebRTC DataChannels (primary) + WebSocket (fallback)
5. Remote peers receive → Y.js → React state updates

### Canvas Rendering
- HTML5 Canvas with real-time collaborative drawing
- Drawing tools: pen, eraser, rectangle, circle, line
- User presence: real-time cursors and selection highlighting
- Undo/redo via Y.js UndoManager

### Room Management
- URL-based room sharing
- 8-person soft limit with warnings
- 24-hour TTL for automatic cleanup
- Recent rooms stored in localStorage

## Testing Strategy

- **Unit tests**: Individual modules (frontend/ directory)
- **Integration tests**: Cross-module interactions  
- **React component tests**: UI components and hooks
- **CDK tests**: Infrastructure validation

## Configuration Management

- `frontend-react/src/services/config.ts`: Environment-specific settings
- WebSocket URLs auto-configured during deployment
- No hardcoded endpoints - uses CDK outputs

## Security Features

- S3 bucket with complete public access blocking
- CloudFront Origin Access Control
- DynamoDB TTL for automatic data cleanup
- Room participant limits enforced