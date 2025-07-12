# Whiteboard Frontend Core

リアルタイム協調ホワイトボードアプリケーションのコアバックエンドシステム

## 概要

このパッケージには以下のコア機能が含まれています：

- **Y.js CRDT協調編集** - リアルタイム同期とコンフリクト解決
- **WebRTC P2P接続** - 低遅延のピアツーピア通信
- **ユーザープレゼンス追跡** - カーソル位置とユーザー状態管理
- **オフライン対応** - ネットワーク断線時の操作同期
- **エラーハンドリング** - 自動再接続と回復機能

## インストール

```bash
# 依存関係のインストール
pnpm install

# テストの実行
pnpm test

# カバレッジ付きテスト
pnpm test:coverage

# ウォッチモードでテスト
pnpm test:watch

# リンター実行
pnpm lint

# フォーマット
pnpm format
```

## 使用方法

### 基本的な使用例

```javascript
import { WhiteboardCore } from './core-integration.js';

const whiteboard = new WhiteboardCore({
    roomId: 'room-123',
    userId: 'user-456',
    websocketUrl: 'wss://your-api.amazonaws.com/prod',
    signalingUrls: ['wss://your-signaling-server.com']
});

// イベントハンドラーの設定
whiteboard.onConnected = () => {
    console.log('ホワイトボードに接続しました');
};

whiteboard.onUserJoined = (userId, presence) => {
    console.log(`ユーザー ${userId} が参加しました`);
};

whiteboard.onDrawingUpdate = (event) => {
    console.log('描画が更新されました:', event);
};

// 接続
await whiteboard.connect();

// 描画操作
whiteboard.addDrawingStroke({
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    color: '#000000',
    width: 2
});

// カーソル更新
whiteboard.updateCursor(100, 200);

// プレゼンス更新
whiteboard.updatePresence('active', { tool: 'pen' });
```

### 高度な使用例

```javascript
// エラーハンドリング
whiteboard.onReconnectionStarted = (reason) => {
    console.log('再接続開始:', reason);
};

whiteboard.onOfflineSyncCompleted = (operationCount) => {
    console.log(`${operationCount}個の操作を同期しました`);
};

// オフライン状態の監視
setInterval(() => {
    const status = whiteboard.getOfflineStatus();
    console.log('オフライン状態:', status);
}, 5000);

// システム統計の取得
const stats = whiteboard.getSystemStats();
console.log('システム統計:', stats);
```

## アーキテクチャ

### コンポーネント構成

```
WhiteboardCore (統合レイヤー)
├── CollaborationEngine (Y.js CRDT)
├── WebRTCManager (P2P通信)
├── PresenceManager (ユーザー状態)
├── OfflineSyncManager (オフライン対応)
├── ErrorHandler (エラー処理)
└── SignalingService (WebSocket)
```

### データフロー

1. **リアルタイム同期**: Y.js → WebRTC P2P → UI更新
2. **プレゼンス情報**: Awareness API → WebRTC → UI表示
3. **オフライン操作**: LocalStorage → 再接続時同期
4. **エラー処理**: 自動検知 → 再接続 → 復旧

## API リファレンス

### WhiteboardCore

#### 接続管理
- `connect()` - ホワイトボードに接続
- `disconnect()` - 接続を切断
- `getConnectionStatus()` - 接続状態を取得

#### 描画操作
- `addDrawingStroke(stroke)` - ストロークを追加
- `addDrawingShape(shape)` - 図形を追加
- `removeDrawingElement(id)` - 要素を削除
- `clearDrawing()` - すべてをクリア
- `getDrawingElements()` - 描画要素を取得

#### テキスト操作
- `insertText(index, text)` - テキスト挿入
- `deleteText(index, length)` - テキスト削除
- `getText()` - テキスト取得

#### プレゼンス管理
- `updateCursor(x, y)` - カーソル位置更新
- `updatePresence(status, metadata)` - プレゼンス更新
- `getConnectedUsers()` - 接続ユーザー一覧
- `getUserCount()` - ユーザー数取得

#### オフライン対応
- `getOfflineStatus()` - オフライン状態取得
- `forceSyncNow()` - 手動同期実行
- `retryFailedOperations()` - 失敗操作の再試行

## テスト

### テスト実行

```bash
# 全テスト実行
pnpm test

# 特定のファイルをテスト
pnpm test collaboration.test.js

# カバレッジレポート生成
pnpm test:coverage
```

### テストカバレッジ

- **CollaborationEngine**: 95%+
- **WebRTCManager**: 90%+
- **PresenceManager**: 90%+
- **OfflineSyncManager**: 85%+
- **ErrorHandler**: 90%+
- **統合テスト**: 85%+

## 開発ガイドライン

### コーディング規約

- ESLint設定に従った静的解析
- Prettier設定による自動フォーマット
- Jest による単体・統合テスト
- JSDoc形式のコメント推奨

### 開発フロー

1. `pnpm test:watch` でTDD開発
2. `pnpm lint` でコード品質チェック
3. `pnpm format` でフォーマット
4. テストカバレッジ維持

## トラブルシューティング

### よくある問題

**WebSocket接続エラー**
```javascript
// 接続URLの確認
console.log('WebSocket URL:', whiteboard.config.websocketUrl);

// 手動再接続
whiteboard.forceReconnect();
```

**WebRTC接続失敗**
```javascript
// STUN/TURNサーバー設定の確認
const stats = whiteboard.getSystemStats();
console.log('WebRTC状態:', stats.webrtc);
```

**オフライン同期の問題**
```javascript
// 同期状態の確認
const offlineStatus = whiteboard.getOfflineStatus();
console.log('同期待ち操作:', offlineStatus.pendingOperations);

// 手動同期
whiteboard.forceSyncNow();
```

## ライセンス

MIT License