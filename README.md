# Watanabe Family Hub

家族の予定・買い物・タスク・お出かけ管理。

Appleカレンダー／リマインダーの取り込み設定は [設定手順](docs/apple-sync-setup.md) を参照してください。
GitHubへのアップロードとは別に、SupabaseへのSQL適用・関数デプロイと、iPhoneのショートカット設定が必要です。

ローカル検証：`node tests/apple-sync.test.mjs`


## 週末お出かけアルバム

Hubの「アルバム」タブとお出かけ候補の「写真で記録」から利用できます。
写真と記録は同じHubアカウントの端末間で同期されます。以前の記録がある端末で「この端末の記録を同期する」を押して移行できます。画面構成・保存方式・データ差し替え・確認手順・TODOは [機能説明](docs/weekend-album.md) を参照してください。

検証：`node --test tests/album-bridge.test.mjs tests/outing-browser.test.mjs tests/service-worker.test.cjs`
