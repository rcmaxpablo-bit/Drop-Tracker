'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

// ============================================================
// KONFIGURACJA
// ============================================================

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
const SESSION_TTL_MS = 15 * 60 * 1000;
const HISTORY_PAGE_SIZE = 10;
const ACCOUNT_PAGE_SIZE = 24; // + opcja „wszystkie” = maks. 25 opcji Discorda

const STATE_DIR = process.env.STATE_DIR || path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'dropvault-state.json');

const ALERT_RAP_CENTER = BigInt(process.env.ALERT_RAP_CENTER || '4000000000');
const ALERT_RAP_TOLERANCE = BigInt(process.env.ALERT_RAP_TOLERANCE || '100000000');
const ALERT_MIN_RAP = BigInt(process.env.ALERT_MIN_RAP || '0');

// Publiczne API PS99RAP. Bot korzysta z niego zamiast przepisywać cenę
// z ostatniej wiadomości na Discordzie. Gdy API nie ma ceny lub chwilowo
// nie odpowiada, bot automatycznie wraca do najnowszego RAP z kanału.
const PS99RAP_ENABLED = !['0', 'false', 'off', 'no'].includes(
  String(process.env.PS99RAP_ENABLED || 'true').toLowerCase(),
);
const PS99RAP_BASE_URL = String(process.env.PS99RAP_BASE_URL || 'https://ps99rap.com')
  .replace(/\/+$/, '');
const PS99RAP_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.PS99RAP_CACHE_TTL_MS || 120_000),
);
const PS99RAP_TIMEOUT_MS = Math.max(
  3_000,
  Number(process.env.PS99RAP_TIMEOUT_MS || 15_000),
);
const PS99RAP_BULK_CHUNK_SIZE = Math.max(
  1,
  Math.min(75, Number(process.env.PS99RAP_BULK_CHUNK_SIZE || 40)),
);

const DROP_CHANNELS = [
  {
    key: 'pawel',
    label: 'Dropy Paweł',
    id: process.env.PAWEL_DROP_CHANNEL_ID || '1515437409653756005',
    reportChannelId: process.env.PAWEL_REPORT_CHANNEL_ID
      || process.env.PAWEL_DROP_CHANNEL_ID
      || '1515437409653756005',
    alertUserId: process.env.PAWEL_ALERT_USER_ID || '1265797244074852576',
    emoji: '🟢',
    color: 0x57f287,
  },
  {
    key: 'ryzen',
    label: 'Dropy Ryzen',
    id: process.env.RYZEN_DROP_CHANNEL_ID || '1524841513606189178',
    reportChannelId: process.env.RYZEN_REPORT_CHANNEL_ID
      || process.env.RYZEN_DROP_CHANNEL_ID
      || '1524841513606189178',
    alertUserId: process.env.RYZEN_ALERT_USER_ID || '1330652001075335300',
    emoji: '🔵',
    color: 0x5865f2,
  },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ============================================================
// KOMENDY
// ============================================================

function addChannelChoices(option) {
  return option
    .addChoices(
      { name: '🟢 Dropy Paweł', value: 'pawel' },
      { name: '🔵 Dropy Ryzen', value: 'ryzen' },
      { name: '📡 Oba kanały', value: 'all' },
    );
}

function addVariantChoices(option, includeAll = true) {
  const choices = [
    { name: 'Normal', value: 'normal' },
    { name: 'Golden', value: 'golden' },
    { name: 'Rainbow', value: 'rainbow' },
    { name: 'Shiny', value: 'shiny' },
    { name: 'Shiny Golden', value: 'shiny_golden' },
    { name: 'Shiny Rainbow', value: 'shiny_rainbow' },
  ];

  if (includeAll) choices.unshift({ name: 'Wszystkie warianty', value: 'all' });
  return option.addChoices(...choices);
}

const commands = [
  new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Sprawdza dropy z wybranego kanału, konta, typu i okresu'),

  new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Pokazuje historię dropów konkretnego peta')
    .addStringOption((option) => option
      .setName('nazwa')
      .setDescription('Zacznij wpisywać nazwę peta')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((option) => addChannelChoices(option
      .setName('kanal')
      .setDescription('Kanał, na którym szukać')
      .setRequired(true)))
    .addStringOption((option) => option
      .setName('konto')
      .setDescription('Konto Roblox; zostaw puste, aby wybrać wszystkie')
      .setRequired(false)
      .setAutocomplete(true))
    .addStringOption((option) => addVariantChoices(option
      .setName('wariant')
      .setDescription('Opcjonalny filtr wariantu')
      .setRequired(false)))
    .addStringOption((option) => option
      .setName('data_od')
      .setDescription('Opcjonalnie DD.MM.RRRR')
      .setRequired(false))
    .addStringOption((option) => option
      .setName('data_do')
      .setDescription('Opcjonalnie DD.MM.RRRR')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('petvalue')
    .setDescription('Pokazuje historię RAP peta z PS99RAP')
    .addStringOption((option) => option
      .setName('nazwa')
      .setDescription('Zacznij wpisywać nazwę peta')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((option) => addChannelChoices(option
      .setName('kanal')
      .setDescription('Kanał, na którym szukać')
      .setRequired(true)))
    .addStringOption((option) => option
      .setName('konto')
      .setDescription('Konto Roblox; zostaw puste, aby wybrać wszystkie')
      .setRequired(false)
      .setAutocomplete(true))
    .addStringOption((option) => option
      .setName('data_od')
      .setDescription('Opcjonalnie DD.MM.RRRR')
      .setRequired(false))
    .addStringOption((option) => option
      .setName('data_do')
      .setDescription('Opcjonalnie DD.MM.RRRR')
      .setRequired(false)),
];

// ============================================================
// STAN, CACHE I SESJE
// ============================================================

const catalogByChannel = new Map();
const paginationSessions = new Map();
const dropFormSessions = new Map();
const ps99RapPriceCache = new Map();
let alertsReady = false;
let schedulerStarted = false;

let state = {
  dailyReports: {},
  records: {},
  processedMessageIds: [],
};

const processedMessageIds = new Set();

function createSessionId() {
  return crypto.randomBytes(6).toString('hex');
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of paginationSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) paginationSessions.delete(id);
  }
  for (const [id, session] of dropFormSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) dropFormSessions.delete(id);
  }
}

setInterval(cleanupSessions, 60_000).unref();

function ensureStateDirectory() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  ensureStateDirectory();

  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = {
        dailyReports: parsed.dailyReports || {},
        records: parsed.records || {},
        processedMessageIds: Array.isArray(parsed.processedMessageIds)
          ? parsed.processedMessageIds.slice(-5000)
          : [],
      };
    }
  } catch (error) {
    console.error('Nie udało się odczytać pliku stanu:', error);
  }

  for (const id of state.processedMessageIds) processedMessageIds.add(id);
}

function saveState() {
  ensureStateDirectory();
  state.processedMessageIds = [...processedMessageIds].slice(-5000);

  const temporaryFile = `${STATE_FILE}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2));
    fs.renameSync(temporaryFile, STATE_FILE);
  } catch (error) {
    console.error('Nie udało się zapisać pliku stanu:', error);
  }
}

function getCatalog(channelId) {
  if (!catalogByChannel.has(channelId)) {
    catalogByChannel.set(channelId, {
      items: new Map(),
      accounts: new Map(),
    });
  }
  return catalogByChannel.get(channelId);
}

function updateCatalog(drop) {
  const catalog = getCatalog(drop.channelId);
  const itemKey = normalizeItemName(drop.item);
  const accountKey = normalizeAccount(drop.account);

  if (itemKey && !catalog.items.has(itemKey)) catalog.items.set(itemKey, drop.item);
  if (accountKey && !catalog.accounts.has(accountKey)) catalog.accounts.set(accountKey, drop.account);
}

function getCombinedCatalog(channelKey) {
  const selection = getChannelSelection(channelKey);
  const items = new Map();
  const accounts = new Map();

  if (!selection) return { items, accounts };

  for (const channelId of selection.ids) {
    const catalog = getCatalog(channelId);
    for (const [key, value] of catalog.items) if (!items.has(key)) items.set(key, value);
    for (const [key, value] of catalog.accounts) if (!accounts.has(key)) accounts.set(key, value);
  }

  return { items, accounts };
}

// ============================================================
// PODSTAWOWE FUNKCJE
// ============================================================

function getChannelConfigByKey(channelKey) {
  return DROP_CHANNELS.find((entry) => entry.key === channelKey) || null;
}

function getChannelConfigById(channelId) {
  return DROP_CHANNELS.find((entry) => entry.id === channelId) || null;
}

function getChannelSelection(channelKey) {
  if (channelKey === 'all') {
    return {
      label: 'Oba kanały',
      ids: DROP_CHANNELS.map((channel) => channel.id),
    };
  }

  const channel = getChannelConfigByKey(channelKey);
  if (!channel) return null;

  return {
    label: channel.label,
    ids: [channel.id],
  };
}

function getChannelLabelById(channelId) {
  return getChannelConfigById(channelId)?.label || channelId;
}

function buildChannelSelect(customId, placeholder = 'Wybierz kanał z dropami') {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(
      ...DROP_CHANNELS.map((channel) => new StringSelectMenuOptionBuilder()
        .setLabel(channel.label)
        .setValue(channel.key)
        .setEmoji(channel.emoji)),
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

function variantLabel(variant) {
  return {
    all: 'Wszystkie warianty',
    normal: 'Normal',
    golden: 'Golden',
    rainbow: 'Rainbow',
    shiny: 'Shiny',
    shiny_golden: 'Shiny Golden',
    shiny_rainbow: 'Shiny Rainbow',
  }[variant] || variant;
}

function detectPetType(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('gargantuan')) return 'gargantuan';
  if (value.includes('titanic')) return 'titanic';
  if (value.includes('huge')) return 'huge';
  return null;
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

function toPs99RapItemId(itemName) {
  return String(itemName || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[`*_~|]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function normalizePs99RapItemId(itemId) {
  return normalizeItemName(String(itemId || '').replace(/_/g, ' '));
}

