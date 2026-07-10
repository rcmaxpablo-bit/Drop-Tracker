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

const REQUIRED_ENV = ['TOKEN', 'CLIENT_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Brak zmiennej środowiskowej: ${key}`);
    process.exit(1);
  }
}

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '';

const DROP_CHANNELS = [
  {
    key: 'pawel',
    label: 'Dropy Paweł',
    id: process.env.PAWEL_DROP_CHANNEL_ID || '1515437409653756005',
    emoji: '🟢',
  },
  {
    key: 'ryzen',
    label: 'Dropy Ryzen',
    id: process.env.RYZEN_DROP_CHANNEL_ID || '1524841513606189178',
    emoji: '🔵',
  },
];

function getChannelSelection(channelKey) {
  if (channelKey === 'all') {
    return {
      label: 'Oba kanały',
      ids: DROP_CHANNELS.map((channel) => channel.id),
    };
  }

  const channel = DROP_CHANNELS.find((entry) => entry.key === channelKey);
  if (!channel) return null;

  return {
    label: channel.label,
    ids: [channel.id],
  };
}
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

function normalizeItemName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[`*_~|]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildLatestRapMap(drops, wantedItemKeys) {
  const latestRaps = new Map();

  for (const drop of drops) {
    if (!drop || drop.rap <= 0n) continue;

    const itemKey = normalizeItemName(drop.item);
    if (!wantedItemKeys.has(itemKey)) continue;

    const current = latestRaps.get(itemKey);
    if (!current || drop.createdAt > current.createdAt) {
      latestRaps.set(itemKey, drop);
    }
  }

  return latestRaps;
}

function mergeLatestRapMaps(...maps) {
  const merged = new Map();

  for (const map of maps) {
    for (const [itemKey, candidate] of map) {
      const current = merged.get(itemKey);
      if (!current || candidate.createdAt > current.createdAt) {
        merged.set(itemKey, candidate);
      }
    }
  }

  return merged;
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
    channelId: message.channelId,
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

async function fetchDropsFromChannels(channelIds, fromMillis, toMillis) {
  const results = await Promise.all(channelIds.map(async (channelId) => {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased() || !('messages' in channel)) {
      throw new Error(`Kanał ${channelId} nie jest zwykłym kanałem tekstowym.`);
    }

    const result = await fetchDrops(channel, fromMillis, toMillis);
    return { channelId, ...result };
  }));

  return {
    drops: results.flatMap((result) => result.drops),
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    hitLimit: results.some((result) => result.hitLimit),
    channelsScanned: results.length,
  };
}


async function fetchLatestRaps(channel, wantedItemKeys) {
  const latestRaps = new Map();
  let before;
  let scanned = 0;

  while (scanned < MAX_MESSAGES && latestRaps.size < wantedItemKeys.size) {
    const remaining = MAX_MESSAGES - scanned;
    const batch = await channel.messages.fetch({
      limit: Math.min(100, remaining),
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    const messages = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    scanned += messages.length;

    for (const message of messages) {
      for (const embed of message.embeds) {
        const parsed = parseDropFromEmbed(embed, message);
        if (!parsed || parsed.rap <= 0n) continue;

        const itemKey = normalizeItemName(parsed.item);
        if (!wantedItemKeys.has(itemKey)) continue;

        const current = latestRaps.get(itemKey);
        if (!current || parsed.createdAt > current.createdAt) {
          latestRaps.set(itemKey, parsed);
        }
      }
    }

    before = messages[messages.length - 1].id;
  }

  return {
    latestRaps,
    scanned,
    hitLimit: scanned >= MAX_MESSAGES && latestRaps.size < wantedItemKeys.size,
  };
}

async function fetchLatestRapsFromChannels(channelIds, wantedItemKeys) {
  if (wantedItemKeys.size === 0) {
    return { latestRaps: new Map(), scanned: 0, hitLimit: false };
  }

  const results = await Promise.all(channelIds.map(async (channelId) => {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased() || !('messages' in channel)) {
      throw new Error(`Kanał ${channelId} nie jest zwykłym kanałem tekstowym.`);
    }

    return fetchLatestRaps(channel, wantedItemKeys);
  }));

  const merged = new Map();
  for (const result of results) {
    for (const [itemKey, candidate] of result.latestRaps) {
      const current = merged.get(itemKey);
      if (!current || candidate.createdAt > current.createdAt) {
        merged.set(itemKey, candidate);
      }
    }
  }

  return {
    latestRaps: merged,
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    hitLimit: results.some((result) => result.hitLimit),
  };
}

function applyLatestRaps(drops, latestRaps) {
  return drops.map((drop) => {
    const latest = latestRaps.get(normalizeItemName(drop.item));
    if (!latest) {
      return {
        ...drop,
        originalRap: drop.rap,
        rapSourceCreatedAt: drop.createdAt,
        rapSourceChannelId: drop.channelId,
      };
    }

    return {
      ...drop,
      originalRap: drop.rap,
      rap: latest.rap,
      rapSourceCreatedAt: latest.createdAt,
      rapSourceChannelId: latest.channelId,
    };
  });
}

function buildResultEmbed({ drops, type, account, channelLabel, from, to, scanned, hitLimit, channelsScanned, pricingFound, pricingWanted }) {
  const totalRap = drops.reduce((sum, drop) => sum + drop.rap, 0n);
  const sorted = [...drops].sort((a, b) => (a.rap === b.rap ? 0 : a.rap > b.rap ? -1 : 1));
  const repricedCount = drops.filter((drop) => drop.originalRap !== drop.rap).length;

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
    .map((drop, index) => {
      const priceDate = drop.rapSourceCreatedAt
        ? ` • cena RAP z ${formatDateTime(drop.rapSourceCreatedAt)}`
        : '';

      return `${index + 1}. **${drop.item}**\n` +
        `   RAP: \`${formatBigInt(drop.rap)}\` • konto: \`${drop.account}\` • drop: ${formatDateTime(drop.createdAt)}${priceDate}`;
    })
    .join('\n') || 'Brak';

  const embed = new EmbedBuilder()
    .setTitle('📊 Podsumowanie dropów')
    .setColor(0xffa500)
    .setDescription(
      `**Kanał:** ${channelLabel}\n` +
      `**Rodzaj:** ${typeLabel(type)}\n` +
      `**Konto:** \`${account}\`\n` +
      `**Okres:** ${from.toFormat('dd.MM.yyyy HH:mm')} – ${to.toFormat('dd.MM.yyyy HH:mm')}\n` +
      `**Wycena RAP:** najnowszy zapisany drop tego samego peta\n` +
      `**Strefa czasowa:** ${TIME_ZONE}`,
    )
    .addFields(
      { name: '🎁 Liczba dropów', value: `\`${drops.length}\``, inline: true },
      { name: '💎 Łączny RAP', value: `\`${formatBigInt(totalRap)}\``, inline: true },
      { name: '🔎 Wiadomości sprawdzone', value: `\`${scanned}\``, inline: true },
      { name: '📡 Kanały sprawdzone', value: `\`${channelsScanned}\``, inline: true },
      { name: '💹 Ceny znalezione', value: `\`${pricingFound}/${pricingWanted}\``, inline: true },
      { name: '🔄 Dropy przeliczone', value: `\`${repricedCount}\``, inline: true },
      { name: '🐾 Podział petów', value: truncate(itemSummary) },
      { name: '🏆 Najlepsze dropy', value: truncate(bestDrops) },
    )
    .setFooter({
      text: hitLimit
        ? `Na co najmniej jednym kanale osiągnięto limit ${MAX_MESSAGES} wiadomości — zwiększ MAX_MESSAGES na Railway.`
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
      const channelSelect = new StringSelectMenuBuilder()
        .setCustomId(`drop_channel:${interaction.user.id}`)
        .setPlaceholder('Wybierz kanał z dropami')
        .addOptions(
          ...DROP_CHANNELS.map((channel) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(channel.label)
              .setValue(channel.key)
              .setEmoji(channel.emoji),
          ),
          new StringSelectMenuOptionBuilder()
            .setLabel('Oba kanały')
            .setDescription('Łączy dropy Pawła i Ryzena')
            .setValue('all')
            .setEmoji('📡'),
        );

      await interaction.reply({
        content: 'Najpierw wybierz, z którego kanału bot ma liczyć dropy:',
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_channel:')) {
      const ownerId = interaction.customId.split(':')[1];
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'To menu należy do innej osoby.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channelKey = interaction.values[0];
      const channelSelection = getChannelSelection(channelKey);
      if (!channelSelection) {
        await interaction.update({
          content: '❌ Nie znaleziono wybranego kanału.',
          components: [],
        });
        return;
      }

      const typeSelect = new StringSelectMenuBuilder()
        .setCustomId(`drop_type:${interaction.user.id}:${channelKey}`)
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

      await interaction.update({
        content: `Wybrany kanał: **${channelSelection.label}**\nTeraz wybierz rodzaj peta:`,
        components: [new ActionRowBuilder().addComponents(typeSelect)],
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_type:')) {
      const [, ownerId, channelKey] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'To menu należy do innej osoby.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channelSelection = getChannelSelection(channelKey);
      if (!channelSelection) {
        await interaction.reply({
          content: '❌ Nie znaleziono wybranego kanału.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const type = interaction.values[0];
      const today = DateTime.now().setZone(TIME_ZONE).toFormat('dd.MM.yyyy');

      const modal = new ModalBuilder()
        .setCustomId(`drop_modal:${interaction.user.id}:${channelKey}:${type}`)
        .setTitle(`${channelSelection.label} — ${typeLabel(type)}`);

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
      const [, ownerId, channelKey, type] = interaction.customId.split(':');
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

      const channelSelection = getChannelSelection(channelKey);
      if (!channelSelection) {
        await interaction.editReply('❌ Nie znaleziono wybranego kanału. Użyj ponownie `/drop`.');
        return;
      }

      const result = await fetchDropsFromChannels(
        channelSelection.ids,
        from.toMillis(),
        to.toMillis(),
      );
      const allAccounts = ['wszystkie', 'all', '*'].includes(accountRaw.toLowerCase());

      const filtered = result.drops.filter((drop) => {
        const typeMatches = type === 'all' || drop.type === type;
        const accountMatches = allAccounts || drop.account.toLowerCase() === accountRaw.toLowerCase();
        return typeMatches && accountMatches;
      });

      // Dla każdego peta z wyniku szukamy najnowszego dropu w wybranym kanale
      // (również poza wybranym zakresem dat) i używamy jego RAP do całej wyceny.
      const wantedItemKeys = new Set(filtered.map((drop) => normalizeItemName(drop.item)));

      // Najpierw budujemy ceny z wiadomości już pobranych dla wybranego okresu.
      // Dzięki temu późniejszy drop z tego samego zakresu zawsze nadpisze starszy,
      // nawet jeżeli kanał ma bardzo dużo nowszych wiadomości.
      const latestRapsInSelectedRange = buildLatestRapMap(result.drops, wantedItemKeys);

      // Następnie sprawdzamy cały najnowszy fragment historii kanału, aby znaleźć
      // jeszcze nowszą cenę także poza zakresem dat podanym w formularzu.
      const latestRapResult = await fetchLatestRapsFromChannels(
        channelSelection.ids,
        wantedItemKeys,
      );

      const finalLatestRaps = mergeLatestRapMaps(
        latestRapsInSelectedRange,
        latestRapResult.latestRaps,
      );
      const repricedDrops = applyLatestRaps(filtered, finalLatestRaps);

      const embed = buildResultEmbed({
        drops: repricedDrops,
        type,
        account: allAccounts ? 'wszystkie' : accountRaw,
        channelLabel: channelSelection.label,
        from,
        to,
        scanned: result.scanned + latestRapResult.scanned,
        hitLimit: result.hitLimit || latestRapResult.hitLimit,
        channelsScanned: result.channelsScanned,
        pricingFound: finalLatestRaps.size,
        pricingWanted: wantedItemKeys.size,
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
