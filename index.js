'use strict';

const {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { DateTime } = require('luxon');

const REQUIRED_ENV = ['TOKEN', 'CLIENT_ID', 'DROP_CHANNEL_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Brak zmiennej środowiskowej: ${key}`);
    process.exit(1);
  }
}

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '';
const DROP_CHANNEL_ID = process.env.DROP_CHANNEL_ID;
const TIME_ZONE = process.env.TIME_ZONE || 'Europe/Warsaw';
const MAX_MESSAGES = Math.max(100, Number(process.env.MAX_MESSAGES || 25000));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const command = new SlashCommandBuilder()
  .setName('drop')
  .setDescription('Sprawdza dropy petów z wybranego okresu i konta');

function typeLabel(type) {
  return {
    huge: 'Huge',
    titanic: 'Titanic',
    gargantuan: 'Gargantuan',
    all: 'Wszystkie',
  }[type] || type;
}

function detectPetType(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('gargantuan')) return 'gargantuan';
  if (value.includes('titanic')) return 'titanic';
  if (value.includes('huge')) return 'huge';
  return null;
}

function extractLabeledValue(text, label) {
  const wanted = label.toLowerCase();
  const line = String(text || '')
    .split(/\r?\n/)
    .find((entry) => entry.toLowerCase().includes(wanted));

  if (!line) return null;

  const codeValue = line.match(/`([^`]+)`/);
  if (codeValue) return codeValue[1].trim();

  const clean = line
    .replace(/\*\*/g, '')
    .replace(/\|\|/g, '')
    .replace(/[>_]/g, '')
    .trim();

  const colon = clean.indexOf(':');
  return colon >= 0 ? clean.slice(colon + 1).trim() : clean;
}

function parseRap(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits ? BigInt(digits) : 0n;
}

function parseDropFromEmbed(embed, message) {
  const parts = [embed.title, embed.description];
  for (const field of embed.fields || []) {
    parts.push(field.name, field.value);
  }

  const fullText = parts.filter(Boolean).join('\n');
  const petType = detectPetType(embed.title) || detectPetType(fullText);
  if (!petType) return null;

  const item = extractLabeledValue(fullText, 'Item');
  const account = extractLabeledValue(fullText, 'In Account');
  const rapRaw = extractLabeledValue(fullText, 'RAP');

  if (!item || !account) return null;

  return {
    messageId: message.id,
    createdAt: message.createdTimestamp,
    type: petType,
    item,
    account,
    rap: parseRap(rapRaw),
    thumbnail: embed.thumbnail?.url || null,
  };
}

function normalizeDate(raw) {
  return String(raw || '').trim().replace(/\//g, '.').replace(/-/g, '.');
}

function parseLocalDateTime(dateRaw, timeRaw) {
  const dateText = normalizeDate(dateRaw);
  const timeText = String(timeRaw || '').trim();

  const dateFormats = ['dd.MM.yyyy', 'd.M.yyyy', 'yyyy.MM.dd'];
  for (const dateFormat of dateFormats) {
    const parsed = DateTime.fromFormat(
      `${dateText} ${timeText}`,
      `${dateFormat} HH:mm`,
      { zone: TIME_ZONE, locale: 'pl' },
    );
    if (parsed.isValid) return parsed;
  }

  return null;
}

function formatBigInt(value) {
  return value.toLocaleString('pl-PL');
}

function formatDateTime(timestamp) {
  return DateTime.fromMillis(timestamp, { zone: TIME_ZONE }).toFormat('dd.MM.yyyy HH:mm');
}

function truncate(value, max = 1024) {
  const text = String(value || '');
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

async function fetchDrops(channel, fromMillis, toMillis) {
  const drops = [];
  let before;
  let scanned = 0;
  let reachedStart = false;

  while (scanned < MAX_MESSAGES && !reachedStart) {
    const remaining = MAX_MESSAGES - scanned;
    const batch = await channel.messages.fetch({
      limit: Math.min(100, remaining),
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    const messages = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    scanned += messages.length;

    for (const message of messages) {
      if (message.createdTimestamp < fromMillis) {
        reachedStart = true;
        continue;
      }

      if (message.createdTimestamp > toMillis) continue;

      for (const embed of message.embeds) {
        const parsed = parseDropFromEmbed(embed, message);
        if (parsed) drops.push(parsed);
      }
    }

    before = messages[messages.length - 1].id;
  }

  return {
    drops,
    scanned,
    hitLimit: scanned >= MAX_MESSAGES && !reachedStart,
  };
}

function buildResultEmbed({ drops, type, account, from, to, scanned, hitLimit }) {
  const totalRap = drops.reduce((sum, drop) => sum + drop.rap, 0n);
  const sorted = [...drops].sort((a, b) => (a.rap === b.rap ? 0 : a.rap > b.rap ? -1 : 1));

  const itemCounts = new Map();
  for (const drop of drops) {
    const key = drop.item;
    const current = itemCounts.get(key) || { count: 0, rap: 0n };
    current.count += 1;
    current.rap += drop.rap;
    itemCounts.set(key, current);
  }

  const itemSummary = [...itemCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([name, info]) => `• **${name}** — ${info.count}x`)
    .join('\n') || 'Brak';

  const bestDrops = sorted
    .slice(0, 10)
    .map((drop, index) =>
      `${index + 1}. **${drop.item}**\n` +
      `   RAP: \`${formatBigInt(drop.rap)}\` • konto: \`${drop.account}\` • ${formatDateTime(drop.createdAt)}`,
    )
    .join('\n') || 'Brak';

  const embed = new EmbedBuilder()
    .setTitle('📊 Podsumowanie dropów')
    .setColor(0xffa500)
    .setDescription(
      `**Rodzaj:** ${typeLabel(type)}\n` +
      `**Konto:** \`${account}\`\n` +
      `**Okres:** ${from.toFormat('dd.MM.yyyy HH:mm')} – ${to.toFormat('dd.MM.yyyy HH:mm')}\n` +
      `**Strefa czasowa:** ${TIME_ZONE}`,
    )
    .addFields(
      { name: '🎁 Liczba dropów', value: `\`${drops.length}\``, inline: true },
      { name: '💎 Łączny RAP', value: `\`${formatBigInt(totalRap)}\``, inline: true },
      { name: '🔎 Wiadomości sprawdzone', value: `\`${scanned}\``, inline: true },
      { name: '🐾 Podział petów', value: truncate(itemSummary) },
      { name: '🏆 Najlepsze dropy', value: truncate(bestDrops) },
    )
    .setFooter({
      text: hitLimit
        ? `Osiągnięto limit ${MAX_MESSAGES} wiadomości — zwiększ MAX_MESSAGES na Railway.`
        : 'Drop Tracker',
    })
    .setTimestamp();

  if (sorted[0]?.thumbnail) embed.setThumbnail(sorted[0].thumbnail);
  return embed;
}

