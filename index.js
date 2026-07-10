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
const TIME_ZONE = process.env.TIME_ZONE || 'Europe/Warsaw';
const MAX_MESSAGES = Math.max(100, Number(process.env.MAX_MESSAGES || 25000));

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Sprawdza dropy petów z wybranego okresu i konta'),
  new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Pokazuje historię dropów konkretnego peta'),
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

function getChannelLabelById(channelId) {
  return DROP_CHANNELS.find((channel) => channel.id === channelId)?.label || channelId;
}

function buildChannelSelect(customId, placeholder = 'Wybierz kanał z dropami') {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
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
}

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

function normalizeAccount(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

// Hierarchia wariantu:
// Shiny Rainbow > Shiny Golden > Shiny > Normal
function getVariantRank(itemName) {
  const value = normalizeItemName(itemName);
  const isShiny = value.includes('shiny');
  const isRainbow = value.includes('rainbow');
  const isGolden = value.includes('golden');

  if (isShiny && isRainbow) return 4;
  if (isShiny && isGolden) return 3;
  if (isShiny) return 2;
  return 1;
}

// Hierarchia typu:
// Gargantuan > Titanic > Huge
function getTypeRank(typeOrItem) {
  const type = ['gargantuan', 'titanic', 'huge'].includes(typeOrItem)
    ? typeOrItem
    : detectPetType(typeOrItem);

  return {
    gargantuan: 3,
    titanic: 2,
    huge: 1,
  }[type] || 0;
}

function compareByHierarchy(a, b) {
  const variantDifference = getVariantRank(b.item) - getVariantRank(a.item);
  if (variantDifference !== 0) return variantDifference;

  const typeDifference = getTypeRank(b.type || b.item) - getTypeRank(a.type || a.item);
  if (typeDifference !== 0) return typeDifference;

  if (a.rap !== b.rap) return a.rap > b.rap ? -1 : 1;
  return (b.createdAt || 0) - (a.createdAt || 0);
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

function parseOptionalDate(dateRaw, endOfDay = false) {
  const value = String(dateRaw || '').trim();
  if (!value) return null;

  const parsed = parseLocalDateTime(value, endOfDay ? '23:59' : '00:00');
  return parsed;
}

function formatBigInt(value) {
  return BigInt(value || 0).toLocaleString('pl-PL');
}

function formatDateTime(timestamp) {
  return DateTime.fromMillis(timestamp, { zone: TIME_ZONE }).toFormat('dd.MM.yyyy HH:mm');
}

function truncate(value, max = 1024) {
  const text = String(value || '');
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function isAllAccounts(value) {
  return ['wszystkie', 'all', '*', ''].includes(normalizeAccount(value));
}

function accountMatches(dropAccount, requestedAccount) {
  return isAllAccounts(requestedAccount)
    || normalizeAccount(dropAccount) === normalizeAccount(requestedAccount);
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

async function repriceDrops(drops, allFetchedDrops, channelIds) {
  const wantedItemKeys = new Set(drops.map((drop) => normalizeItemName(drop.item)));
  const latestRapsInSelectedRange = buildLatestRapMap(allFetchedDrops, wantedItemKeys);
  const latestRapResult = await fetchLatestRapsFromChannels(channelIds, wantedItemKeys);
  const finalLatestRaps = mergeLatestRapMaps(
    latestRapsInSelectedRange,
    latestRapResult.latestRaps,
  );

  return {
    drops: applyLatestRaps(drops, finalLatestRaps),
    latestRaps: finalLatestRaps,
    scanned: latestRapResult.scanned,
    hitLimit: latestRapResult.hitLimit,
    pricingWanted: wantedItemKeys.size,
    pricingFound: finalLatestRaps.size,
  };
}

function buildResultEmbed({
  drops,
  type,
  account,
  channelLabel,
  from,
  to,
  scanned,
  hitLimit,
  channelsScanned,
  pricingFound,
  pricingWanted,
}) {
  const totalRap = drops.reduce((sum, drop) => sum + drop.rap, 0n);
  const sorted = [...drops].sort(compareByHierarchy);
  const repricedCount = drops.filter((drop) => drop.originalRap !== drop.rap).length;

  const itemCounts = new Map();
  for (const drop of drops) {
    const key = normalizeItemName(drop.item);
    const current = itemCounts.get(key) || {
      item: drop.item,
      type: drop.type,
      count: 0,
      rap: drop.rap,
      createdAt: drop.createdAt,
    };

    current.count += 1;
    if (drop.createdAt > current.createdAt) {
      current.item = drop.item;
      current.type = drop.type;
      current.rap = drop.rap;
      current.createdAt = drop.createdAt;
    }

    itemCounts.set(key, current);
  }

  const itemSummary = [...itemCounts.values()]
    .sort((a, b) => {
      const hierarchy = compareByHierarchy(a, b);
      if (hierarchy !== 0) return hierarchy;
      return b.count - a.count;
    })
    .slice(0, 20)
    .map((info) => `• **${info.item}** — ${info.count}x`)
    .join('\n') || 'Brak';

  const bestDrops = sorted
    .slice(0, 10)
    .map((drop, index) => {
      const priceDate = drop.rapSourceCreatedAt
        ? ` • cena RAP z ${formatDateTime(drop.rapSourceCreatedAt)}`
        : '';

      return `${index + 1}. **${drop.item}**\n`
        + `   RAP: \`${formatBigInt(drop.rap)}\` • konto: \`${drop.account}\` • drop: ${formatDateTime(drop.createdAt)}${priceDate}`;
    })
    .join('\n') || 'Brak';

  const embed = new EmbedBuilder()
    .setTitle('📊 Podsumowanie dropów')
    .setColor(0xffa500)
    .setDescription(
      `**Kanał:** ${channelLabel}\n`
      + `**Rodzaj:** ${typeLabel(type)}\n`
      + `**Konto:** \`${account}\`\n`
      + `**Okres:** ${from.toFormat('dd.MM.yyyy HH:mm')} – ${to.toFormat('dd.MM.yyyy HH:mm')}\n`
      + '**Hierarchia:** Shiny Rainbow > Shiny Golden > Shiny > Normal; Gargantuan > Titanic > Huge\n'
      + '**Wycena RAP:** najnowszy zapisany drop tego samego peta\n'
      + `**Strefa czasowa:** ${TIME_ZONE}`,
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
        ? `Osiągnięto limit ${MAX_MESSAGES} wiadomości na co najmniej jednym kanale. Zwiększ MAX_MESSAGES na Railway.`
        : 'DropVault',
    })
    .setTimestamp();

  if (sorted[0]?.thumbnail) embed.setThumbnail(sorted[0].thumbnail);
  return embed;
}

function buildPetEmbed({
  drops,
  query,
  exactMatch,
  account,
  channelLabel,
  from,
  to,
  scanned,
  hitLimit,
}) {
  const sortedByDate = [...drops].sort((a, b) => b.createdAt - a.createdAt);
  const totalRap = drops.reduce((sum, drop) => sum + drop.rap, 0n);
  const latestDrop = sortedByDate[0];

  const grouped = new Map();
  for (const drop of drops) {
    const key = normalizeItemName(drop.item);
    const current = grouped.get(key) || {
      item: drop.item,
      type: drop.type,
      count: 0,
      currentRap: drop.rap,
      latestDropAt: drop.createdAt,
      latestPriceAt: drop.rapSourceCreatedAt,
      thumbnail: drop.thumbnail,
    };

    current.count += 1;
    if (drop.createdAt > current.latestDropAt) {
      current.item = drop.item;
      current.type = drop.type;
      current.latestDropAt = drop.createdAt;
      current.thumbnail = drop.thumbnail || current.thumbnail;
    }
    if ((drop.rapSourceCreatedAt || 0) >= (current.latestPriceAt || 0)) {
      current.currentRap = drop.rap;
      current.latestPriceAt = drop.rapSourceCreatedAt;
    }

    grouped.set(key, current);
  }

  const matchedPets = [...grouped.values()]
    .sort(compareByHierarchy)
    .slice(0, 15)
    .map((pet) => {
      const priceDate = pet.latestPriceAt ? ` • cena z ${formatDateTime(pet.latestPriceAt)}` : '';
      return `• **${pet.item}** — ${pet.count}x\n  RAP: \`${formatBigInt(pet.currentRap)}\`${priceDate}`;
    })
    .join('\n') || 'Brak';

  const history = sortedByDate
    .slice(0, 20)
    .map((drop, index) => {
      const sourceChannel = getChannelLabelById(drop.channelId);
      return `${index + 1}. **${drop.item}**\n`
        + `   ${formatDateTime(drop.createdAt)} • \`${drop.account}\` • ${sourceChannel}`;
    })
    .join('\n') || 'Brak';

  const dateLabel = from && to
    ? `${from.toFormat('dd.MM.yyyy')} – ${to.toFormat('dd.MM.yyyy')}`
    : 'cała dostępna historia';

  const embed = new EmbedBuilder()
    .setTitle(`🔎 Historia peta: ${query}`)
    .setColor(0x5865f2)
    .setDescription(
      `**Kanał:** ${channelLabel}\n`
      + `**Konto:** \`${account}\`\n`
      + `**Zakres:** ${dateLabel}\n`
      + `**Dopasowanie:** ${exactMatch ? 'dokładna nazwa' : 'część nazwy'}\n`
      + '**Aktualny RAP:** z najnowszego zapisanego dropu tego samego peta',
    )
    .addFields(
      { name: '📦 Liczba dropów', value: `\`${drops.length}\``, inline: true },
      { name: '💎 Suma aktualnego RAP', value: `\`${formatBigInt(totalRap)}\``, inline: true },
      {
        name: '🕒 Ostatni drop',
        value: latestDrop ? formatDateTime(latestDrop.createdAt) : 'Brak',
        inline: true,
      },
      { name: '🐾 Znalezione pety', value: truncate(matchedPets) },
      { name: '📜 Najnowsza historia', value: truncate(history) },
    )
    .setFooter({
      text: hitLimit
        ? `Osiągnięto limit ${MAX_MESSAGES} wiadomości. Starsze dropy mogą nie być widoczne.`
        : `Sprawdzono ${scanned} wiadomości`,
    })
    .setTimestamp();

  const thumbnail = latestDrop?.thumbnail || [...grouped.values()].find((pet) => pet.thumbnail)?.thumbnail;
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const body = commands.map((command) => command.toJSON());

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
    console.log(`Zarejestrowano /drop i /pet na serwerze ${GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log('Zarejestrowano globalne komendy /drop i /pet.');
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot zalogowany jako ${readyClient.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error('Nie udało się zarejestrować komend:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'drop') {
      const channelSelect = buildChannelSelect(`drop_channel:${interaction.user.id}`);

      await interaction.reply({
        content: 'Najpierw wybierz, z którego kanału bot ma liczyć dropy:',
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'pet') {
      const channelSelect = buildChannelSelect(`pet_channel:${interaction.user.id}`);

      await interaction.reply({
        content: 'Wybierz kanał, na którym bot ma wyszukać historię peta:',
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

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pet_channel:')) {
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

      const modal = new ModalBuilder()
        .setCustomId(`pet_modal:${interaction.user.id}:${channelKey}`)
        .setTitle(`Wyszukaj peta — ${channelSelection.label}`);

      const petNameInput = new TextInputBuilder()
        .setCustomId('pet_name')
        .setLabel('Nazwa peta')
        .setPlaceholder('np. Titanic Goalie Octopus')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(150);

      const accountInput = new TextInputBuilder()
        .setCustomId('account')
        .setLabel('Nick konta lub "wszystkie"')
        .setStyle(TextInputStyle.Short)
        .setValue('wszystkie')
        .setRequired(true)
        .setMaxLength(100);

      const dateFromInput = new TextInputBuilder()
        .setCustomId('date_from')
        .setLabel('Data od — opcjonalnie (DD.MM.RRRR)')
        .setPlaceholder('Puste = cała historia')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10);

      const dateToInput = new TextInputBuilder()
        .setCustomId('date_to')
        .setLabel('Data do — opcjonalnie (DD.MM.RRRR)')
        .setPlaceholder('Puste = dzisiaj')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10);

      modal.addComponents(
        new ActionRowBuilder().addComponents(petNameInput),
        new ActionRowBuilder().addComponents(accountInput),
        new ActionRowBuilder().addComponents(dateFromInput),
        new ActionRowBuilder().addComponents(dateToInput),
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

      const filtered = result.drops.filter((drop) => {
        const typeMatches = type === 'all' || drop.type === type;
        return typeMatches && accountMatches(drop.account, accountRaw);
      });

      const repriced = await repriceDrops(filtered, result.drops, channelSelection.ids);
      const embed = buildResultEmbed({
        drops: repriced.drops,
        type,
        account: isAllAccounts(accountRaw) ? 'wszystkie' : accountRaw,
        channelLabel: channelSelection.label,
        from,
        to,
        scanned: result.scanned + repriced.scanned,
        hitLimit: result.hitLimit || repriced.hitLimit,
        channelsScanned: result.channelsScanned,
        pricingFound: repriced.pricingFound,
        pricingWanted: repriced.pricingWanted,
      });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('pet_modal:')) {
      const [, ownerId, channelKey] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'Ten formularz należy do innej osoby.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const queryRaw = interaction.fields.getTextInputValue('pet_name').trim();
      const accountRaw = interaction.fields.getTextInputValue('account').trim();
      const dateFromRaw = interaction.fields.getTextInputValue('date_from').trim();
      const dateToRaw = interaction.fields.getTextInputValue('date_to').trim();

      const query = normalizeItemName(queryRaw);
      if (!query) {
        await interaction.editReply('❌ Wpisz nazwę peta.');
        return;
      }

      const from = parseOptionalDate(dateFromRaw, false);
      const to = parseOptionalDate(dateToRaw, true);

      if (dateFromRaw && !from) {
        await interaction.editReply('❌ Nieprawidłowa data „od”. Użyj formatu `DD.MM.RRRR`.');
        return;
      }

      if (dateToRaw && !to) {
        await interaction.editReply('❌ Nieprawidłowa data „do”. Użyj formatu `DD.MM.RRRR`.');
        return;
      }

      const effectiveFrom = from || DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day');
      const effectiveTo = to || DateTime.now().setZone(TIME_ZONE).endOf('day');

      if (effectiveTo < effectiveFrom) {
        await interaction.editReply('❌ Data „do” nie może być wcześniejsza niż data „od”.');
        return;
      }

      const channelSelection = getChannelSelection(channelKey);
      if (!channelSelection) {
        await interaction.editReply('❌ Nie znaleziono wybranego kanału. Użyj ponownie `/pet`.');
        return;
      }

      const result = await fetchDropsFromChannels(
        channelSelection.ids,
        effectiveFrom.toMillis(),
        effectiveTo.toMillis(),
      );

      const accountFiltered = result.drops.filter((drop) => accountMatches(drop.account, accountRaw));
      const exactMatches = accountFiltered.filter((drop) => normalizeItemName(drop.item) === query);
      const partialMatches = accountFiltered.filter((drop) => normalizeItemName(drop.item).includes(query));
      const matched = exactMatches.length > 0 ? exactMatches : partialMatches;
      const exactMatch = exactMatches.length > 0;

      if (matched.length === 0) {
        await interaction.editReply(
          `❌ Nie znaleziono peta pasującego do \`${queryRaw}\` na **${channelSelection.label}**.`,
        );
        return;
      }

      const repriced = await repriceDrops(matched, result.drops, channelSelection.ids);
      const embed = buildPetEmbed({
        drops: repriced.drops,
        query: queryRaw,
        exactMatch,
        account: isAllAccounts(accountRaw) ? 'wszystkie' : accountRaw,
        channelLabel: channelSelection.label,
        from: dateFromRaw || dateToRaw ? effectiveFrom : null,
        to: dateFromRaw || dateToRaw ? effectiveTo : null,
        scanned: result.scanned + repriced.scanned,
        hitLimit: result.hitLimit || repriced.hitLimit,
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
