---
name: firestore-rules-deploy
description: この開発環境からFirestoreセキュリティルール・複合インデックスを直接デプロイする手順（capabilityの確認方法・安全な進め方）。firestore.rules / firestore.indexes.json を変更した後、実際にFirebaseへ反映する時に使う。
---

# Firestoreルール／インデックスのデプロイ

正本: [online-multiplayer](../online-multiplayer/SKILL.md)（ルール・インデックスの内容そのもの）。本スキルは「変更した`firestore.rules`/`firestore.indexes.json`を実際にFirebaseへ反映する」実行手順を扱う。

## この開発環境（Claude Code）でも実行できる

[git-workflow.mdのpush権限](../../rules/common/git-workflow.md#この開発環境claude-codeからのpush権限)の節にある通り、GitHubへの`git push`はデフォルトで認証情報がなく、委譲したい場合はこのリポジトリ専用のSSH Deploy Keyを別途セットアップする必要がある。

**Firebaseはこれと事情が異なる。** この開発環境には`firebase`（`firebase-tools`）CLIが既にインストール済みで、ユーザーのGoogleアカウントでログイン済みの状態になっている（`npx firebase login:list`で確認できる）。そのため、追加のセットアップなしに、この環境から直接

```
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:rules,firestore:indexes   # firestore.indexes.jsonも変更した場合
```

を実行できる。**「Firebaseへの反映はユーザー側の手動作業」という記述（[online-multiplayer](../online-multiplayer/SKILL.md)などに残っている場合がある）は、この環境が未セットアップだった頃の名残であり、現在は不要。** ルール・インデックスを変更したら、このスキルの手順に従ってこの環境から直接デプロイしてよい。

## 権限スコープに関する注意（git Deploy Keyとの違い）

git用のSSH Deploy Keyは「このリポジトリへのpush/pullのみ」に限定した狭いスコープで、専用に新規発行したものだった。**Firebase CLIのログインはそれとは異なり、ユーザーの個人Googleアカウントそのものであり、スコープを絞る仕組みを介していない。** 実態として、このプロジェクト（`dosero`）に対して以下が可能な状態にある。

- `firestore:rules` / `firestore:indexes` 以外のターゲット（Hosting、Functions等、将来追加された場合を含む）へのデプロイ
- Firebaseコンソール相当の操作全般（プロジェクト設定の変更など）

**そのため、このスキルでの操作は必ず `--only firestore:rules`（または`,firestore:indexes`併記）に限定し、ターゲットを指定しない裸の`firebase deploy`や、他のターゲットを含むデプロイは行わない。** より狭いスコープ（Firestoreのみに限定したサービスアカウント等)が必要になった場合は、ユーザーと相談の上で別途検討する。

## 手順

1. **`firestore.rules`（必要なら`firestore.indexes.json`も）の変更をコミットする。** [atomic-commit](../atomic-commit/SKILL.md)に従い、ルール変更は対応するアプリケーションコードの変更と分けて、意味の分かる単位でコミットする。

2. **認証状態とプロジェクトを確認する。**
   ```
   npx firebase login:list
   npx firebase projects:list
   ```
   ログイン済みで、`.firebaserc`の`default`プロジェクト（このリポジトリでは`dosero`）にアクセスできることを確認する。ログアウトしている・見えるプロジェクトが想定と違う場合は、実際にデプロイする前にユーザーに確認する。

3. **ドライランでルールの構文を検証する。**
   ```
   npx firebase deploy --only firestore:rules --dry-run
   ```
   `rules file firestore.rules compiled successfully`が出れば構文エラーなし。実際には反映されない安全な確認ステップなので、確認なしに実行してよい。

4. **本番反映を実行する。** ドライランと違い、これは**即座に・段階を踏まずに**本番のセキュリティルールを書き換える（[static-deploy](../static-deploy/SKILL.md)のアプリコード配信のように、バージョンタグpush→GitHub Actions実行という確認の挟まる仕組みが無い）。**2026-09-06にユーザーから明示的な依頼があり、`dosero`プロジェクトに対してはこの本番反映を都度の確認なしに実行してよい運用になっている**（[git-workflow.mdのpush権限](../../rules/common/git-workflow.md#この開発環境claude-codeからのpush権限)節で委譲されているgit pushと同じタイミングでの依頼。ブランチ運用の一部として、`main`へのマージ後にルール変更が含まれていればそのままデプロイまで行う）。ドライランで構文エラーが無いことだけは必ず先に確認する。他のFirebaseプロジェクトや、このプロジェクトでも過去に依頼のない種類の操作（Hosting/Functionsのデプロイ等）にはこの委譲は及ばないため、それらは改めて確認する。
   ```
   npx firebase deploy --only firestore:rules
   ```
   `firestore.indexes.json`も変更した場合は`--only firestore:rules,firestore:indexes`とする。

5. **反映を確認する。** コマンドの出力に`✔  Deploy complete!`が出ることを確認する。必要であれば[Firebaseコンソール](https://console.firebase.google.com/project/dosero/firestore/rules)のルールタブで反映後の内容を目視確認する。

## スキーマ変更を伴うルール変更の順序に関する注意

ルールがドキュメントの新しいフィールド形状（例: フラットな`score`ではなく`ratings`マップ）を前提にしている場合、**アプリコード側の対応するデプロイ（GitHub Pagesはバージョンタグpushが必要。[release-tagging](../release-tagging/SKILL.md)参照）とルールのデプロイはタイミングがずれうる**ことを意識する。

- 実データ・実プレイヤーが存在しない開発中は、順序を厳密に気にする必要はない。
- 実プレイヤーが存在する状態でスキーマを変更する場合は、「新旧どちらの形状の書き込みも許可する」後方互換なルールを一時的に用意し、アプリコードのロールアウトが完了してから新形状のみを要求する厳格なルールに切り替える、といった段階移行を検討する（現時点でそのような移行を自動化する仕組みはこのプロジェクトに無いため、必要になった時点で改めて設計する）。
