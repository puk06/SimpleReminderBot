require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('DISCORD_TOKEN を .env に設定してください。');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const reminders = new Map();
const nextReminderIds = new Map();
const dataDirectory = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDirectory, 'reminders.json');

function getNextReminderId(guildId) {
  const id = nextReminderIds.get(guildId) ?? 1;
  nextReminderIds.set(guildId, id + 1);
  return String(id);
}

function getReminderKey(guildId, id) {
  return `${guildId}:${id}`;
}

function saveReminders() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const data = [...reminders.values()].map((reminder) => ({
    id: reminder.id,
    guildId: reminder.guildId,
    userId: reminder.userId,
    channelId: reminder.channelId,
    title: reminder.title,
    content: reminder.content,
    at: reminder.at.toISOString(),
    subscribers: [...reminder.subscribers],
    roles: reminder.roles,
  }));
  fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function loadReminders() {
  if (!fs.existsSync(dataFile)) return;

  let storedReminders;
  try {
    storedReminders = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    console.error('reminders.json の読み込みに失敗しました。空の状態で起動します:', error);
    return;
  }

  if (!Array.isArray(storedReminders)) return;

  for (const stored of storedReminders) {
    const at = new Date(stored.at);
    if (!stored.guildId || !stored.id || !stored.channelId || !stored.title || !stored.content
      || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) continue;

    const reminder = {
      ...stored,
      key: getReminderKey(stored.guildId, String(stored.id)),
      id: String(stored.id),
      at,
      subscribers: new Set(Array.isArray(stored.subscribers) ? stored.subscribers : []),
      roles: Array.isArray(stored.roles) ? stored.roles : [],
    };
    if (reminders.has(reminder.key)) continue;

    reminders.set(reminder.key, reminder);
    const numericId = Number(reminder.id);
    if (Number.isInteger(numericId)) {
      nextReminderIds.set(reminder.guildId, Math.max(nextReminderIds.get(reminder.guildId) ?? 1, numericId + 1));
    }
    scheduleReminder(reminder);
  }
}

function parseDate(value) {
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '0'] = match;
  const calendar = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ));

  // Date.UTCの繰り上がりを利用して、存在しない日付も弾く。
  if (
    calendar.getUTCFullYear() !== Number(year)
    || calendar.getUTCMonth() !== Number(month) - 1
    || calendar.getUTCDate() !== Number(day)
    || calendar.getUTCHours() !== Number(hour)
    || calendar.getUTCMinutes() !== Number(minute)
    || calendar.getUTCSeconds() !== Number(second)
  ) return null;

  // 入力はJSTとして解釈し、UTCのDateに変換する。
  return new Date(calendar.getTime() - 9 * 60 * 60 * 1000);
}

function parseMention(value) {
  if (!value) return { text: '', users: [], roles: [] };

  const users = [...value.matchAll(/<@!?([0-9]{17,20})>/g)].map((match) => match[1]);
  const roles = [...value.matchAll(/<@&([0-9]{17,20})>/g)].map((match) => match[1]);
  const bareIds = [...value.matchAll(/(?:^|\s)([0-9]{17,20})(?=\s|$)/g)].map((match) => match[1]);

  for (const id of bareIds) {
    if (value.includes(`<@&${id}>`)) continue;
    if (value.includes(`<@${id}>`) || value.includes(`<@!${id}>`)) continue;
    users.push(id);
  }

  const uniqueUsers = [...new Set(users)];
  const uniqueRoles = [...new Set(roles)];
  const text = [
    ...uniqueUsers.map((id) => `<@${id}>`),
    ...uniqueRoles.map((id) => `<@&${id}>`),
  ].join(' ');

  return { text, users: uniqueUsers, roles: uniqueRoles };
}