function buildPs99RapItemUrl(itemId) {
  return `${PS99RAP_BASE_URL}/items/${encodeURIComponent(itemId)}`;
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PS99RAP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DropVault-Discord-Bot/2.1 (+PS99RAP credit)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapApiData(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function parsePs99RapTimestamp(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1_000_000_000_000 ? Math.round(raw * 1000) : Math.round(raw);
  }

  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFreshPs99RapCache(itemKey) {
  const cached = ps99RapPriceCache.get(itemKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > PS99RAP_CACHE_TTL_MS) {
    ps99RapPriceCache.delete(itemKey);
    return null;
  }
  return cached;
}

async function fetchPs99RapPrices(itemNames) {
  const unique = new Map();
  for (const itemName of itemNames) {
    const itemKey = normalizeItemName(itemName);
    if (!itemKey || unique.has(itemKey)) continue;
    unique.set(itemKey, {
      itemKey,
      itemName,
      itemId: toPs99RapItemId(itemName),
    });
  }

  const prices = new Map();
  const pending = [];
  const errors = [];

  for (const item of unique.values()) {
    const cached = getFreshPs99RapCache(item.itemKey);
    if (cached) {
      if (cached.rap > 0n) prices.set(item.itemKey, cached);
    } else {
      pending.push(item);
    }
  }

  if (!PS99RAP_ENABLED || pending.length === 0) {
    return {
      prices,
      found: prices.size,
      requested: unique.size,
      missing: unique.size - prices.size,
      errors,
    };
  }

  for (let index = 0; index < pending.length; index += PS99RAP_BULK_CHUNK_SIZE) {
    const chunk = pending.slice(index, index + PS99RAP_BULK_CHUNK_SIZE);
    const url = new URL('/api/items/bulk', `${PS99RAP_BASE_URL}/`);
    url.searchParams.set('ids', chunk.map((entry) => entry.itemId).join(','));

    try {
      const payload = unwrapApiData(await fetchJsonWithTimeout(url));
      const responseObject = payload && typeof payload === 'object' ? payload : {};
      const byNormalizedId = new Map(
        Object.entries(responseObject).map(([id, value]) => [normalizePs99RapItemId(id), { id, value }]),
      );

      for (const item of chunk) {
        const direct = responseObject[item.itemId];
        const fallback = byNormalizedId.get(normalizePs99RapItemId(item.itemId));
        const record = direct || fallback?.value || null;
        const returnedId = direct ? item.itemId : fallback?.id || item.itemId;
        const rap = parseRap(record?.rap);
        const exists = record?.exists == null ? null : Number(record.exists);
        const cacheEntry = {
          item: item.itemName,
          itemId: returnedId,
          rap,
          exists: Number.isFinite(exists) ? exists : null,
          source: 'ps99rap',
          sourceUrl: buildPs99RapItemUrl(returnedId),
          fetchedAt: Date.now(),
          cachedAt: Date.now(),
        };

        ps99RapPriceCache.set(item.itemKey, cacheEntry);
        if (rap > 0n) prices.set(item.itemKey, cacheEntry);
      }
    } catch (error) {
      errors.push(error);
      console.error(`PS99RAP bulk API error (${chunk.length} items):`, error.message || error);
    }
  }

  return {
    prices,
    found: prices.size,
    requested: unique.size,
    missing: unique.size - prices.size,
    errors,
  };
}

async function fetchPs99RapHistory(itemName) {
  if (!PS99RAP_ENABLED) return { history: [], itemId: null, sourceUrl: null, error: null };

  const itemId = toPs99RapItemId(itemName);
  const url = new URL(`/api/item/${encodeURIComponent(itemId)}/rap_history`, `${PS99RAP_BASE_URL}/`);

  try {
    const payload = unwrapApiData(await fetchJsonWithTimeout(url));
    const rows = Array.isArray(payload) ? payload : [];
    const history = rows
      .map((row) => {
        if (!Array.isArray(row) || row.length < 2) return null;
        const createdAt = parsePs99RapTimestamp(row[0]);
        const rap = parseRap(row[1]);
        if (!createdAt || rap <= 0n) return null;
        return {
          createdAt,
          rap,
          account: 'PS99RAP',
          channelId: null,
          source: 'ps99rap',
          sourceUrl: buildPs99RapItemUrl(itemId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);

    return {
      history,
      itemId,
      sourceUrl: buildPs99RapItemUrl(itemId),
      error: null,
    };
  } catch (error) {
    console.error(`PS99RAP history API error (${itemName}):`, error.message || error);
    return {
      history: [],
      itemId,
      sourceUrl: buildPs99RapItemUrl(itemId),
      error,
    };
  }
}

function formatRapSource(drop) {
  if (drop?.rapSource === 'ps99rap') {
    return drop.rapSourceUrl
      ? ` • cena: [PS99RAP](${drop.rapSourceUrl})`
      : ' • cena: PS99RAP';
  }

  if (drop?.rapSourceCreatedAt) {
    return ` • cena RAP z ${formatDateTime(drop.rapSourceCreatedAt)}`;
  }

  return '';
}

function detectVariant(itemName) {
  const value = normalizeItemName(itemName);
  const shiny = value.includes('shiny');
  const rainbow = value.includes('rainbow');
  const golden = value.includes('golden');

  if (shiny && rainbow) return 'shiny_rainbow';
  if (shiny && golden) return 'shiny_golden';
  if (shiny) return 'shiny';
  if (rainbow) return 'rainbow';
  if (golden) return 'golden';
  return 'normal';
}

function variantMatches(itemName, wantedVariant) {
  return wantedVariant === 'all' || detectVariant(itemName) === wantedVariant;
}

function getVariantRank(itemName) {
  return {
    shiny_rainbow: 6,
    shiny_golden: 5,
    shiny: 4,
    rainbow: 3,
    golden: 2,
    normal: 1,
  }[detectVariant(itemName)] || 0;
}

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
  // Zawsze: Gargantuan > Titanic > Huge.
  const typeDifference = getTypeRank(b.type || b.item) - getTypeRank(a.type || a.item);
  if (typeDifference !== 0) return typeDifference;

  // W obrębie tego samego typu:
  // Shiny Rainbow > Shiny Golden > Shiny > Rainbow > Golden > Normal.
  const variantDifference = getVariantRank(b.item) - getVariantRank(a.item);
  if (variantDifference !== 0) return variantDifference;

  if ((a.rap || 0n) !== (b.rap || 0n)) return a.rap > b.rap ? -1 : 1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

function compareByRap(a, b) {
  if (a.rap !== b.rap) return a.rap > b.rap ? -1 : 1;
  return (b.createdAt || 0) - (a.createdAt || 0);
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
  for (const field of embed.fields || []) parts.push(field.name, field.value);

  const fullText = parts.filter(Boolean).join('\n');
  const petType = detectPetType(embed.title) || detectPetType(fullText);
  if (!petType) return null;

  const item = extractLabeledValue(fullText, 'Item');
  const account = extractLabeledValue(fullText, 'In Account');
  const rapRaw = extractLabeledValue(fullText, 'RAP');
  if (!item || !account) return null;

  return {
    messageId: message.id,
    guildId: message.guildId,
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
  return parseLocalDateTime(value, endOfDay ? '23:59' : '00:00');
}

function formatBigInt(value) {
  return BigInt(value || 0).toLocaleString('pl-PL');
}

function formatCompactBigInt(value) {
  const number = Number(BigInt(value || 0));
  if (number >= 1_000_000_000_000) return `${(number / 1_000_000_000_000).toFixed(2)}T`;
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(2)}K`;
  return String(number);
}

function formatSignedBigInt(value) {
  const amount = BigInt(value || 0);
  const sign = amount > 0n ? '+' : amount < 0n ? '-' : '';
  return `${sign}${formatBigInt(amount < 0n ? -amount : amount)}`;
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

function splitTextIntoChunks(lines, maxLength = 3900) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : ['Brak'];
}

// ============================================================
// POBIERANIE DROPÓW I NAJNOWSZE CENY
// ============================================================

async function getTextChannel(channelId) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !('messages' in channel)) {
    throw new Error(`Kanał ${channelId} nie jest zwykłym kanałem tekstowym.`);
  }
  return channel;
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
        if (parsed) {
          drops.push(parsed);
          updateCatalog(parsed);
        }
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
    const channel = await getTextChannel(channelId);
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
    if (!current || drop.createdAt > current.createdAt) latestRaps.set(itemKey, drop);
  }

  return latestRaps;
}

function mergeLatestRapMaps(...maps) {
  const merged = new Map();

  for (const map of maps) {
    for (const [itemKey, candidate] of map) {
      const current = merged.get(itemKey);
      if (!current || candidate.createdAt > current.createdAt) merged.set(itemKey, candidate);
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
        updateCatalog(parsed);

        const itemKey = normalizeItemName(parsed.item);
        if (!wantedItemKeys.has(itemKey)) continue;

        const current = latestRaps.get(itemKey);
        if (!current || parsed.createdAt > current.createdAt) latestRaps.set(itemKey, parsed);
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
    const channel = await getTextChannel(channelId);
    return fetchLatestRaps(channel, wantedItemKeys);
  }));

  const merged = new Map();
  for (const result of results) {
    for (const [itemKey, candidate] of result.latestRaps) {
      const current = merged.get(itemKey);
      if (!current || candidate.createdAt > current.createdAt) merged.set(itemKey, candidate);
    }
  }

  return {
    latestRaps: merged,
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    hitLimit: results.some((result) => result.hitLimit),
  };
}

function applyLatestRaps(drops, priceMap) {
  return drops.map((drop) => {
    const latest = priceMap.get(normalizeItemName(drop.item));

    if (!latest) {
      return {
        ...drop,
        originalRap: drop.rap,
        rapSource: 'discord',
        rapSourceCreatedAt: drop.createdAt,
        rapSourceChannelId: drop.channelId,
        rapSourceFetchedAt: null,
        rapSourceUrl: null,
      };
    }

    const source = latest.source || 'discord';
    return {
      ...drop,
      originalRap: drop.rap,
      rap: latest.rap,
      exists: latest.exists ?? null,
      rapSource: source,
      rapSourceCreatedAt: source === 'ps99rap' ? null : latest.createdAt,
      rapSourceChannelId: source === 'ps99rap' ? null : latest.channelId,
      rapSourceFetchedAt: source === 'ps99rap' ? latest.fetchedAt : null,
      rapSourceUrl: latest.sourceUrl || null,
    };
  });
}

async function repriceDrops(drops, allFetchedDrops, channelIds) {
  const itemNamesByKey = new Map();
  for (const drop of drops) {
    const key = normalizeItemName(drop.item);
    if (key && !itemNamesByKey.has(key)) itemNamesByKey.set(key, drop.item);
  }

  const wantedItemKeys = new Set(itemNamesByKey.keys());
  const ps99RapResult = await fetchPs99RapPrices([...itemNamesByKey.values()]);
  const finalPrices = new Map(ps99RapResult.prices);
  const missingItemKeys = new Set(
    [...wantedItemKeys].filter((itemKey) => !finalPrices.has(itemKey)),
  );

  let fallbackScanned = 0;
  let fallbackHitLimit = false;
  let fallbackFound = 0;

  if (missingItemKeys.size > 0) {
    const latestRapsInSelectedRange = buildLatestRapMap(allFetchedDrops, missingItemKeys);
    const latestRapResult = await fetchLatestRapsFromChannels(channelIds, missingItemKeys);
    const fallbackPrices = mergeLatestRapMaps(
      latestRapsInSelectedRange,
      latestRapResult.latestRaps,
    );

    for (const [itemKey, candidate] of fallbackPrices) {
      if (finalPrices.has(itemKey)) continue;
      finalPrices.set(itemKey, {
        ...candidate,
        source: 'discord',
      });
    }

    fallbackScanned = latestRapResult.scanned;
    fallbackHitLimit = latestRapResult.hitLimit;
    fallbackFound = fallbackPrices.size;
  }

  return {
    drops: applyLatestRaps(drops, finalPrices),
    latestRaps: finalPrices,
    scanned: fallbackScanned,
    hitLimit: fallbackHitLimit,
    pricingWanted: wantedItemKeys.size,
    pricingFound: finalPrices.size,
    pricingFromPs99Rap: ps99RapResult.prices.size,
    pricingFallback: fallbackFound,
    ps99RapErrors: ps99RapResult.errors.length,
  };
}

// ============================================================
// PAGINACJA
// ============================================================

function buildPaginationRow(sessionId, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`page:${sessionId}:prev`)
      .setLabel('Poprzednia')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`page:${sessionId}:noop`)
      .setLabel(`${page + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`page:${sessionId}:next`)
      .setLabel('Następna')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1),
  );
}

function buildDropPageEmbed(session, page) {
  const {
    drops,
    itemGroups,
    type,
    variant,
    account,
    channelLabel,
    from,
    to,
    scanned,
    hitLimit,
    channelsScanned,
    pricingFound,
    pricingWanted,
    pricingFromPs99Rap,
    pricingFallback,
    ps99RapErrors,
  } = session;

  const bestDropsSorted = [...drops].sort(compareByRap);
  const totalRap = drops.reduce((sum, drop) => sum + drop.rap, 0n);
  const repricedCount = drops.filter((drop) => drop.originalRap !== drop.rap).length;
  const start = page * HISTORY_PAGE_SIZE;

  const itemSummary = itemGroups
    .slice(start, start + HISTORY_PAGE_SIZE)
    .map((info) => `• **${info.item}** — ${info.count}x • RAP szt.: \`${formatBigInt(info.rap)}\``)
    .join('\n') || 'Brak na tej stronie';

  const bestDrops = bestDropsSorted
    .slice(start, start + HISTORY_PAGE_SIZE)
    .map((drop, index) => {
      const priceSource = formatRapSource(drop);

      return `${start + index + 1}. **${drop.item}**\n`
        + `   RAP: \`${formatBigInt(drop.rap)}\` • konto: \`${drop.account}\` • drop: ${formatDateTime(drop.createdAt)}${priceSource}`;
    })
    .join('\n') || 'Brak na tej stronie';

  const embed = new EmbedBuilder()
    .setTitle('📊 Podsumowanie dropów')
    .setColor(0xffa500)
    .setDescription(
      `**Kanał:** ${channelLabel}\n`
      + `**Rodzaj:** ${typeLabel(type)}\n`
      + `**Wariant:** ${variantLabel(variant)}\n`
      + `**Konto:** \`${account}\`\n`
      + `**Okres:** ${from.toFormat('dd.MM.yyyy HH:mm')} – ${to.toFormat('dd.MM.yyyy HH:mm')}\n`
      + '**Podział petów:** Gargantuan > Titanic > Huge, następnie wariant\n'
      + '**Najlepsze dropy:** wyłącznie według RAP, od największego\n'
      + '**Wycena:** aktualny RAP z PS99RAP; gdy brak ceny — najnowszy RAP z kanału',
    )
    .addFields(
      { name: '🎁 Liczba dropów', value: `\`${drops.length}\``, inline: true },
      { name: '💎 Łączny RAP', value: `\`${formatBigInt(totalRap)}\``, inline: true },
      { name: '🔎 Wiadomości', value: `\`${scanned}\``, inline: true },
      { name: '📡 Kanały', value: `\`${channelsScanned}\``, inline: true },
      { name: '💹 Ceny znalezione', value: `\`${pricingFound}/${pricingWanted}\``, inline: true },
      { name: '🌐 PS99RAP', value: `\`${pricingFromPs99Rap}/${pricingWanted}\``, inline: true },
      { name: '↩️ Fallback z kanału', value: `\`${pricingFallback}\``, inline: true },
      { name: '🔄 Przeliczone', value: `\`${repricedCount}\``, inline: true },
      { name: '🐾 Podział petów', value: truncate(itemSummary) },
      { name: '🏆 Najlepsze dropy', value: truncate(bestDrops) },
    )
    .setFooter({
      text: hitLimit
        ? `Strona ${page + 1}. Osiągnięto limit ${MAX_MESSAGES} wiadomości. • RAP: ps99rap.com`
        : `Strona ${page + 1} • RAP: ps99rap.com${ps99RapErrors ? ' • API fallback aktywny' : ''}`,
    })
    .setTimestamp();

  const thumbnail = bestDropsSorted[0]?.thumbnail;
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

function buildPetPageEmbed(session, page) {
  const start = page * HISTORY_PAGE_SIZE;
  const pageDrops = session.sortedDrops.slice(start, start + HISTORY_PAGE_SIZE);

  const history = pageDrops.map((drop, index) => {
    const sourceChannel = getChannelLabelById(drop.channelId);
    const priceSource = formatRapSource(drop);

    return `${start + index + 1}. **${drop.item}**\n`
      + `   ${formatDateTime(drop.createdAt)} • \`${drop.account}\` • ${sourceChannel}\n`
      + `   RAP: \`${formatBigInt(drop.rap)}\`${priceSource}`;
  }).join('\n') || 'Brak';

  const embed = new EmbedBuilder()
    .setTitle(`🔎 Historia peta: ${session.query}`)
    .setColor(0x5865f2)
    .setDescription(
      `**Kanał:** ${session.channelLabel}\n`
      + `**Konto:** \`${session.account}\`\n`
      + `**Wariant:** ${variantLabel(session.variant)}\n`
      + `**Zakres:** ${session.dateLabel}\n`
      + `**Dopasowanie:** ${session.exactMatch ? 'dokładna nazwa' : 'część nazwy'}\n`
      + '**Aktualny RAP:** z PS99RAP; gdy brak ceny — z najnowszego dropu',
    )
    .addFields(
      { name: '📦 Liczba dropów', value: `\`${session.drops.length}\``, inline: true },
      { name: '💎 Suma aktualnego RAP', value: `\`${formatBigInt(session.totalRap)}\``, inline: true },
      {
        name: '🕒 Ostatni drop',
        value: session.latestDrop ? formatDateTime(session.latestDrop.createdAt) : 'Brak',
        inline: true,
      },
      { name: '🐾 Znalezione pety', value: truncate(session.matchedPetsText) },
      { name: '📜 Historia', value: truncate(history) },
    )
    .setFooter({
      text: session.hitLimit
        ? `Strona ${page + 1}. Osiągnięto limit ${MAX_MESSAGES} wiadomości. • RAP: ps99rap.com`
        : `Strona ${page + 1} • sprawdzono ${session.scanned} wiadomości • RAP: ps99rap.com`,
    })
    .setTimestamp();

  const thumbnail = session.latestDrop?.thumbnail;
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

function buildPetValuePageEmbed(session, page) {
  const start = page * HISTORY_PAGE_SIZE;
  const pageEntries = session.priceHistory.slice(start, start + HISTORY_PAGE_SIZE);

  const history = pageEntries.map((drop, index) => {
    const previous = session.priceHistory[start + index - 1];
    const delta = previous ? drop.rap - previous.rap : 0n;
    const deltaText = previous ? ` • zmiana: \`${formatSignedBigInt(delta)}\`` : '';
    const sourceText = drop.source === 'ps99rap'
      ? `[PS99RAP](${drop.sourceUrl || session.sourceUrl})`
      : `konto: \`${drop.account}\` • ${getChannelLabelById(drop.channelId)}`;

    return `${start + index + 1}. **${formatDateTime(drop.createdAt)}**\n`
      + `   RAP: \`${formatBigInt(drop.rap)}\`${deltaText}\n`
      + `   źródło: ${sourceText}`;
  }).join('\n') || 'Brak';

  const percentText = session.oldestRap > 0n
    ? `${((Number(session.change) / Number(session.oldestRap)) * 100).toFixed(2)}%`
    : 'brak danych';

  const embed = new EmbedBuilder()
    .setTitle(`💹 Zmiana RAP: ${session.displayName}`)
    .setColor(session.change >= 0n ? 0x57f287 : 0xed4245)
    .setDescription(
      `**Źródło historii:** ${session.historySource}\n`
      + `**Kanał dropów:** ${session.channelLabel}\n`
      + `**Konto:** \`${session.account}\`\n`
      + `**Zakres:** ${session.dateLabel}\n`
      + `**Pierwszy RAP:** \`${formatBigInt(session.oldestRap)}\`\n`
      + `**Najnowszy RAP:** \`${formatBigInt(session.latestRap)}\`\n`
      + `**Zmiana:** \`${formatSignedBigInt(session.change)}\` (${percentText})`,
    )
    .addFields(
      { name: '📉 Najniższy RAP', value: `\`${formatBigInt(session.minRap)}\``, inline: true },
      { name: '📈 Najwyższy RAP', value: `\`${formatBigInt(session.maxRap)}\``, inline: true },
      { name: '🧾 Zapisów ceny', value: `\`${session.priceHistory.length}\``, inline: true },
      { name: '📜 Historia cen', value: truncate(history) },
    )
    .setFooter({
      text: session.historySource === 'PS99RAP'
        ? 'Historia RAP: ps99rap.com'
        : `Fallback z wiadomości • sprawdzono ${session.scanned} wiadomości`,
    })
    .setTimestamp();

  if (session.sourceUrl) embed.setURL(session.sourceUrl);
  if (session.thumbnail) embed.setThumbnail(session.thumbnail);
  return embed;
}

function renderPaginationSession(session, page) {
  const safePage = Math.max(0, Math.min(page, session.pageCount - 1));
  let embed;

  if (session.kind === 'drop') embed = buildDropPageEmbed(session, safePage);
  else if (session.kind === 'pet') embed = buildPetPageEmbed(session, safePage);
  else embed = buildPetValuePageEmbed(session, safePage);

  return {
    page: safePage,
    embeds: [embed],
    components: session.pageCount > 1
      ? [buildPaginationRow(session.id, safePage, session.pageCount)]
      : [],
  };
}

// ============================================================
// /DROP — WYBÓR KONTA Z LISTY
// ============================================================

function buildDropAccountComponents(session) {
  const pageCount = Math.max(1, Math.ceil(session.accounts.length / ACCOUNT_PAGE_SIZE));
  session.accountPage = Math.max(0, Math.min(session.accountPage || 0, pageCount - 1));

  const start = session.accountPage * ACCOUNT_PAGE_SIZE;
  const accounts = session.accounts.slice(start, start + ACCOUNT_PAGE_SIZE);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`drop_account:${session.id}`)
    .setPlaceholder('Wybierz konto Roblox')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Wszystkie konta')
        .setValue('__all__')
        .setEmoji('👥'),
      ...accounts.map((account) => new StringSelectMenuOptionBuilder()
        .setLabel(account.slice(0, 100))
        .setValue(account.slice(0, 100))
        .setEmoji('👤')),
    );

  const components = [new ActionRowBuilder().addComponents(menu)];

  if (pageCount > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`drop_accounts_page:${session.id}:prev`)
        .setLabel('Poprzednie konta')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(session.accountPage <= 0),
      new ButtonBuilder()
        .setCustomId(`drop_accounts_page:${session.id}:noop`)
        .setLabel(`${session.accountPage + 1}/${pageCount}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`drop_accounts_page:${session.id}:next`)
        .setLabel('Następne konta')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(session.accountPage >= pageCount - 1),
    ));
  }

  return components;
}

function buildDropDateModal(session) {
  const today = DateTime.now().setZone(TIME_ZONE).toFormat('dd.MM.yyyy');
  const modal = new ModalBuilder()
    .setCustomId(`drop_dates:${session.id}`)
    .setTitle(`${session.channelLabel} — ${typeLabel(session.type)}`);

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
    new ActionRowBuilder().addComponents(dateFromInput),
    new ActionRowBuilder().addComponents(dateToInput),
    new ActionRowBuilder().addComponents(timeFromInput),
    new ActionRowBuilder().addComponents(timeToInput),
  );

  return modal;
}

// ============================================================
// RAPORT DZIENNY 23:59
// ============================================================

function groupDropsForReport(drops) {
  const byAccount = new Map();
  const byItem = new Map();

  for (const drop of drops) {
    const accountKey = normalizeAccount(drop.account);
    const account = byAccount.get(accountKey) || {
      account: drop.account,
      count: 0,
      totalRap: 0n,
      bestDrop: null,
    };
    account.count += 1;
    account.totalRap += drop.rap;
    if (!account.bestDrop || drop.rap > account.bestDrop.rap) account.bestDrop = drop;
    byAccount.set(accountKey, account);

    const itemKey = normalizeItemName(drop.item);
    const item = byItem.get(itemKey) || {
      item: drop.item,
      type: drop.type,
      count: 0,
      unitRap: drop.rap,
      totalRap: 0n,
    };
    item.count += 1;
    item.unitRap = drop.rap;
    item.totalRap += drop.rap;
    byItem.set(itemKey, item);
  }

  return {
    accounts: [...byAccount.values()].sort((a, b) => {
      if (a.totalRap !== b.totalRap) return a.totalRap > b.totalRap ? -1 : 1;
      return b.count - a.count;
    }),
    items: [...byItem.values()].sort(compareByHierarchy),
  };
}

function buildDailyReportEmbeds(channelConfig, reportDate, drops, metadata) {
  const totalRap = drops.reduce((sum, drop) => sum + drop.rap, 0n);
  const bestDrop = [...drops].sort(compareByRap)[0] || null;
  const typeCounts = {
    huge: drops.filter((drop) => drop.type === 'huge').length,
    titanic: drops.filter((drop) => drop.type === 'titanic').length,
    gargantuan: drops.filter((drop) => drop.type === 'gargantuan').length,
  };

  const grouped = groupDropsForReport(drops);
  const bestAccount = grouped.accounts[0] || null;

  const summary = new EmbedBuilder()
    .setTitle(`${channelConfig.emoji} Raport dzienny — ${channelConfig.label}`)
    .setColor(channelConfig.color)
    .setDescription(
      `**Data:** ${reportDate.toFormat('dd.MM.yyyy')}\n`
      + '**Wycena:** aktualny RAP z PS99RAP; gdy brak ceny — fallback z kanału\n'
      + `**Strefa czasowa:** ${TIME_ZONE}`,
    )
    .addFields(
      { name: '🎁 Liczba dropów', value: `\`${drops.length}\``, inline: true },
      { name: '💎 Łączny RAP', value: `\`${formatBigInt(totalRap)}\``, inline: true },
      {
        name: '🏆 Najlepszy drop',
        value: bestDrop
          ? `**${bestDrop.item}**\n\`${formatBigInt(bestDrop.rap)}\` • \`${bestDrop.account}\``
          : 'Brak dropów',
        inline: false,
      },
      {
        name: '👑 Najlepsze konto',
        value: bestAccount
          ? `\`${bestAccount.account}\` — ${bestAccount.count} dropów • \`${formatBigInt(bestAccount.totalRap)}\` RAP`
          : 'Brak dropów',
        inline: false,
      },
      {
        name: '🐾 Podział typów',
        value: `Gargantuan: \`${typeCounts.gargantuan}\`\nTitanic: \`${typeCounts.titanic}\`\nHuge: \`${typeCounts.huge}\``,
        inline: true,
      },
      {
        name: '🔎 Sprawdzone wiadomości',
        value: `\`${metadata.scanned}\``,
        inline: true,
      },
      {
        name: '🌐 Ceny PS99RAP',
        value: `\`${metadata.pricingFromPs99Rap || 0}/${metadata.pricingWanted || 0}\``,
        inline: true,
      },
      {
        name: '↩️ Fallback z kanału',
        value: `\`${metadata.pricingFallback || 0}\``,
        inline: true,
      },
    )
    .setFooter({
      text: metadata.hitLimit
        ? `Osiągnięto limit ${MAX_MESSAGES} wiadomości. • RAP: ps99rap.com`
        : 'Automatyczny raport 23:59 • RAP: ps99rap.com',
    })
    .setTimestamp();

  if (bestDrop?.thumbnail) summary.setThumbnail(bestDrop.thumbnail);

  const accountLines = grouped.accounts.map((account, index) => (
    `${index + 1}. \`${account.account}\` — **${account.count}x** • RAP łącznie: \`${formatBigInt(account.totalRap)}\``
      + (account.bestDrop ? ` • najlepszy: ${formatCompactBigInt(account.bestDrop.rap)}` : '')
  ));

  const itemLines = grouped.items.map((item) => (
    `• **${item.item}** — ${item.count}x • RAP szt.: \`${formatBigInt(item.unitRap)}\` • razem: \`${formatBigInt(item.totalRap)}\``
  ));

  const embeds = [summary];

  splitTextIntoChunks(accountLines).forEach((chunk, index, chunks) => {
    embeds.push(new EmbedBuilder()
      .setTitle(`👥 RAP oddzielnie według kont${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`)
      .setColor(channelConfig.color)
      .setDescription(chunk));
  });

  splitTextIntoChunks(itemLines).forEach((chunk, index, chunks) => {
    embeds.push(new EmbedBuilder()
      .setTitle(`🐾 Pety i RAP oddzielny${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`)
      .setColor(channelConfig.color)
      .setDescription(chunk));
  });

  return embeds;
}

async function sendEmbedsInBatches(channel, embeds, content = undefined) {
  for (let index = 0; index < embeds.length; index += 10) {
    const batch = embeds.slice(index, index + 10);
    await channel.send({
      ...(index === 0 && content ? { content } : {}),
      embeds: batch,
      allowedMentions: { parse: [] },
    });
  }
}

async function sendDailyReport(channelConfig, reportDate) {
  const from = reportDate.startOf('day');
  const to = reportDate.endOf('day');

  const result = await fetchDropsFromChannels([channelConfig.id], from.toMillis(), to.toMillis());
  const repriced = await repriceDrops(result.drops, result.drops, [channelConfig.id]);
  const targetChannel = await getTextChannel(channelConfig.reportChannelId);
  const embeds = buildDailyReportEmbeds(channelConfig, reportDate, repriced.drops, {
    scanned: result.scanned + repriced.scanned,
    hitLimit: result.hitLimit || repriced.hitLimit,
    pricingFromPs99Rap: repriced.pricingFromPs99Rap,
    pricingWanted: repriced.pricingWanted,
    pricingFallback: repriced.pricingFallback,
  });

  await sendEmbedsInBatches(targetChannel, embeds);
  state.dailyReports[channelConfig.key] = reportDate.toISODate();
  saveState();
  console.log(`Wysłano raport dzienny: ${channelConfig.label} — ${reportDate.toISODate()}`);
}

async function dailyReportTick() {
  const now = DateTime.now().setZone(TIME_ZONE);
  if (now.hour !== 23 || now.minute !== 59) return;

  for (const channelConfig of DROP_CHANNELS) {
    if (state.dailyReports[channelConfig.key] === now.toISODate()) continue;

    try {
      await sendDailyReport(channelConfig, now);
    } catch (error) {
      console.error(`Błąd raportu dziennego ${channelConfig.label}:`, error);
    }
  }
}

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(() => {
    dailyReportTick().catch((error) => console.error('Błąd schedulera raportów:', error));
  }, 30_000);
  dailyReportTick().catch(() => {});
}

// ============================================================
// ALERTY I REKORDY
// ============================================================

function defaultRecordState() {
  return {
    overall: null,
    byType: {
      huge: null,
      titanic: null,
      gargantuan: null,
    },
  };
}

function serializeRecord(drop) {
  return {
    rap: drop.rap.toString(),
    item: drop.item,
    account: drop.account,
    createdAt: drop.createdAt,
    messageId: drop.messageId,
  };
}

function getRecordRap(record) {
  return record?.rap ? BigInt(record.rap) : 0n;
}

function updateRecords(channelKey, drop, announce = true) {
  if (!state.records[channelKey]) state.records[channelKey] = defaultRecordState();
  const records = state.records[channelKey];
  const reasons = [];

  if (!records.overall || drop.rap > getRecordRap(records.overall)) {
    if (announce && records.overall) reasons.push('Nowy rekord RAP na kanale');
    records.overall = serializeRecord(drop);
  }

  const previousType = records.byType?.[drop.type] || null;
  if (!records.byType) records.byType = defaultRecordState().byType;
  if (!previousType || drop.rap > getRecordRap(previousType)) {
    if (announce && previousType) reasons.push(`Nowy rekord dla typu ${typeLabel(drop.type)}`);
    records.byType[drop.type] = serializeRecord(drop);
  }

  return reasons;
}

function getSpecialAlertReasons(drop) {
  const reasons = [];
  if (drop.type === 'titanic') reasons.push('Titanic');
  if (drop.type === 'gargantuan') reasons.push('Gargantuan');
  if (detectVariant(drop.item) === 'shiny_rainbow') reasons.push('Shiny Rainbow');

  const lower = ALERT_RAP_CENTER - ALERT_RAP_TOLERANCE;
  const upper = ALERT_RAP_CENTER + ALERT_RAP_TOLERANCE;
  if (drop.rap >= lower && drop.rap <= upper) {
    reasons.push(`RAP w przedziale ${formatCompactBigInt(lower)}–${formatCompactBigInt(upper)}`);
  }

  if (ALERT_MIN_RAP > 0n && drop.rap >= ALERT_MIN_RAP) {
    reasons.push(`RAP co najmniej ${formatCompactBigInt(ALERT_MIN_RAP)}`);
  }

  return reasons;
}

async function sendDropAlert(channelConfig, drop, reasons, recordReasons) {
  const channel = await getTextChannel(channelConfig.id);
  const allReasons = [...new Set([...reasons, ...recordReasons])];
  const isRecord = recordReasons.length > 0;
  const messageUrl = drop.guildId
    ? `https://discord.com/channels/${drop.guildId}/${drop.channelId}/${drop.messageId}`
    : null;

  const embed = new EmbedBuilder()
    .setTitle(isRecord ? '🏆 NOWY REKORD DROPU!' : '🚨 SPECJALNY DROP!')
    .setColor(isRecord ? 0xfee75c : channelConfig.color)
    .setDescription(
      `**${drop.item}**\n`
      + `RAP: \`${formatBigInt(drop.rap)}\`\n`
      + `Konto: \`${drop.account}\`\n`
      + `Kanał: ${channelConfig.emoji} **${channelConfig.label}**\n`
      + `Data: ${formatDateTime(drop.createdAt)}
`
      + `Źródło ceny: ${drop.rapSource === 'ps99rap' && drop.rapSourceUrl
        ? `[PS99RAP](${drop.rapSourceUrl})`
        : 'wiadomość z kanału'}`,
    )
    .addFields({ name: 'Powód alertu', value: allReasons.map((reason) => `• ${reason}`).join('\n') })
    .setFooter({ text: 'RAP: ps99rap.com' })
    .setTimestamp();

  if (drop.thumbnail) embed.setThumbnail(drop.thumbnail);
  if (messageUrl) embed.setURL(messageUrl);

  await channel.send({
    content: `<@${channelConfig.alertUserId}>`,
    embeds: [embed],
    allowedMentions: { users: [channelConfig.alertUserId] },
  });
}

async function processNewDrop(drop) {
  const channelConfig = getChannelConfigById(drop.channelId);
  if (!channelConfig) return;

  updateCatalog(drop);

  const ps99RapResult = await fetchPs99RapPrices([drop.item]);
  const ps99RapPrice = ps99RapResult.prices.get(normalizeItemName(drop.item));
  const pricedDrop = ps99RapPrice
    ? applyLatestRaps([drop], new Map([[normalizeItemName(drop.item), ps99RapPrice]]))[0]
    : {
      ...drop,
      originalRap: drop.rap,
      rapSource: 'discord',
      rapSourceCreatedAt: drop.createdAt,
      rapSourceChannelId: drop.channelId,
      rapSourceUrl: null,
    };

  const recordReasons = updateRecords(channelConfig.key, pricedDrop, alertsReady);
  const specialReasons = getSpecialAlertReasons(pricedDrop);
  saveState();

  if (!alertsReady) return;
  if (specialReasons.length === 0 && recordReasons.length === 0) return;

  await sendDropAlert(channelConfig, pricedDrop, specialReasons, recordReasons);
}

// ============================================================
// STARTOWE SKANOWANIE CACHE I REKORDÓW
// ============================================================

async function warmCatalogAndRecords() {
  const from = DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day').toMillis();
  const to = DateTime.now().setZone(TIME_ZONE).endOf('day').toMillis();

  for (const channelConfig of DROP_CHANNELS) {
    try {
      const result = await fetchDropsFromChannels([channelConfig.id], from, to);
      const repriced = await repriceDrops(result.drops, result.drops, [channelConfig.id]);
      if (!state.records[channelConfig.key]) state.records[channelConfig.key] = defaultRecordState();
      const chronological = [...repriced.drops].sort((a, b) => a.createdAt - b.createdAt);
      for (const drop of chronological) updateRecords(channelConfig.key, drop, false);

      console.log(
        `Cache ${channelConfig.label}: ${result.drops.length} dropów, ${result.scanned} wiadomości, `
        + `${repriced.pricingFromPs99Rap}/${repriced.pricingWanted} cen z PS99RAP.`,
      );
    } catch (error) {
      console.error(`Nie udało się zbudować cache ${channelConfig.label}:`, error);
    }
  }

  saveState();
}

// ============================================================
// AUTOCOMPLETE
// ============================================================

function autocompleteChoices(values, query) {
  const normalizedQuery = normalizeItemName(query);
  return values
    .filter((value) => !normalizedQuery || normalizeItemName(value).includes(normalizedQuery))
    .sort((a, b) => {
      const aNorm = normalizeItemName(a);
      const bNorm = normalizeItemName(b);
      const aStarts = aNorm.startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = bNorm.startsWith(normalizedQuery) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.localeCompare(b, 'pl');
    })
    .slice(0, 25)
    .map((value) => ({
      name: value.slice(0, 100),
      value: value.slice(0, 100),
    }));
}

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const channelKey = interaction.options.getString('kanal') || 'all';
  const catalog = getCombinedCatalog(channelKey);

  if (focused.name === 'nazwa') {
    await interaction.respond(autocompleteChoices([...catalog.items.values()], focused.value));
    return;
  }

  if (focused.name === 'konto') {
    const choices = autocompleteChoices([...catalog.accounts.values()], focused.value);
    await interaction.respond([
      { name: 'Wszystkie konta', value: 'wszystkie' },
      ...choices.slice(0, 24),
    ]);
  }
}

