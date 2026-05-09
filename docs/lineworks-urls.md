# LINE WORKS 関連 URL

## Developer Console（アプリ・Bot 管理）
https://developers.worksmobile.com/console

## 管理者コンソール（メンバー管理）
https://admin.worksmobile.com

## API ドキュメント
https://developers.worksmobile.com/jp/docs

## 認証エンドポイント
- Token 取得: `https://auth.worksmobile.com/oauth2/v2.0/token`

## API ベース URL
- v1.0: `https://www.worksapis.com/v1.0`

## Bot メッセージ送信エンドポイント
| 送信先 | エンドポイント |
|--------|---------------|
| トークルーム | `POST /bots/{botId}/channels/{channelId}/messages` |
| 個人（1:1） | `POST /bots/{botId}/users/{userId}/messages` |
