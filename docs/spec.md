# 要件定義（Realtime Collaborative Whiteboard － Mesh Edition）

## 1. プロジェクト概要

| 項目      | 内容                                                                             |
| ------- | ------------------------------------------------------------------------------ |
| プロジェクト名 | Realtime Collaborative Whiteboard (Mesh Only)                                  |
| 目的      | バックエンド運用コストを極限まで削減しつつ、ブラウザ間 P2P メッシュ接続でリアルタイム共同編集を実現                           |
| 主な特徴    | 100 % WebRTC DataChannel メッシュ / オフライン対応 CRDT (Y.js) / 最小限シグナリング (Lambda\@Edge) |

---

## 2. 機能要件

### 2.1 ホワイトボード機能

| #   | 機能        | 詳細                      |
| --- | --------- | ----------------------- |
| F-1 | ペン & 図形描画 | 直線・フリーハンド・矩形・円。色／太さ調整可  |
| F-2 | テキスト配置    | 任意位置にテキストボックス、フォントサイズ変更 |
| F-3 | CRDT 同期   | Y.js による衝突解決＋オフライン編集復旧  |
| F-4 | ユーザープレゼンス | カーソル位置・ユーザー名・色をリアルタイム表示 |
| F-5 | ルーム作成／参加  | URL 招待式。ルーム TTL = 24 h  |

### 2.2 ネットワーク機能

| #   | 機能            | 詳細                                    |
| --- | ------------- | ------------------------------------- |
| N-1 | WebRTC メッシュ接続 | SDP／ICE 交換のみシグナリング経由。以降は完全 P2P        |
| N-2 | STUN          | 無料パブリック STUN (Google/Cloudflare)      |
| N-3 | TURN（オプション）   | UDP 禁止環境用に coturn (t4g.micro) を手動起動可能 |
| N-4 | 参加上限ガード       | 20 peer を超える入室要求は警告表示＆自己責任で続行         |

---

## 3. 非機能要件

| カテゴリ     | 指標          | 受入基準                                 |
| -------- | ----------- | ------------------------------------ |
| パフォーマンス  | 描画 RTT      | 95パーセンタイル < 200 ms (≤20人)            |
| 可用性      | 接続成功率       | 90 %以上（TURN 未使用時）                    |
| コスト      | Backend コスト | ≤ \$5 / 1 k MAU / 月                  |
| セキュリティ   | 認証          | Cognito JWT トークン必須                   |
| ブラウザ互換   | サポート        | Chrome / Edge / Firefox / Safari 最新版 |
| アクセシビリティ | WCAG        | 2.1 AA 準拠                            |

---

## 4. 技術スタック

| レイヤ        | 採用技術                                                       |
| ---------- | ---------------------------------------------------------- |
| フロント       | React + TypeScript, Vite, Y.js, Zustand, Off-screen Canvas |
| シグナリング     | API Gateway (HTTP API) ＋ Lambda\@Edge (Node 20)            |
| データストア     | DynamoDB On-Demand (rooms, ttl)                            |
| 静的配信       | S3 + CloudFront                                            |
| オプション TURN | coturn (ARM64 t4g.micro)                                   |

---

## 5. 運用・監視

* **CloudWatch Logs Insights** で Lambda エラーレート監視
* **Athena**＋S3 に API アクセスログ保存（30 日）
* **GitHub Actions** → CDK デプロイ、`cdk diff` 結果を PR コメント自動投稿
* **Sentry** でクライアントエラー集約、roomId はハッシュ化

---

## 6. コスト試算（月次 / ap-northeast-1）

| リソース            | 想定量                | 単価       | 月額        |
| --------------- | ------------------ | -------- | --------- |
| CloudFront 転送   | 50 GB              | \$0.085  | \$4.25    |
| Lambda\@Edge 呼出 | 1 M                | \$0.20/M | \$0.20    |
| DynamoDB        | 0.5 M read / write | \$1.25/M | \$2.50    |
| **合計**          | –                  | –        | **約 \$7** |

> TURN オン時：+ t4g.micro \$9／月 ＋ 転送量課金

---

## 7. リスク & 対策

| リスク            | 影響          | 対策                           |
| -------------- | ----------- | ---------------------------- |
| UDP ブロック環境     | 接続不可        | TURN オプション提示                 |
| 20人超参加時の負荷     | クライアントクラッシュ | ハードリミット＋警告トースト               |
| Lambda スロットリング | ルーム作成失敗     | API GW RPS 引き上げ／Regional に切替 |
| 不正アクセス         | データ漏洩       | Cognito JWT 検証＋WAF           |

---

## 8. マイルストーン

1. **MVP (4 週)**：描画・Y.js・メッシュ同期・ルーム作成
2. **β (2 週)**：認証統合・Dynamo TTL・ログ基盤
3. **GA (2 週)**：負荷テスト・A11y 改善・ドキュメント公開

---

```mermaid
flowchart LR
  %% Clients
  subgraph Browser Peer Mesh
    style Browser Peer Mesh fill:#fafafa,stroke:#999,stroke-width:1px,stroke-dasharray: 5 5;
    C1("User A<br>React App") --- C2("User B")
    C1 --- C3("User C")
    C2 --- C3
  end

  %% Signaling
  C1 -. "SDP / ICE" .-> APIGW[(API Gateway)]
  C2 -.-> APIGW
  C3 -.-> APIGW
  APIGW --> L@E[("Lambda@Edge<br>signal-handler")]

  %% Data store
  L@E --> DDB[(DynamoDB<br>rooms TTL)]

  %% Static hosting
  CF[CloudFront CDN] --- S3[(S3 SPA Bucket)]
  C1 == "HTTPS assets" ==> CF
  C2 == "HTTPS assets" ==> CF
  C3 == "HTTPS assets" ==> CF

  %% Optional TURN
  subgraph Optional
    TURN[(coturn<br>t4g.micro)]
  end
  C1 -. "UDP/TCP relay" .- TURN
  C2 -.-> TURN
  C3 -.-> TURN
```
