require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const applicationId = process.env.APPLICATION_ID;
const token = process.env.DISCORD_TOKEN;

if (!applicationId || !token) {
  console.error('APPLICATION_ID と DISCORD_TOKEN を .env に設定してください。');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('指定した日時にリマインダーを送信します')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('リマインダーのタイトル')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName('content')
        .setDescription('リマインダーの内容')
        .setRequired(true)
        .setMaxLength(1800),
    )
    .addStringOption((option) =>
      option
        .setName('at')
        .setDescription('JSTの日時 (例: 2026-09-15 18:30)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('mention')
        .setDescription('メンションするユーザー/ロールのID、またはメンション')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('self')
        .setDescription('自分にもメンションする')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('自分が通知されるリマインダーを表示します'),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('リマインダーの通知対象に自分を追加します')
    .addStringOption((option) =>
      option.setName('id').setDescription('参加するリマインダーID').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('リマインダーの通知対象から自分を外します')
    .addStringOption((option) =>
      option.setName('id').setDescription('通知を外すリマインダーID').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('自分のリマインダーをキャンセルします')
    .addStringOption((option) =>
      option.setName('id').setDescription('キャンセルするリマインダーID').setRequired(true),
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);
const route = process.env.GUILD_ID
  ? Routes.applicationGuildCommands(applicationId, process.env.GUILD_ID)
  : Routes.applicationCommands(applicationId);

rest.put(route, { body: commands })
  .then(() => console.log(process.env.GUILD_ID ? 'Guild commands registered.' : 'Global commands registered.'))
  .catch((error) => {
    console.error('コマンド登録に失敗しました:', error);
    process.exitCode = 1;
  });