async function registerCommand() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.post(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: command.toJSON() });
    console.log(`Zarejestrowano /drop na serwerze ${GUILD_ID}.`);
  } else {
    await rest.post(Routes.applicationCommands(CLIENT_ID), { body: command.toJSON() });
    console.log('Zarejestrowano globalną komendę /drop.');
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot zalogowany jako ${readyClient.user.tag}`);
  try {
    await registerCommand();
  } catch (error) {
    console.error('Nie udało się zarejestrować komendy /drop:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'drop') {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`drop_type:${interaction.user.id}`)
        .setPlaceholder('Wybierz rodzaj peta')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Huge')
            .setValue('huge')
            .setEmoji('🐱'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Titanic')
            .setValue('titanic')
            .setEmoji('🦣'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Gargantuan')
            .setValue('gargantuan')
            .setEmoji('🌋'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Wszystkie')
            .setValue('all')
            .setEmoji('📦'),
        );

      await interaction.reply({
        content: 'Najpierw wybierz rodzaj peta:',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_type:')) {
      const ownerId = interaction.customId.split(':')[1];
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'To menu należy do innej osoby.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const type = interaction.values[0];
      const today = DateTime.now().setZone(TIME_ZONE).toFormat('dd.MM.yyyy');

      const modal = new ModalBuilder()
        .setCustomId(`drop_modal:${interaction.user.id}:${type}`)
        .setTitle(`Dropy — ${typeLabel(type)}`);

      const accountInput = new TextInputBuilder()
        .setCustomId('account')
        .setLabel('Nick konta lub "wszystkie"')
        .setStyle(TextInputStyle.Short)
        .setValue('wszystkie')
        .setRequired(true)
        .setMaxLength(100);

      const dateFromInput = new TextInputBuilder()
        .setCustomId('date_from')
        .setLabel('Data od (DD.MM.RRRR)')
        .setStyle(TextInputStyle.Short)
        .setValue(today)
        .setRequired(true)
        .setMaxLength(10);

      const dateToInput = new TextInputBuilder()
        .setCustomId('date_to')
        .setLabel('Data do (DD.MM.RRRR)')
        .setStyle(TextInputStyle.Short)
        .setValue(today)
        .setRequired(true)
        .setMaxLength(10);

      const timeFromInput = new TextInputBuilder()
        .setCustomId('time_from')
        .setLabel('Godzina od (GG:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue('00:00')
        .setRequired(true)
        .setMaxLength(5);

      const timeToInput = new TextInputBuilder()
        .setCustomId('time_to')
        .setLabel('Godzina do (GG:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue('23:59')
        .setRequired(true)
        .setMaxLength(5);

      modal.addComponents(
        new ActionRowBuilder().addComponents(accountInput),
        new ActionRowBuilder().addComponents(dateFromInput),
        new ActionRowBuilder().addComponents(dateToInput),
        new ActionRowBuilder().addComponents(timeFromInput),
        new ActionRowBuilder().addComponents(timeToInput),
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('drop_modal:')) {
      const [, ownerId, type] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'Ten formularz należy do innej osoby.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const accountRaw = interaction.fields.getTextInputValue('account').trim();
      const dateFromRaw = interaction.fields.getTextInputValue('date_from').trim();
      const dateToRaw = interaction.fields.getTextInputValue('date_to').trim();
      const timeFromRaw = interaction.fields.getTextInputValue('time_from').trim();
      const timeToRaw = interaction.fields.getTextInputValue('time_to').trim();

      const from = parseLocalDateTime(dateFromRaw, timeFromRaw);
      const to = parseLocalDateTime(dateToRaw, timeToRaw);

      if (!from || !to) {
        await interaction.editReply(
          '❌ Nieprawidłowa data lub godzina. Użyj np. `11.07.2026` oraz `00:30`.',
        );
        return;
      }

      if (to < from) {
        await interaction.editReply('❌ Data/godzina „do” nie może być wcześniejsza niż „od”.');
        return;
      }

      const channel = await client.channels.fetch(DROP_CHANNEL_ID);
      if (!channel || !channel.isTextBased() || !('messages' in channel)) {
        await interaction.editReply('❌ DROP_CHANNEL_ID nie wskazuje zwykłego kanału tekstowego.');
        return;
      }

      const result = await fetchDrops(channel, from.toMillis(), to.toMillis());
      const allAccounts = ['wszystkie', 'all', '*'].includes(accountRaw.toLowerCase());

      const filtered = result.drops.filter((drop) => {
        const typeMatches = type === 'all' || drop.type === type;
        const accountMatches = allAccounts || drop.account.toLowerCase() === accountRaw.toLowerCase();
        return typeMatches && accountMatches;
      });

      const embed = buildResultEmbed({
        drops: filtered,
        type,
        account: allAccounts ? 'wszystkie' : accountRaw,
        from,
        to,
        scanned: result.scanned,
        hitLimit: result.hitLimit,
      });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Błąd obsługi interakcji:', error);

    const message = '❌ Wystąpił błąd. Sprawdź logi Railway i uprawnienia bota.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(TOKEN);
