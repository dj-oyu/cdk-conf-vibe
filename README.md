# CDK Conference Vibe - WebRTC Collaborative Whiteboard

リアルタイム共同編集ホワイトボードアプリケーション（P2Pメッシュ接続）

バックエンド運用コストを最小限に抑えたWebRTC DataChannelsを利用したリアルタイム共同ホワイトボードです。

## 🚀 デプロイ方法

### 自動デプロイ
```bash
./scripts/deploy.sh
```

### 手動デプロイ
```bash
cd cdk
pnpm install
pnpm run build
pnpm run cdk:deploy
```

## 🔧 設定について

WebSocket URLは自動的に設定されます：
- `frontend/config.js` がデプロイ時に自動生成される
- ハードコードされたURLは使用されません
- 開発時は `ws://localhost:3001` がフォールバック値

## 📁 プロジェクト構成

```
├── cdk/                    # AWS CDK infrastructure
├── frontend/               # Static web frontend
├── scripts/               # Deployment scripts
└── docs/                  # Documentation
```

## 🔒 セキュリティ機能

- S3バケットのパブリックアクセス完全ブロック
- CloudFront Origin Access Control
- DynamoDB TTL自動クリーンアップ
- ルーム参加人数制限（8人）

## 📚 詳細ドキュメント

詳しくは `docs/spec.md` と `docs/development-rules.md` を参照してください。
