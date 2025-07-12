# Realtime Collaborative Whiteboard (Mesh Edition)

このリポジトリは、バックエンド運用コストを最小限に抑えたリアルタイム共同ホワイトボードを構築するための実験プロジェクトです。AWS CDK でインフラを定義し、フロントエンドは WebRTC DataChannels を利用したシンプルな HTML ページです。

## リポジトリ構成

- **cdk/** – インフラ定義と Lambda 関数
- **frontend/** – WebRTC シグナリングを試すための簡易ページ
- **docs/** – 日本語の設計資料と開発ルール

## はじめかた

1. [pnpm](https://pnpm.io/) で依存パッケージをインストール
   ```bash
   cd cdk
   pnpm install
   ```
2. CloudFormation テンプレートを合成
   ```bash
   pnpm run cdk:synth
   ```
3. スタックを AWS アカウントにデプロイ
   ```bash
   pnpm run cdk:deploy
   ```

詳しくは `docs/spec.md` と `docs/development-rules.md` を参照してください。