// ============================================================
// OBSŁUGA KOMEND
// ============================================================

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const body = commands.map((command) => command.toJSON());

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
    console.log(`Zarejestrowano /drop, /pet i /petvalue na serwerze ${GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log('Zarejestrowano globalne komendy /drop, /pet i /petvalue.');
  }
}

async function executePetCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const queryRaw = interaction.options.getString('nazwa', true).trim();
  const channelKey = interaction.options.getString('kanal', true);
  const accountRaw = interaction.options.getString('konto')?.trim() || 'wszystkie';
  const variant = interaction.options.getString('wariant') || 'all';
  const dateFromRaw = interaction.options.getString('data_od')?.trim() || '';
  const dateToRaw = interaction.options.getString('data_do')?.trim() || '';
  const query = normalizeItemName(queryRaw);

  const from = parseOptionalDate(dateFromRaw, false);
  const to = parseOptionalDate(dateToRaw, true);

  if (dateFromRaw && !from) {
    await interaction.editReply('❌ Nieprawidłowa data „od”. Użyj `DD.MM.RRRR`.');
    return;
  }
  if (dateToRaw && !to) {
    await interaction.editReply('❌ Nieprawidłowa data „do”. Użyj `DD.MM.RRRR`.');
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
    await interaction.editReply('❌ Nie znaleziono wybranego kanału.');
    return;
  }

  const result = await fetchDropsFromChannels(
    channelSelection.ids,
    effectiveFrom.toMillis(),
    effectiveTo.toMillis(),
  );

  const baseFiltered = result.drops.filter((drop) => (
    accountMatches(drop.account, accountRaw)
    && variantMatches(drop.item, variant)
  ));
  const exactMatches = baseFiltered.filter((drop) => normalizeItemName(drop.item) === query);
  const partialMatches = baseFiltered.filter((drop) => normalizeItemName(drop.item).includes(query));
  const matched = exactMatches.length > 0 ? exactMatches : partialMatches;

  if (matched.length === 0) {
    await interaction.editReply(`❌ Nie znaleziono peta pasującego do \`${queryRaw}\`.`);
    return;
  }

  const repriced = await repriceDrops(matched, result.drops, channelSelection.ids);
  const sortedDrops = [...repriced.drops].sort((a, b) => b.createdAt - a.createdAt);
  const grouped = new Map();

  for (const drop of repriced.drops) {
    const key = normalizeItemName(drop.item);
    const current = grouped.get(key) || {
      item: drop.item,
      count: 0,
      currentRap: drop.rap,
      rapSource: drop.rapSource,
      rapSourceCreatedAt: drop.rapSourceCreatedAt,
      rapSourceUrl: drop.rapSourceUrl,
    };
    current.count += 1;
    current.currentRap = drop.rap;
    current.rapSource = drop.rapSource;
    current.rapSourceCreatedAt = drop.rapSourceCreatedAt;
    current.rapSourceUrl = drop.rapSourceUrl;
    grouped.set(key, current);
  }

  const matchedPetsText = [...grouped.values()]
    .sort((a, b) => getVariantRank(b.item) - getVariantRank(a.item))
    .map((pet) => {
      const sourceText = pet.rapSource === 'ps99rap'
        ? (pet.rapSourceUrl ? `[PS99RAP](${pet.rapSourceUrl})` : 'PS99RAP')
        : `cena z ${formatDateTime(pet.rapSourceCreatedAt)}`;
      return `• **${pet.item}** — ${pet.count}x\n  RAP: \`${formatBigInt(pet.currentRap)}\` • ${sourceText}`;
    })
    .join('\n');

  const sessionId = createSessionId();
  const pageCount = Math.max(1, Math.ceil(sortedDrops.length / HISTORY_PAGE_SIZE));
  const session = {
    id: sessionId,
    kind: 'pet',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount,
    drops: repriced.drops,
    sortedDrops,
    query: queryRaw,
    exactMatch: exactMatches.length > 0,
    account: isAllAccounts(accountRaw) ? 'wszystkie' : accountRaw,
    variant,
    channelLabel: channelSelection.label,
    dateLabel: dateFromRaw || dateToRaw
      ? `${effectiveFrom.toFormat('dd.MM.yyyy')} – ${effectiveTo.toFormat('dd.MM.yyyy')}`
      : 'cała dostępna historia',
    totalRap: repriced.drops.reduce((sum, drop) => sum + drop.rap, 0n),
    latestDrop: sortedDrops[0],
    matchedPetsText,
    scanned: result.scanned + repriced.scanned,
    hitLimit: result.hitLimit || repriced.hitLimit,
  };

  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

