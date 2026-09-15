# Simple Reminder Bot

## Setup

1. Node.js 18.17 以降を用意します。
2. 依存関係をインストールします。

```sh
npm install
```

3. `.env` の `APPLICATION_ID` に Application ID、`DISCORD_TOKEN` に Bot Token を設定します。
4. Discord の Developer Portal で Bot を作成し、OAuth2 URL Generator から `bot` と `applications.commands` を選んでサーバーへ招待します。
5. Slash Command を登録します。

```sh
npm run register
```

`GUILD_ID` を設定した場合は、そのサーバーへ即時登録されます。未設定の場合はグローバル登録となり、反映に時間がかかることがあります。

6. Bot を起動します。

```sh
npm start
```

## Commands

- `/remind title:タイトル content:内容 at:2026-09-15 18:30 mention:<@ユーザーID> または <@&ロールID> self:true`
- `/reminders` 自分が通知される今後のリマインダーを表示
- `/join id:1` 他の人がリマインダーの通知対象に自分を追加
- `/leave id:1` リマインダーの通知対象から自分を解除
- `/cancel id:1` 自分のリマインダーをキャンセル

日時はJST固定で、`2026-09-15 18:30` または `2026/09/15 18:30` の形式で指定できます。秒まで指定する場合は `2026-09-15 18:30:00` とします。リマインダーはメモリ上だけに保存されるため、Botを再起動すると消えます。

`self:true` を指定すると、登録した本人にも自動でメンションします。`mention` と併用すれば、本人と他のユーザー・ロールの両方に通知できます。

リマインダー作成後に表示されるIDを使って、他の人も `/join id:ID` で自分を通知対象に追加できます。登録後は `/leave id:ID` で解除できます。

リマインダーとIDはサーバーごとに分離されています。同じユーザーであっても、別サーバーのリマインダー一覧を見たり、参加したりすることはできません。
