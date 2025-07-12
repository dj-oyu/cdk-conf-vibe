# プロジェクトで利用するツールと技術スタック

このドキュメントは `docs/spec.md` に基づき、Realtime Collaborative Whiteboard プロジェクトで使用される主要なツール、ライブラリ、サービスをまとめたものです。

## 開発全般 (General Development)

- **AWS CDK (Cloud Development Kit):** TypeScript を使用して AWS インフラをコードで定義・プロビジョニングします。
- **Git & GitHub:** ソースコードのバージョン管理とリポジトリホスティング。
- **GitHub Actions:** CI/CD パイプラインを構築し、テスト、ビルド、デプロイを自動化します。
- **pnpm:** 高速で効率的な Node.js パッケージマネージャー。
- **Jest:** CDK のテストやフロントエンドの単体テストに使用されるテスティングフレームワーク。

## フロントエンド (Frontend)

- **React:** UI を構築するための JavaScript ライブラリ。
- **TypeScript:** 静的型付けを提供し、コードの堅牢性を高めます。
- **Vite:** 高速な開発サーバーとビルドツール。
- **Y.js:** リアルタイム共同編集を実現するための CRDT (Conflict-free Replicated Data Type) ライブラリ。
- **Zustand:** シンプルで軽量な React 向け状態管理ライブラリ。
- **Off-screen Canvas:** メインスレッドをブロックせずに描画処理を行うためのブラウザ API。

## バックエンド (Backend - Signaling & Data)

- **API Gateway (HTTP API):** WebRTC のシグナリング処理を行うための軽量な API エンドポイントを提供します。
- **Lambda@Edge (Node.js 20):** CloudFront のエッジロケーションで実行されるシグナリングサーバーロジック。低レイテンシな接続交換を実現します。
- **DynamoDB:** ルーム情報やセッションデータを格納する NoSQL データベース。オンデマンドキャパシティでコストを最適化します。

## インフラストラクチャ & ホスティング (Infrastructure & Hosting)

- **S3 (Simple Storage Service):** React アプリケーションの静的ファイル（HTML, CSS, JS）をホスティングします。
- **CloudFront:** S3 のコンテンツをグローバルに配信する CDN。Lambda@Edge と統合してシグナlingも処理します。
- **EC2 (t4g.micro):** （オプション）UDP がブロックされているネットワーク向けに `coturn` TURN サーバーをホスティングします。
- **coturn:** オープンソースの STUN/TURN サーバー実装。

## 運用 & 監視 (Operations & Monitoring)

- **CloudWatch:** Lambda のログ、メトリクスを監視し、アラームを設定します。Logs Insights を用いて高度なログ分析も行います。
- **AWS WAF:** 不正なリクエストから API Gateway を保護するウェブアプリケーションファイアウォール。
- **Sentry:** クライアントサイド（ブラウザ）で発生したエラーを収集・追跡します。
- **Amazon Athena:** S3 に保存されたアクセスログなどを SQL でクエリ・分析します。