async function executePetValueCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const queryRaw = interaction.options.getString('nazwa', true).trim();
  const channelKey = interaction.options.getString('kanal', true);
  const accountRaw = interaction.options.getString('konto')?.trim() || 'wszystkie';
  const dateFromRaw = interaction.options.getString('data_od')?.trim() || '';
  const dateToRaw = interaction.options.getString('data_do')?.trim() || '';
  const query = normalizeItemName(queryRaw);

  const from = parseOptionalDate(dateFromRaw, false);
  const to = parseOptionalDate(dateToRaw, true);
  if (dateFromRaw && !from) {
    await interaction.editReply('❌ Nieprawidłowa data „od”. Użyj `DD.MM.RRRR`.');
    return;
  }
  if (dateToRaw && !to) {
    await interaction.editReply('❌ Nieprawidłowa data „do”. Użyj `DD.MM.RRRR`.');
    return;
  }

  const effectiveFrom = from || DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day');
  const effectiveTo = to || DateTime.now().setZone(TIME_ZONE).endOf('day');
  if (effectiveTo < effectiveFrom) {
    await interaction.editReply('❌ Data „do” nie może być wcześniejsza niż data „od”.');
    return;
  }

  const selection = getChannelSelection(channelKey);
  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono wybranego kanału.');
    return;
  }

  const result = await fetchDropsFromChannels(
    selection.ids,
    effectiveFrom.toMillis(),
    effectiveTo.toMillis(),
  );
  const accountFiltered = result.drops.filter((drop) => accountMatches(drop.account, accountRaw));
  const exact = accountFiltered.filter((drop) => normalizeItemName(drop.item) === query);
  const partial = accountFiltered.filter((drop) => normalizeItemName(drop.item).includes(query));

  const partialNames = new Map();
  for (const drop of partial) partialNames.set(normalizeItemName(drop.item), drop.item);

  if (exact.length === 0 && partialNames.size > 1) {
    const examples = [...partialNames.values()].slice(0, 8).map((name) => `• ${name}`).join('\n');
    await interaction.editReply(
      `❌ Ta część nazwy pasuje do kilku petów. Wybierz pełną nazwę z autouzupełniania:\n${examples}`,
    );
    return;
  }

  const matched = exact.length > 0
    ? exact
    : partialNames.size === 1
      ? partial.filter((drop) => normalizeItemName(drop.item) === [...partialNames.keys()][0])
      : [];
  const displayName = exact[0]?.item || [...partialNames.values()][0] || queryRaw;

  const ps99RapHistory = await fetchPs99RapHistory(displayName);
  let rawHistory = ps99RapHistory.history.filter((point) => (
    point.createdAt >= effectiveFrom.toMillis()
    && point.createdAt <= effectiveTo.toMillis()
  ));
  let historySource = 'PS99RAP';
  let sourceUrl = ps99RapHistory.sourceUrl;

  if (rawHistory.length === 0 && ps99RapHistory.history.length > 0) {
    await interaction.editReply(
      `❌ PS99RAP nie ma punktów cenowych dla **${displayName}** w wybranym zakresie dat.`,
    );
    return;
  }

  if (rawHistory.length === 0) {
    if (matched.length === 0) {
      await interaction.editReply(
        `❌ Nie znaleziono historii peta \`${queryRaw}\` ani w PS99RAP, ani na wybranym kanale.`,
      );
      return;
    }

    rawHistory = [...matched]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((drop) => ({ ...drop, source: 'discord', sourceUrl: null }));
    historySource = 'wiadomości Discord — fallback';
    sourceUrl = null;
  }

  const priceHistory = [];
  for (const point of rawHistory) {
    const previous = priceHistory[priceHistory.length - 1];
    if (!previous || previous.rap !== point.rap) priceHistory.push(point);
  }

  if (priceHistory.length === 0) {
    await interaction.editReply(`❌ Brak poprawnych danych RAP dla **${displayName}**.`);
    return;
  }

  const oldestRap = priceHistory[0].rap;
  const latestRap = priceHistory[priceHistory.length - 1].rap;
  const allRaps = priceHistory.map((drop) => drop.rap);
  const minRap = allRaps.reduce((min, value) => (value < min ? value : min), allRaps[0]);
  const maxRap = allRaps.reduce((max, value) => (value > max ? value : max), allRaps[0]);

  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    kind: 'petvalue',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount: Math.max(1, Math.ceil(priceHistory.length / HISTORY_PAGE_SIZE)),
    priceHistory,
    displayName,
    account: isAllAccounts(accountRaw) ? 'wszystkie' : accountRaw,
    channelLabel: selection.label,
    dateLabel: dateFromRaw || dateToRaw
      ? `${effectiveFrom.toFormat('dd.MM.yyyy')} – ${effectiveTo.toFormat('dd.MM.yyyy')}`
      : 'cała historia dostępna w PS99RAP',
    oldestRap,
    latestRap,
    change: latestRap - oldestRap,
    minRap,
    maxRap,
    scanned: result.scanned,
    thumbnail: matched.find((drop) => drop.thumbnail)?.thumbnail || null,
    historySource,
    sourceUrl,
  };

  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