function formatDate(date) {
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function getMentionData(reminder) {
  const users = [...reminder.subscribers];
  const mentionText = [
    ...users.map((id) => `<@${id}>`),
    ...reminder.roles.map((id) => `<@&${id}>`),
  ].join(' ');
  return { users, mentionText };
}

function formatReminder(reminder, mentionText = '') {
  return [
    ...(mentionText ? [mentionText] : []),
    `## __${reminder.title}#${reminder.id}__`,
    `**日時:** \`${formatDate(reminder.at)}\``,
    '**内容**',
    reminder.content,
  ].join('\n\n');
}

function scheduleReminder(reminder) {
  const delay = reminder.at.getTime() - Date.now();
  if (delay > 2_147_483_647) {
    reminder.timer = setTimeout(() => scheduleReminder(reminder), 2_147_483_647);
    return;
  }
  reminder.timer = setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(reminder.channelId);
      if (channel?.isTextBased()) {
        const mention = getMentionData(reminder);
        await channel.send({
          content: formatReminder(reminder, mention.mentionText),
          allowedMentions: { users: mention.users, roles: reminder.roles },
        });
      }
    } catch (error) {
      console.error(`リマインダー \`${reminder.id}\` の送信に失敗しました:`, error);
    } finally {
      reminders.delete(reminder.key);
      saveReminders();
    }
  }, delay);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag} としてログインしました。`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) {
    await interaction.reply({ content: 'このBotはサーバー内でのみ利用できます。', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'remind') {
    const title = interaction.options.getString('title', true);
    const content = interaction.options.getString('content', true);
    const at = parseDate(interaction.options.getString('at', true));
    const mention = parseMention(interaction.options.getString('mention'));
    const remindSelf = interaction.options.getBoolean('self') ?? false;
    const subscribers = new Set([
      ...mention.users,
      ...(remindSelf ? [interaction.user.id] : []),
    ]);

    if (!at) {
      await interaction.reply({
        content: '日時はJSTで `2026-09-15 18:30` または `2026/09/15 18:30` の形式で指定してください。',
        ephemeral: true,
      });
      return;
    }
    if (at.getTime() <= Date.now()) {
      await interaction.reply({ content: '未来の日時を指定してください。', ephemeral: true });
      return;
    }

    const id = getNextReminderId(interaction.guildId);
    const reminder = {
      id,
      key: getReminderKey(interaction.guildId, id),
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      title,
      content,
      at,
      subscribers,
      roles: mention.roles,
    };
    reminders.set(reminder.key, reminder);
    saveReminders();
    scheduleReminder(reminder);

    await interaction.reply(
      {
        content: `リマインダー **\`${title}#${id}\`** を登録しました。\n\`${formatDate(at)}\` に送信します。\n他の人は \`\/join id:${id}\` で参加できます。`,
        allowedMentions: { parse: [] },
      },
    );
    return;
  }

  if (interaction.commandName === 'reminders') {
    const subscribedReminders = [...reminders.values()].filter((reminder) => (
      reminder.guildId === interaction.guildId
      && reminder.subscribers.has(interaction.user.id)
    ));
    if (subscribedReminders.length === 0) {
      await interaction.reply({ content: '登録中のリマインダーはありません。', ephemeral: true });
      return;
    }
    await interaction.reply({
      content: subscribedReminders
        .sort((a, b) => a.at - b.at)
        .map((reminder) => formatReminder(reminder))
        .join('\n\n---\n\n'),
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'join' || interaction.commandName === 'leave') {
    const id = interaction.options.getString('id', true);
    const reminder = reminders.get(getReminderKey(interaction.guildId, id));
    if (!reminder || reminder.guildId !== interaction.guildId) {
      await interaction.reply({ content: 'そのリマインダーは見つかりません。', ephemeral: true });
      return;
    }

    if (interaction.commandName === 'join') {
      if (reminder.subscribers.has(interaction.user.id)) {
        await interaction.reply({ content: `リマインダー **\`${id}\`** にはすでに参加しています。`, ephemeral: true });
        return;
      }
      reminder.subscribers.add(interaction.user.id);
      saveReminders();
      await interaction.reply(`リマインダー **\`${id}\`** に参加しました。通知時にメンションします。`);
    } else {
      if (!reminder.subscribers.delete(interaction.user.id)) {
        await interaction.reply({ content: `リマインダー **\`${id}\`** には参加していません。`, ephemeral: true });
        return;
      }
      saveReminders();
      await interaction.reply(`リマインダー **\`${id}\`** の通知から外れました。`);
    }
    return;
  }

  if (interaction.commandName === 'cancel') {
    const id = interaction.options.getString('id', true);
    const reminder = reminders.get(getReminderKey(interaction.guildId, id));
    if (!reminder || reminder.guildId !== interaction.guildId
      || (reminder.userId !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))) {
      await interaction.reply({ content: 'そのリマインダーは見つからないか、キャンセルできません。', ephemeral: true });
      return;
    }
    clearTimeout(reminder.timer);
    reminders.delete(reminder.key);
    saveReminders();
    await interaction.reply(`リマインダー **\`${id}\`** をキャンセルしました。`);
  }
});

loadReminders();
client.login(token);
