# プロジェクト学習リソース

このドキュメントは、`Realtime Collaborative Whiteboard` プロジェクトを成功させるために必要な技術要素を学習するためのリソースをまとめたものです。

---

## 1. 中核コンセプト：WebRTC + Y.js によるリアルタイム同期

このプロジェクトの心臓部は、WebRTC を介した P2P 通信と、CRDT ライブラリである Y.js を組み合わせたリアルタイムでのデータ同期です。

### 基本的な考え方

- **WebRTC:** ブラウザ間で直接データをやり取りするための技術。サーバーを介さないため、低遅延な通信が可能です。
- **Y.js:** 複数のユーザーが同時にデータを編集しても、競合を自動的に解決し、最終的に全員のデータが同じ状態になることを保証するライブラリ（CRDT）。
- **y-webrtc:** Y.js のデータを WebRTC 経由で他のピアに同期するためのプロバイダー。シグナリングサーバーさえ用意すれば、複雑なバックエンドなしにP2Pメッシュネットワークを構築できます。

### 参考資料

- **チュートリアル:** [Building a Real-Time Collaborative React App with Y.js and WebRTC](https://dev.to/gauthamp/building-a-real-time-collaborative-react-app-with-yjs-and-webrtc-2b9j) - React, Y.js, WebRTC を使って共同編集テキストエディタを構築する手順が解説されています。
- **Y.js 公式ドキュメント:** [https://docs.yjs.dev/](https://docs.yjs.dev/)

---

## 2. シグナリングサーバーのアーキテクチャ

`spec.md` では当初 `Lambda@Edge` の利用を想定していましたが、調査の結果、WebRTC のシグナリングのように永続的な接続を管理するには、**API Gateway の WebSocket API** を利用するのがより標準的で堅牢なアーキテクチャです。

### 推奨アーキテクチャ

1.  **API Gateway (WebSocket API):** クライアントからの WebSocket 接続を受け付けるエンドポイント。
2.  **AWS Lambda:** `$connect`, `$disconnect`, `$default` (メッセージ受信) などのイベントを処理するビジネスロジックを実装。
3.  **DynamoDB:** 接続中のクライアントの `connectionId` や、どのユーザーがどのルームにいるかの状態を保存します。

この構成により、スケーラブルでコスト効率の高いシグナリングサーバーを構築できます。

### 参考資料

- **解説記事:** [Serverless WebRTC signaling with Amazon API Gateway and AWS Lambda](https://webrtchacks.com/serverless-webrtc-signaling-with-amazon-api-gateway-and-aws-lambda/) - このアーキテクチャの概念的な解説です。

---

## 3. AWS CDK によるインフラ構築

上記の WebSocket API, Lambda, DynamoDB からなるインフラは、AWS CDK を使うことで効率的にコードとして定義・デプロイできます。

### CDK 実装のポイント

- `aws-apigatewayv2` と `aws-apigatewayv2-integrations` モジュールで WebSocket API と Lambda の統合を定義します。
- `aws-lambda-nodejs` の `NodejsFunction` を使うと、TypeScript の Lambda コードを簡単にデプロイできます。
- Lambda 関数の環境変数に DynamoDB のテーブル名を渡し、IAM ロールにはテーブルへの読み書き権限と、API Gateway の接続を管理する権限 (`execute-api:ManageConnections`) を付与する必要があります。

### 参考資料

- **CDK 実装例:** [GitHub - aws-samples/aws-cdk-examples](https://github.com/aws-samples/aws-cdk-examples/tree/master/typescript/api-websocket-lambda-dynamodb) - 本プロジェクトの構成に非常に近い、CDK による WebSocket API のサンプル実装です。
- **AWS CDK v2 ドキュメント:** [https://docs.aws.amazon.com/cdk/api/v2/](https://docs.aws.amazon.com/cdk/api/v2/)

---

## 4. 主要技術の公式ドキュメント

より深い理解のためには、各技術の公式ドキュメントを参照することが不可欠です。

- **React:** [https://react.dev/](https://react.dev/)
- **TypeScript:** [https://www.typescriptlang.org/](https://www.typescriptlang.org/)
- **Vite:** [https://vitejs.dev/](https://vitejs.dev/)
- **Zustand:** [https://zustand-demo.pmnd.rs/](https://zustand-demo.pmnd.rs/)
- **API Gateway WebSocket API:** [https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)
- **AWS Lambda:** [https://aws.amazon.com/lambda/](https://aws.amazon.com/lambda/)
- **DynamoDB:** [https://aws.amazon.com/dynamodb/](https://aws.amazon.com/dynamodb/)
