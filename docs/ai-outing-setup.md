# ネット検索と天気を使うAIお出かけ提案

## 現在の実装

- 出発地：東戸塚駅周辺。子供：4歳・6歳。
- 取得日：今日から15日後まで。Open-MeteoまたはMET Norwayの現地予報が確認できる日付だけ。
- OpenAI Responses APIのweb_searchで、登録済み施設に限定せず、公式施設情報と対象日の営業・年齢条件を検索します。
- 最大3件を表示します。条件を確認できる候補が少ない場合はその件数だけ表示します。
- 車の時間はOSRM / OpenStreetMapで計算し、渋滞なしの片道120分以下だけを残します。実際の出発日時の交通量・事故・休憩・駐車待ちの予測ではありません。
- 出発地または現地が雨・雪・霧・雷雨、降水確率40%以上、最大風速36km/h以上なら、屋内で完結する施設だけを表示します。
- 施設ページ・検索で参照した出典・現地の予報・年齢制限や予約条件をカードで表示します。
- 「家族の候補に保存」を押したときだけ、登録済み施設に追加します。

## 最初に1回だけ必要な操作

Supabaseの関数 `ai-outing` と、日本時間で1日10回の利用制限はこのチャットで配置済みです。

1. [OpenAI API Keys](https://platform.openai.com/api-keys)で、API用のキーを作成します。API側の請求設定・利用枠も確認してください。ChatGPTの契約とは別のAPI利用です。
2. [SupabaseのSecrets設定](https://supabase.com/dashboard/project/aaozokleopirgsuaubnz/functions/secrets)を開きます。
3. Add new secret（新しいシークレットを追加）で、名前を **OPENAI_API_KEY**、値を作成したAPIキーとして保存します。
4. キーはチャット、GitHub、Web画面の入力フォームに貼らないでください。SupabaseのSecrets画面だけに保存します。
5. Family Hubにログインし「お出かけ」→「AIと行き先を考える」を開きます。
6. 日付を選び「ネットと天気から3つ提案してもらう」を押します。通常、検索と検証に1〜2分ほどかかる場合があります。

検索にはAPI料金がかかります。利用者ごとに日本時間で1日10回までです。外部検索を試行した場合は失敗時も回数に含みます。同じ条件の直近結果を再表示できた場合は検索回数を追加しません。キャッシュは一時的なため、常に再利用できる保証はありません。

## 表示が出ない場合

- 初期設定が必要：Secretsの名前が `OPENAI_API_KEY` と一致しているか確認。
- APIキーまたはモデルの権限：キーが有効か、Responses APIと検索対応モデル `gpt-5.4-mini-2026-03-17` を使えるか確認。
- 残高・利用上限：OpenAI API側の請求設定・上限を確認。
- 天気を取得できない：時間を置いて再実行。天気の推測で代用した候補は表示しません。
- 候補が0件：営業・年齢・出典・移動時間・予報・予算を確認できた施設がない状態です。予算指定を外す、日付を変えるなどして再検索します。
- ログインし直す：Hubで一度ログアウトし、再ログイン。

当日の休業・混雑・交通規制・料金は変わる場合があります。カードの施設ページと車のルートから、出発前に確認できます。

## 開発者向け

- `supabase/functions/ai-outing/index.ts`：関数の入口。
- `handler.mjs`：ログイン検証・利用制限・検索・天気・経路確認。
- `recommend.mjs`：条件判定・出典の照合・検索用JSONスキーマ。
- `ai-outing-ui.js`：結果カードの表示。
- `supabase/ai-outing-quota.sql`：反映済みの利用制限SQL。アプリ利用者の再実行は不要。
- `node tests/ai-outing.test.mjs`：検索・経路・天気APIを模擬した検証。

公式資料：

- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Open-Meteo](https://open-meteo.com/en/docs)
- [OSRM API](https://project-osrm.org/docs/v5.24.0/api/)

### 利用制限の権限について

`consume_ai_request()` は、`auth.uid()` が存在する場合だけ、その利用者本人の当日カウントを1つ増やすための SECURITY DEFINER 関数です。利用者にはカウント表の変更権限を与えず、この限定処理のみを許可します。アドバイザーにはログイン済み利用者から実行可能という警告が残りますが、これは今回の利用制限で意図している公開範囲です。未ログイン実行は無効化済みです。

- [権限に関するアドバイザーの説明](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [既存の漏洩パスワード保護設定について](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)（今回のAI機能とは別で、変更していません）

## 天気サービスの一時障害対策

Open-Meteoが8秒以内に応答しない、HTTPエラー、予報項目の不足の場合はMET Norwayへ切り替えます。MET Norwayは予報期間が約9日間のため、それより先の日付では代替できない場合があります。両方のサービスで予報を確認できない場合は推測で補わず、エラーにします。

MET Norwayの時刻別予報は日本時間で日別集計します。降水確率がない場合は画面にも「提供なし」と表示し、天気の雨・雪などの記号、降水量、風速を使って屋内外を判定します。降水確率を0%と捏造しません。経緯度は小数4桁以内に切り詰め、取得した予報はサーバー専用のキャッシュ表で最低3時間、またはExpiresヘッダーで指定された時刻まで保持します。予報の出典とCC BY 4.0のリンクは画面に表示します。

- [MET Norwayの利用条件](https://api.met.no/doc/TermsOfService)
- [MET Norwayの予報仕様](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
