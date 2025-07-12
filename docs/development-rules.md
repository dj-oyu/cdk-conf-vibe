# 開発ルール (Development Rules)

このドキュメントは、本プロジェクトにおける開発の一貫性と効率性を保つためのルールを定めます。

---

## 1. パッケージ管理

- **パッケージマネージャー:** プロジェクトの唯一のパッケージマネージャーとして `pnpm` を使用します。
    - 新規パッケージの追加: `pnpm add <package-name>`
    - 開発用パッケージの追加: `pnpm add -D <package-name>`
    - 依存関係のインストール: `pnpm install`
- **禁止事項:** `npm` や `yarn` コマンドの使用は、依存関係の不整合を避けるため禁止します。

## 2. 基本的な開発フロー

1.  **リポジトリのクローン:** `git clone <repository-url>`
2.  **依存関係のインストール:** `cd cdk && pnpm install`
3.  **ブランチの作成:** `git switch -c feature/my-new-feature` (後述のブランチ規約を参照)
4.  **開発:** コードの編集、テストの実装などを行います。
5.  **品質チェック:** コミット前に、必ずリンターとフォーマッターを実行します。
    - `pnpm run lint`
    - `pnpm run format`
6.  **テストの実行:** `pnpm test` を実行し、すべてのテストがパスすることを確認します。
7.  **コミット:** 変更内容をコミットします。
8.  **プルリクエストの作成:** GitHub上でプルリクエストを作成し、レビューを依頼します。

## 3. `package.json` スクリプト規約

頻繁に使用するコマンドは `package.json` の `scripts` に定義し、`pnpm run <script-name>` 形式で実行します。これにより、コマンドの詳細を覚える必要がなくなります。

**推奨スクリプト:**

```json
{
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "jest",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write .",
    "cdk": "cdk",
    "cdk:synth": "pnpm run cdk synth",
    "cdk:deploy": "pnpm run cdk deploy",
    "cdk:diff": "pnpm run cdk diff"
  }
}
```

*`pnpm run cdk deploy` のように実行することで、グローバルインストールされていないローカルの `aws-cdk` を確実に使用できます。*

## 4. Git ワークフロー

- **ブランチ:** `main` ブランチは保護され、直接のプッシュは禁止します。すべての変更はプルリクエストを通じてマージされます。
- **ブランチ命名規則:**
    - `feature/<description>`: 新機能の実装
    - `fix/<description>`: バグ修正
    - `docs/<description>`: ドキュメントの更新
    - `chore/<description>`: ビルドプロセスや設定の変更など
- **コミットメッセージ:** [Conventional Commits](https://www.conventionalcommits.org/) の規約に従うことを推奨します。（例: `feat: add user login functionality`）

---