// ============================================================
// EVENTY DISCORDA
// ============================================================

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot zalogowany jako ${readyClient.user.tag}`);
  loadState();

  try {
    await registerCommands();
  } catch (error) {
    console.error('Nie udało się zarejestrować komend:', error);
  }

  startScheduler();
  await warmCatalogAndRecords();
  alertsReady = true;
  console.log('DropVault jest gotowy: PS99RAP, alerty, rekordy, raport 23:59 i autocomplete aktywne.');
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!getChannelConfigById(message.channelId)) return;
    if (processedMessageIds.has(message.id)) return;

    processedMessageIds.add(message.id);
    if (processedMessageIds.size > 5000) {
      const first = processedMessageIds.values().next().value;
      processedMessageIds.delete(first);
    }

    for (const embed of message.embeds) {
      const drop = parseDropFromEmbed(embed, message);
      if (drop) await processNewDrop(drop);
    }

    saveState();
  } catch (error) {
    console.error('Błąd obsługi nowego dropu:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'drop') {
      const channelSelect = buildChannelSelect(`drop_channel:${interaction.user.id}`);
      await interaction.reply({
        content: 'Wybierz osobny kanał, z którego bot ma policzyć dropy:',
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'pet') {
      await executePetCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'petvalue') {
      await executePetValueCommand(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_channel:')) {
      const ownerId = interaction.customId.split(':')[1];
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'To menu należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      const channelKey = interaction.values[0];
      const selection = getChannelSelection(channelKey);
      if (!selection) {
        await interaction.update({ content: '❌ Nie znaleziono kanału.', components: [] });
        return;
      }

      const typeSelect = new StringSelectMenuBuilder()
        .setCustomId(`drop_type:${ownerId}:${channelKey}`)
        .setPlaceholder('Wybierz rodzaj peta')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Huge').setValue('huge').setEmoji('🐱'),
          new StringSelectMenuOptionBuilder().setLabel('Titanic').setValue('titanic').setEmoji('🦣'),
          new StringSelectMenuOptionBuilder().setLabel('Gargantuan').setValue('gargantuan').setEmoji('🌋'),
          new StringSelectMenuOptionBuilder().setLabel('Wszystkie').setValue('all').setEmoji('📦'),
        );

      await interaction.update({
        content: `Kanał: **${selection.label}**\nWybierz typ peta:`,
        components: [new ActionRowBuilder().addComponents(typeSelect)],
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_type:')) {
      const [, ownerId, channelKey] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'To menu należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      const type = interaction.values[0];
      const variantSelect = new StringSelectMenuBuilder()
        .setCustomId(`drop_variant:${ownerId}:${channelKey}:${type}`)
        .setPlaceholder('Wybierz wariant')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Wszystkie warianty').setValue('all').setEmoji('📦'),
          new StringSelectMenuOptionBuilder().setLabel('Normal').setValue('normal').setEmoji('⚪'),
          new StringSelectMenuOptionBuilder().setLabel('Golden').setValue('golden').setEmoji('🟡'),
          new StringSelectMenuOptionBuilder().setLabel('Rainbow').setValue('rainbow').setEmoji('🌈'),
          new StringSelectMenuOptionBuilder().setLabel('Shiny').setValue('shiny').setEmoji('✨'),
          new StringSelectMenuOptionBuilder().setLabel('Shiny Golden').setValue('shiny_golden').setEmoji('🌟'),
          new StringSelectMenuOptionBuilder().setLabel('Shiny Rainbow').setValue('shiny_rainbow').setEmoji('💎'),
        );

      await interaction.update({
        content: `Typ: **${typeLabel(type)}**\nWybierz wariant:`,
        components: [new ActionRowBuilder().addComponents(variantSelect)],
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_variant:')) {
      const [, ownerId, channelKey, type] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'To menu należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      const variant = interaction.values[0];
      const selection = getChannelSelection(channelKey);
      let catalog = getCombinedCatalog(channelKey);

      if (catalog.accounts.size === 0 && selection) {
        await interaction.deferUpdate();
        const fallbackFrom = DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day');
        const fallbackTo = DateTime.now().setZone(TIME_ZONE).endOf('day');
        await fetchDropsFromChannels(selection.ids, fallbackFrom.toMillis(), fallbackTo.toMillis());
        catalog = getCombinedCatalog(channelKey);
      }

      const accounts = [...catalog.accounts.values()].sort((a, b) => a.localeCompare(b, 'pl'));

      const sessionId = createSessionId();
      const session = {
        id: sessionId,
        ownerId,
        createdAt: Date.now(),
        channelKey,
        channelLabel: selection?.label || channelKey,
        type,
        variant,
        accounts,
        accountPage: 0,
        account: 'wszystkie',
      };
      dropFormSessions.set(sessionId, session);

      const accountPayload = {
        content: `Kanał: **${session.channelLabel}**\nTyp: **${typeLabel(type)}**\nWariant: **${variantLabel(variant)}**\nWybierz konto z listy:`,
        components: buildDropAccountComponents(session),
      };

      if (interaction.deferred) await interaction.editReply(accountPayload);
      else await interaction.update(accountPayload);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('drop_accounts_page:')) {
      const [, sessionId, action] = interaction.customId.split(':');
      const session = dropFormSessions.get(sessionId);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
        await interaction.reply({ content: '❌ To menu wygasło. Użyj ponownie `/drop`.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: 'To menu należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === 'prev') session.accountPage -= 1;
      if (action === 'next') session.accountPage += 1;
      await interaction.update({ components: buildDropAccountComponents(session) });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('drop_account:')) {
      const sessionId = interaction.customId.split(':')[1];
      const session = dropFormSessions.get(sessionId);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
        await interaction.reply({ content: '❌ To menu wygasło. Użyj ponownie `/drop`.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: 'To menu należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      session.account = interaction.values[0] === '__all__' ? 'wszystkie' : interaction.values[0];
      await interaction.showModal(buildDropDateModal(session));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('drop_dates:')) {
      const sessionId = interaction.customId.split(':')[1];
      const session = dropFormSessions.get(sessionId);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
        await interaction.reply({ content: '❌ Formularz wygasł. Użyj ponownie `/drop`.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: 'Ten formularz należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const dateFromRaw = interaction.fields.getTextInputValue('date_from').trim();
      const dateToRaw = interaction.fields.getTextInputValue('date_to').trim();
      const timeFromRaw = interaction.fields.getTextInputValue('time_from').trim();
      const timeToRaw = interaction.fields.getTextInputValue('time_to').trim();
      const from = parseLocalDateTime(dateFromRaw, timeFromRaw);
      const to = parseLocalDateTime(dateToRaw, timeToRaw);

      if (!from || !to) {
        await interaction.editReply('❌ Nieprawidłowa data lub godzina. Przykład: `11.07.2026`, `00:30`.');
        return;
      }
      if (to < from) {
        await interaction.editReply('❌ Data/godzina „do” nie może być wcześniejsza niż „od”.');
        return;
      }

      const selection = getChannelSelection(session.channelKey);
      if (!selection) {
        await interaction.editReply('❌ Nie znaleziono kanału.');
        return;
      }

      const result = await fetchDropsFromChannels(selection.ids, from.toMillis(), to.toMillis());
      const filtered = result.drops.filter((drop) => (
        (session.type === 'all' || drop.type === session.type)
        && variantMatches(drop.item, session.variant)
        && accountMatches(drop.account, session.account)
      ));
      const repriced = await repriceDrops(filtered, result.drops, selection.ids);

      const itemCounts = new Map();
      for (const drop of repriced.drops) {
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

      const itemGroups = [...itemCounts.values()].sort((a, b) => {
        const hierarchy = compareByHierarchy(a, b);
        if (hierarchy !== 0) return hierarchy;
        return b.count - a.count;
      });

      const pageCount = Math.max(
        1,
        Math.ceil(repriced.drops.length / HISTORY_PAGE_SIZE),
        Math.ceil(itemGroups.length / HISTORY_PAGE_SIZE),
      );
      const paginationId = createSessionId();
      const pagination = {
        id: paginationId,
        kind: 'drop',
        ownerId: interaction.user.id,
        createdAt: Date.now(),
        pageCount,
        drops: repriced.drops,
        itemGroups,
        type: session.type,
        variant: session.variant,
        account: session.account,
        channelLabel: selection.label,
        from,
        to,
        scanned: result.scanned + repriced.scanned,
        hitLimit: result.hitLimit || repriced.hitLimit,
        channelsScanned: result.channelsScanned,
        pricingFound: repriced.pricingFound,
        pricingWanted: repriced.pricingWanted,
        pricingFromPs99Rap: repriced.pricingFromPs99Rap,
        pricingFallback: repriced.pricingFallback,
        ps99RapErrors: repriced.ps99RapErrors,
      };

      paginationSessions.set(paginationId, pagination);
      dropFormSessions.delete(sessionId);
      const rendered = renderPaginationSession(pagination, 0);
      await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('page:')) {
      const [, sessionId, action] = interaction.customId.split(':');
      const session = paginationSessions.get(sessionId);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
        await interaction.reply({ content: '❌ Te wyniki wygasły. Uruchom komendę ponownie.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: 'Te przyciski należą do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (action === 'noop') {
        await interaction.deferUpdate();
        return;
      }

      const currentLabel = interaction.message.components?.[0]?.components?.[1]?.label || '1/1';
      const currentPage = Math.max(0, Number(currentLabel.split('/')[0]) - 1 || 0);
      const targetPage = action === 'next' ? currentPage + 1 : currentPage - 1;
      const rendered = renderPaginationSession(session, targetPage);
      await interaction.update({ embeds: rendered.embeds, components: rendered.components });
    }
  } catch (error) {
    console.error('Błąd obsługi interakcji:', error);
    const message = '❌ Wystąpił błąd. Sprawdź logi Railway i uprawnienia bota.';

    if (interaction.isAutocomplete()) {
      await interaction.respond([]).catch(() => {});
    } else if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(TOKEN);
