'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  LabelBuilder,
  MessageFlags,
  PermissionFlagsBits,
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

// Publiczny endpoint zgodny z typowym payloadem webhooka Discord.
// W istniejącym skrypcie Roblox wklejasz adres DropVault zamiast adresu Discord webhooka.
const RELAY_BODY_LIMIT_BYTES = Math.max(
  16_384,
  Number(process.env.RELAY_BODY_LIMIT_BYTES || 1_000_000),
);
const RELAY_DUPLICATE_WINDOW_MS = Math.max(
  5_000,
  Number(process.env.RELAY_DUPLICATE_WINDOW_MS || 30_000),
);
const PUBLIC_BASE_URL_RAW = String(
  process.env.PUBLIC_BASE_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ''),
).replace(/\/+$/, '');
const PORT = Math.max(1, Number(process.env.PORT || 3000));

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
const PS99RAP_CATALOG_TTL_MS = Math.max(
  5 * 60_000,
  Number(process.env.PS99RAP_CATALOG_TTL_MS || 30 * 60_000),
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
    ingestSecret: process.env.PAWEL_INGEST_SECRET || process.env.INGEST_SECRET || '',
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
    ingestSecret: process.env.RYZEN_INGEST_SECRET || process.env.INGEST_SECRET || '',
    emoji: '🔵',
    color: 0x5865f2,
  },
];


const PLAZA_CHANNELS = [
  {
    key: 'pawel',
    label: 'Plaza Paweł',
    id: process.env.PAWEL_PLAZA_CHANNEL_ID || '1524784522154213397',
    reportChannelId: process.env.PAWEL_PLAZA_REPORT_CHANNEL_ID
      || process.env.PAWEL_PLAZA_CHANNEL_ID
      || '1524784522154213397',
    emoji: '🟢',
    color: 0x57f287,
  },
  {
    key: 'ryzen',
    label: 'Plaza Ryzen',
    id: process.env.RYZEN_PLAZA_CHANNEL_ID || '1524841567028903966',
    reportChannelId: process.env.RYZEN_PLAZA_REPORT_CHANNEL_ID
      || process.env.RYZEN_PLAZA_CHANNEL_ID
      || '1524841567028903966',
    emoji: '🔵',
    color: 0x5865f2,
  },
];


const SERVER_PANELS = [
  {
    key: 'pawel',
    label: 'Serwery Paweł',
    channelId: process.env.PAWEL_SERVER_CHANNEL_ID || '1525508811039969480',
    emoji: '🟢',
    color: 0x57f287,
    links: [
      'https://www.roblox.com/share?code=1dc61c8f568e854b81077578dadca1d5&type=Server',
      'https://www.roblox.com/share?code=2882ae24b287c047928f1d3de4af03b3&type=Server',
      'https://www.roblox.com/share?code=5da9128e244dbc4fab0e8c44d4098284&type=Server',
      'https://www.roblox.com/share?code=190f8eb553175b4bbe24a74d4ccd900b&type=Server',
      'https://www.roblox.com/share?code=cca5563605d2c54999174d2194c161c0&type=Server',
    ],
  },
  {
    key: 'ryzen',
    label: 'Serwery Ryzen',
    channelId: process.env.RYZEN_SERVER_CHANNEL_ID || '1525508845324075179',
    emoji: '🔵',
    color: 0x5865f2,
    links: [
      'https://www.roblox.com/share?code=99c61ffc0c39fd4284199eaabe650757&type=Server',
      'https://www.roblox.com/share?code=9b6a43edd3611c42b747dbcff286840b&type=Server',
      'https://www.roblox.com/share?code=641f52d61acd3947b64f3783ef82286f&type=Server',
      'https://www.roblox.com/share?code=c413f4bb67b31a4e89efcbcbf28901ce&type=Server',
    ],
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

const commands = [
  new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Otwiera formularz do sprawdzania dropów'),

  new SlashCommandBuilder()
    .setName('today')
    .setDescription('Otwiera formularz dzisiejszych dropów'),

  new SlashCommandBuilder()
    .setName('webhookurl')
    .setDescription('Otwiera formularz adresu DropVault dla webhooka Roblox')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Otwiera formularz historii konkretnego peta'),

  new SlashCommandBuilder()
    .setName('petvalue')
    .setDescription('Otwiera formularz historii RAP z PS99RAP'),

  new SlashCommandBuilder()
    .setName('bestbuys')
    .setDescription('Najlepsze zakupy z Trading Plaza według aktualnego RAP'),

  new SlashCommandBuilder()
    .setName('plazaitem')
    .setDescription('Statystyki i historia konkretnego przedmiotu z Trading Plaza'),

  new SlashCommandBuilder()
    .setName('plazatime')
    .setDescription('Sprawdza najlepsze godziny zakupów na Trading Plaza'),
];

// ============================================================
// STAN, CACHE I SESJE
// ============================================================

const catalogByChannel = new Map();
const paginationSessions = new Map();
const dropFormSessions = new Map();
const ps99RapPriceCache = new Map();
const relayRecentPayloads = new Map();
let ps99RapCatalog = {
  loadedAt: 0,
  entries: [],
  byId: new Map(),
  byNormalizedId: new Map(),
  byNormalizedName: new Map(),
};
let ps99RapCatalogLoading = null;
let ps99RapCatalogTimer = null;
let alertsReady = false;
let schedulerStarted = false;

let state = {
  dailyReports: {},
  dailyPlazaReports: {},
  records: {},
  processedMessageIds: [],
  serverPanelMessages: {},
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
  for (const [hash, createdAt] of relayRecentPayloads) {
    if (now - createdAt > RELAY_DUPLICATE_WINDOW_MS) relayRecentPayloads.delete(hash);
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
        dailyPlazaReports: parsed.dailyPlazaReports || {},
        records: parsed.records || {},
        processedMessageIds: Array.isArray(parsed.processedMessageIds)
          ? parsed.processedMessageIds.slice(-5000)
          : [],
        serverPanelMessages: parsed.serverPanelMessages || {},
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


function getPlazaChannelConfigByKey(channelKey) {
  return PLAZA_CHANNELS.find((entry) => entry.key === channelKey) || null;
}

function getPlazaChannelConfigById(channelId) {
  return PLAZA_CHANNELS.find((entry) => entry.id === channelId) || null;
}

function getPlazaChannelSelection(channelKey) {
  if (channelKey === 'all') {
    return {
      label: 'Obie Plazy',
      ids: PLAZA_CHANNELS.map((channel) => channel.id),
    };
  }

  const channel = getPlazaChannelConfigByKey(channelKey);
  if (!channel) return null;
  return { label: channel.label, ids: [channel.id] };
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


function makeStringSelect(customId, placeholder, options, defaultValue = null) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1);

  menu.addOptions(...options.map((option) => {
    const builder = new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setValue(option.value);
    if (option.description) builder.setDescription(option.description);
    if (option.emoji) builder.setEmoji(option.emoji);
    if (defaultValue && option.value === defaultValue) builder.setDefault(true);
    return builder;
  }));

  return menu;
}

function makeSelectLabel(label, description, menu) {
  const builder = new LabelBuilder().setLabel(label).setStringSelectMenuComponent(menu);
  if (description) builder.setDescription(description);
  return builder;
}

function makeTextLabel(label, description, customId, placeholder, options = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(options.style || TextInputStyle.Short)
    .setRequired(options.required ?? false);

  if (placeholder) input.setPlaceholder(placeholder);
  if (options.value) input.setValue(options.value);
  if (options.minLength) input.setMinLength(options.minLength);
  if (options.maxLength) input.setMaxLength(options.maxLength);

  const builder = new LabelBuilder().setLabel(label).setTextInputComponent(input);
  if (description) builder.setDescription(description);
  return builder;
}

function modalChannelOptions(allowAll = true) {
  const options = DROP_CHANNELS.map((channel) => ({
    label: channel.label,
    value: channel.key,
    emoji: channel.emoji,
  }));
  if (allowAll) {
    options.push({
      label: 'Oba kanały',
      value: 'all',
      emoji: '📡',
      description: 'Łączy dropy Pawła i Ryzena',
    });
  }
  return options;
}


function modalPlazaChannelOptions(allowAll = true) {
  const options = PLAZA_CHANNELS.map((channel) => ({
    label: channel.label,
    value: channel.key,
    emoji: channel.emoji,
  }));
  if (allowAll) {
    options.push({
      label: 'Obie Plazy',
      value: 'all',
      emoji: '⛱️',
      description: 'Łączy zakupy Pawła i Ryzena',
    });
  }
  return options;
}

const PET_TYPE_OPTIONS = [
  { label: 'Wszystkie', value: 'all', emoji: '📦' },
  { label: 'Huge', value: 'huge', emoji: '🐱' },
  { label: 'Titanic', value: 'titanic', emoji: '🦣' },
  { label: 'Gargantuan', value: 'gargantuan', emoji: '🌋' },
];

const PET_VARIANT_OPTIONS = [
  { label: 'Wszystkie warianty', value: 'all', emoji: '📦' },
  { label: 'Normal', value: 'normal', emoji: '⚪' },
  { label: 'Golden', value: 'golden', emoji: '🟡' },
  { label: 'Rainbow', value: 'rainbow', emoji: '🌈' },
  { label: 'Shiny', value: 'shiny', emoji: '✨' },
  { label: 'Shiny Golden', value: 'shiny_golden', emoji: '🌟' },
  { label: 'Shiny Rainbow', value: 'shiny_rainbow', emoji: '💎' },
];

function buildDropFormModal(userId) {
  const now = DateTime.now().setZone(TIME_ZONE);
  const today = now.toFormat('dd.MM.yyyy');
  return new ModalBuilder()
    .setCustomId(`form:drop:${userId}`)
    .setTitle('Sprawdź dropy')
    .addLabelComponents(
      makeSelectLabel(
        'KANAŁ DROPÓW',
        'Wybierz Pawła, Ryzena albo oba kanały.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalChannelOptions(true), 'pawel'),
      ),
      makeSelectLabel(
        'RODZAJ PETA',
        'Huge, Titanic, Gargantuan lub wszystkie.',
        makeStringSelect('form_type', 'Wybierz rodzaj', PET_TYPE_OPTIONS, 'all'),
      ),
      makeSelectLabel(
        'WARIANT',
        'Możesz ograniczyć wyniki do konkretnego wariantu.',
        makeStringSelect('form_variant', 'Wybierz wariant', PET_VARIANT_OPTIONS, 'all'),
      ),
      makeTextLabel(
        'DATA I GODZINA',
        'Format: DD.MM.RRRR GG:MM - DD.MM.RRRR GG:MM',
        'form_range',
        `${today} 00:00 - ${today} 23:59`,
        { required: true, value: `${today} 00:00 - ${today} 23:59`, maxLength: 45 },
      ),
    );
}

function buildTodayFormModal(userId) {
  return new ModalBuilder()
    .setCustomId(`form:today:${userId}`)
    .setTitle('Dzisiejsze dropy')
    .addLabelComponents(
      makeSelectLabel(
        'KANAŁ DROPÓW',
        'Wybierz kanał, który ma zostać podsumowany.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalChannelOptions(true), 'pawel'),
      ),
      makeSelectLabel(
        'RODZAJ PETA',
        'Domyślnie bot policzy wszystkie rodzaje.',
        makeStringSelect('form_type', 'Wybierz rodzaj', PET_TYPE_OPTIONS, 'all'),
      ),
      makeSelectLabel(
        'WARIANT',
        'Domyślnie bot policzy wszystkie warianty.',
        makeStringSelect('form_variant', 'Wybierz wariant', PET_VARIANT_OPTIONS, 'all'),
      ),
    );
}

function buildPetFormModal(userId) {
  return new ModalBuilder()
    .setCustomId(`form:pet:${userId}`)
    .setTitle('Historia peta')
    .addLabelComponents(
      makeTextLabel(
        'NAZWA PETA',
        'Możesz wpisać pełną nazwę albo jej fragment.',
        'form_pet_name',
        'np. Titanic Goalie Octopus',
        { required: true, minLength: 2, maxLength: 100 },
      ),
      makeSelectLabel(
        'KANAŁ DROPÓW',
        'Wybierz kanał, na którym bot ma szukać.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalChannelOptions(true), 'pawel'),
      ),
      makeSelectLabel(
        'WARIANT',
        'Opcjonalny filtr wariantu peta.',
        makeStringSelect('form_variant', 'Wybierz wariant', PET_VARIANT_OPTIONS, 'all'),
      ),
      makeTextLabel(
        'ZAKRES DAT',
        'Opcjonalnie: DD.MM.RRRR - DD.MM.RRRR. Puste = cała historia.',
        'form_dates',
        'np. 01.07.2026 - 11.07.2026',
        { required: false, maxLength: 25 },
      ),
    );
}

function buildPetValueFormModal(userId) {
  const periodOptions = [
    { label: 'Ostatnie 7 dni', value: '7d', emoji: '7️⃣' },
    { label: 'Ostatnie 30 dni', value: '30d', emoji: '📅' },
    { label: 'Ostatnie 90 dni', value: '90d', emoji: '📊' },
    { label: 'Ostatnie 180 dni', value: '180d', emoji: '📈' },
    { label: 'Cała historia', value: 'all', emoji: '🗂️' },
  ];

  return new ModalBuilder()
    .setCustomId(`form:petvalue:${userId}`)
    .setTitle('Sprawdź wartość peta')
    .addLabelComponents(
      makeTextLabel(
        'NAZWA PETA',
        'Wpisz możliwie dokładną nazwę z Pet Simulator 99.',
        'form_pet_name',
        'np. Titanic Goalie Octopus',
        { required: true, minLength: 2, maxLength: 100 },
      ),
      makeSelectLabel(
        'RODZAJ PETA',
        'Pomaga odróżnić podobne nazwy.',
        makeStringSelect('form_type', 'Wybierz rodzaj', PET_TYPE_OPTIONS, 'all'),
      ),
      makeSelectLabel(
        'WARIANT',
        'Pomaga odróżnić Normal, Golden, Rainbow i Shiny.',
        makeStringSelect('form_variant', 'Wybierz wariant', PET_VARIANT_OPTIONS, 'all'),
      ),
      makeSelectLabel(
        'OKRES HISTORII',
        'Własne daty poniżej mają pierwszeństwo.',
        makeStringSelect('form_period', 'Wybierz okres', periodOptions, '30d'),
      ),
      makeTextLabel(
        'WŁASNY ZAKRES DAT',
        'Opcjonalnie: DD.MM.RRRR - DD.MM.RRRR',
        'form_dates',
        'np. 01.07.2026 - 11.07.2026',
        { required: false, maxLength: 25 },
      ),
    );
}

function buildWebhookUrlFormModal(userId) {
  return new ModalBuilder()
    .setCustomId(`form:webhookurl:${userId}`)
    .setTitle('Adres DropVault')
    .addLabelComponents(
      makeSelectLabel(
        'DLA KOGO?',
        'Wybierz osobny kanał Pawła albo Ryzena.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalChannelOptions(false), 'pawel'),
      ),
    );
}


function buildBestBuysFormModal(userId) {
  const today = DateTime.now().setZone(TIME_ZONE).toFormat('dd.MM.yyyy');
  const sortOptions = [
    { label: 'Największy aktualny profit', value: 'profit', emoji: '💎' },
    { label: 'Największy profit procentowy', value: 'percent', emoji: '📈' },
    { label: 'Najwięcej sztuk', value: 'quantity', emoji: '📦' },
    { label: 'Największa różnica do RAP', value: 'discount', emoji: '🏷️' },
  ];

  return new ModalBuilder()
    .setCustomId(`form:bestbuys:${userId}`)
    .setTitle('Najlepsze zakupy Plaza')
    .addLabelComponents(
      makeSelectLabel(
        'KANAŁ PLAZA',
        'Wybierz Pawła, Ryzena albo obie Plazy.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalPlazaChannelOptions(true), 'pawel'),
      ),
      makeSelectLabel(
        'SORTOWANIE',
        'Wyniki są przeliczane według aktualnego RAP z PS99RAP.',
        makeStringSelect('form_sort', 'Wybierz sposób sortowania', sortOptions, 'profit'),
      ),
      makeTextLabel(
        'DATA OD - DATA DO',
        'Format: DD.MM.RRRR - DD.MM.RRRR',
        'form_dates',
        `${today} - ${today}`,
        { required: true, value: `${today} - ${today}`, maxLength: 25 },
      ),
      makeTextLabel(
        'PRZEDMIOT (OPCJONALNIE)',
        'Fragment nazwy, np. Mini Chest. Puste = wszystkie.',
        'form_item',
        'np. Mini Chest',
        { required: false, maxLength: 100 },
      ),
      makeTextLabel(
        'KONTO (OPCJONALNIE)',
        'Nick Roblox. Puste = wszystkie konta.',
        'form_account',
        'np. ps99alts23',
        { required: false, maxLength: 100 },
      ),
    );
}

function buildPlazaItemFormModal(userId) {
  const today = DateTime.now().setZone(TIME_ZONE).toFormat('dd.MM.yyyy');
  return new ModalBuilder()
    .setCustomId(`form:plazaitem:${userId}`)
    .setTitle('Historia przedmiotu Plaza')
    .addLabelComponents(
      makeTextLabel(
        'NAZWA PRZEDMIOTU',
        'Pełna nazwa albo fragment, np. Mini Chest.',
        'form_item',
        'np. Mini Chest',
        { required: true, minLength: 2, maxLength: 100 },
      ),
      makeSelectLabel(
        'KANAŁ PLAZA',
        'Wybierz Pawła, Ryzena albo obie Plazy.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalPlazaChannelOptions(true), 'pawel'),
      ),
      makeTextLabel(
        'DATA OD - DATA DO',
        'Format: DD.MM.RRRR - DD.MM.RRRR',
        'form_dates',
        `${today} - ${today}`,
        { required: true, value: `${today} - ${today}`, maxLength: 25 },
      ),
      makeTextLabel(
        'KONTO (OPCJONALNIE)',
        'Nick Roblox. Puste = wszystkie konta.',
        'form_account',
        'np. ps99alts23',
        { required: false, maxLength: 100 },
      ),
    );
}

function buildPlazaTimeFormModal(userId) {
  const today = DateTime.now().setZone(TIME_ZONE).toFormat('dd.MM.yyyy');
  return new ModalBuilder()
    .setCustomId(`form:plazatime:${userId}`)
    .setTitle('Godziny zakupów Plaza')
    .addLabelComponents(
      makeSelectLabel(
        'KANAŁ PLAZA',
        'Wybierz Pawła, Ryzena albo obie Plazy.',
        makeStringSelect('form_channel', 'Wybierz kanał', modalPlazaChannelOptions(true), 'pawel'),
      ),
      makeTextLabel(
        'DATA OD - DATA DO',
        'Format: DD.MM.RRRR - DD.MM.RRRR',
        'form_dates',
        `${today} - ${today}`,
        { required: true, value: `${today} - ${today}`, maxLength: 25 },
      ),
      makeTextLabel(
        'KONTO (OPCJONALNIE)',
        'Nick Roblox. Puste = wszystkie konta.',
        'form_account',
        'np. ps99alts23',
        { required: false, maxLength: 100 },
      ),
    );
}

function getModalSelect(interaction, customId, fallback = '') {
  const values = interaction.fields.getStringSelectValues(customId);
  return values?.[0] || fallback;
}

function splitDateRange(raw) {
  const value = String(raw || '').trim();
  if (!value) return { from: '', to: '' };
  const match = value.match(/^\s*(\d{2}\.\d{2}\.\d{4})\s*(?:-|–|—|do)\s*(\d{2}\.\d{2}\.\d{4})\s*$/i);
  if (!match) return null;
  return { from: match[1], to: match[2] };
}

function splitDateTimeRange(raw) {
  const value = String(raw || '').trim();
  const match = value.match(
    /^\s*(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*(?:-|–|—|do)\s*(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*$/i,
  );
  if (!match) return null;
  return {
    dateFrom: match[1],
    timeFrom: match[2],
    dateTo: match[3],
    timeTo: match[4],
  };
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
        'User-Agent': 'DropVault-Discord-Bot/2.3 (+PS99RAP credit)',
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

function isPs99RapCatalogFresh() {
  return ps99RapCatalog.entries.length > 0
    && Date.now() - ps99RapCatalog.loadedAt < PS99RAP_CATALOG_TTL_MS;
}

function normalizePs99RapTier(value, itemName) {
  const tier = String(value || '').toLowerCase();
  if (['huge', 'titanic', 'gargantuan'].includes(tier)) return tier;
  return detectType(itemName);
}

function normalizePs99RapVariant(value, itemName) {
  const variant = String(value || '').toLowerCase();
  if (['normal', 'golden', 'rainbow', 'shiny', 'shiny_golden', 'shiny_rainbow'].includes(variant)) {
    return variant;
  }
  return detectVariant(itemName);
}

async function refreshPs99RapCatalog(force = false) {
  if (!PS99RAP_ENABLED) return ps99RapCatalog;
  if (!force && isPs99RapCatalogFresh()) return ps99RapCatalog;
  if (ps99RapCatalogLoading) return ps99RapCatalogLoading;

  ps99RapCatalogLoading = (async () => {
    const searchUrl = new URL('/api/search', `${PS99RAP_BASE_URL}/`);
    const metaUrl = new URL('/api/meta', `${PS99RAP_BASE_URL}/`);

    try {
      const [searchPayloadRaw, metaPayloadRaw] = await Promise.all([
        fetchJsonWithTimeout(searchUrl),
        fetchJsonWithTimeout(metaUrl).catch((error) => {
          console.warn('PS99RAP meta API chwilowo niedostępne:', error.message || error);
          return {};
        }),
      ]);

      const searchPayload = unwrapApiData(searchPayloadRaw);
      const metaPayload = unwrapApiData(metaPayloadRaw);
      const searchObject = searchPayload && typeof searchPayload === 'object' ? searchPayload : {};
      const metaObject = metaPayload && typeof metaPayload === 'object' ? metaPayload : {};

      const entries = [];
      const byId = new Map();
      const byNormalizedId = new Map();
      const byNormalizedName = new Map();

      for (const [itemId, rawName] of Object.entries(searchObject)) {
        const itemName = typeof rawName === 'string'
          ? rawName
          : String(rawName?.name || rawName?.display_name || '').trim();
        if (!itemId || !itemName) continue;

        const meta = metaObject[itemId] || {};
        const entry = {
          id: itemId,
          name: itemName,
          tier: normalizePs99RapTier(meta.t, itemName),
          variant: normalizePs99RapVariant(meta.v, itemName),
        };

        entries.push(entry);
        byId.set(itemId, entry);
        byNormalizedId.set(normalizePs99RapItemId(itemId), entry);

        const nameKey = normalizeItemName(itemName);
        const sameName = byNormalizedName.get(nameKey) || [];
        sameName.push(entry);
        byNormalizedName.set(nameKey, sameName);
      }

      entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      ps99RapCatalog = {
        loadedAt: Date.now(),
        entries,
        byId,
        byNormalizedId,
        byNormalizedName,
      };

      const petCount = entries.filter((entry) => entry.tier).length;
      const titanicCount = entries.filter((entry) => entry.tier === 'titanic').length;
      console.log(`PS99RAP katalog: ${entries.length} przedmiotów, ${petCount} petów tierowych, ${titanicCount} Titaniców.`);
      return ps99RapCatalog;
    } catch (error) {
      console.error('Nie udało się pobrać pełnego katalogu PS99RAP:', error.message || error);
      return ps99RapCatalog;
    } finally {
      ps99RapCatalogLoading = null;
    }
  })();

  return ps99RapCatalogLoading;
}

function startPs99RapCatalogRefresh() {
  if (ps99RapCatalogTimer) return;
  ps99RapCatalogTimer = setInterval(() => {
    refreshPs99RapCatalog(true).catch((error) => {
      console.error('Błąd odświeżania katalogu PS99RAP:', error);
    });
  }, PS99RAP_CATALOG_TTL_MS);
  ps99RapCatalogTimer.unref?.();
}

function getPs99RapAutocompleteChoices(query, typeFilter = 'all', variantFilter = 'all') {
  const normalizedQuery = normalizeItemName(query);
  let entries = ps99RapCatalog.entries;

  if (typeFilter !== 'all') entries = entries.filter((entry) => entry.tier === typeFilter);
  if (variantFilter !== 'all') entries = entries.filter((entry) => entry.variant === variantFilter);

  if (normalizedQuery) {
    entries = entries.filter((entry) => (
      normalizeItemName(entry.name).includes(normalizedQuery)
      || normalizePs99RapItemId(entry.id).includes(normalizedQuery)
    ));
  } else {
    // Bez wpisanego tekstu pokazujemy najpierw najrzadsze pety zamiast losowych przedmiotów.
    entries = entries.filter((entry) => entry.tier);
  }

  const tierRank = { gargantuan: 0, titanic: 1, huge: 2, null: 3 };
  return entries
    .sort((a, b) => {
      const aName = normalizeItemName(a.name);
      const bName = normalizeItemName(b.name);
      const aStarts = normalizedQuery && aName.startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = normalizedQuery && bName.startsWith(normalizedQuery) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aTier = tierRank[a.tier] ?? 3;
      const bTier = tierRank[b.tier] ?? 3;
      if (aTier !== bTier) return aTier - bTier;
      return a.name.localeCompare(b.name, 'en');
    })
    .slice(0, 25)
    .map((entry) => ({
      name: entry.name.slice(0, 100),
      value: entry.id.slice(0, 100),
    }));
}

function resolvePs99RapCatalogEntry(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return { entry: null, matches: [] };

  const directId = ps99RapCatalog.byId.get(value);
  if (directId) return { entry: directId, matches: [directId] };

  const normalizedId = normalizePs99RapItemId(value);
  const idMatch = ps99RapCatalog.byNormalizedId.get(normalizedId);
  if (idMatch) return { entry: idMatch, matches: [idMatch] };

  const normalizedName = normalizeItemName(value);
  const exactNameMatches = ps99RapCatalog.byNormalizedName.get(normalizedName) || [];
  if (exactNameMatches.length === 1) return { entry: exactNameMatches[0], matches: exactNameMatches };
  if (exactNameMatches.length > 1) return { entry: null, matches: exactNameMatches };

  const partialMatches = ps99RapCatalog.entries.filter((entry) => (
    normalizeItemName(entry.name).includes(normalizedName)
    || normalizePs99RapItemId(entry.id).includes(normalizedName)
  ));
  if (partialMatches.length === 1) return { entry: partialMatches[0], matches: partialMatches };
  return { entry: null, matches: partialMatches };
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
    const resolvedCatalog = resolvePs99RapCatalogEntry(itemName);
    unique.set(itemKey, {
      itemKey,
      itemName,
      itemId: resolvedCatalog.entry?.id || toPs99RapItemId(itemName),
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

async function fetchPs99RapHistory(itemName, explicitItemId = null) {
  if (!PS99RAP_ENABLED) return { history: [], itemId: null, sourceUrl: null, error: null };

  const itemId = explicitItemId || toPs99RapItemId(itemName);
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

async function fetchPs99RapCurrentById(itemId, itemName) {
  if (!PS99RAP_ENABLED || !itemId) return null;
  const url = new URL(`/api/item/${encodeURIComponent(itemId)}`, `${PS99RAP_BASE_URL}/`);

  try {
    const payload = unwrapApiData(await fetchJsonWithTimeout(url));
    const rap = parseRap(payload?.rap);
    if (rap <= 0n) return null;
    return {
      item: itemName,
      itemId,
      rap,
      exists: payload?.exists == null ? null : Number(payload.exists),
      source: 'ps99rap',
      sourceUrl: buildPs99RapItemUrl(itemId),
      fetchedAt: Date.now(),
      cachedAt: Date.now(),
    };
  } catch (error) {
    console.error(`PS99RAP item API error (${itemId}):`, error.message || error);
    return null;
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

function formatDateOnly(timestamp) {
  return DateTime.fromMillis(timestamp, { zone: TIME_ZONE }).toFormat('dd.MM.yyyy');
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
// TRADING PLAZA — PARSOWANIE, POBIERANIE I AKTUALNY RAP
// ============================================================

function extractExactLabeledValue(text, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\s*:`, 'i');

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine
      .replace(/\*\*/g, '')
      .replace(/\|\|/g, '')
      .replace(/[>_]/g, '')
      .trim();
    if (!pattern.test(line)) continue;

    const codeValue = rawLine.match(/`([^`]+)`/);
    if (codeValue) return codeValue[1].trim();
    return line.replace(pattern, '').trim();
  }

  return null;
}

function parseSignedNumber(value) {
  const text = String(value || '').trim();
  if (!text) return 0n;
  const negative = /^\s*-/.test(text);
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return 0n;
  const amount = BigInt(digits);
  return negative ? -amount : amount;
}

function parsePercent(value) {
  const match = String(value || '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function parsePlazaItem(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(.*?)\s*\(\s*x\s*([\d\s,._]+)\s*\)\s*$/i);
  if (!match) return { item: value, quantity: 1 };
  const quantityDigits = match[2].replace(/[^0-9]/g, '');
  return {
    item: match[1].trim(),
    quantity: Math.max(1, Number(quantityDigits || 1)),
  };
}

function parseEachValue(raw) {
  const match = String(raw || '').match(/\(([-\d\s,._]+)\s*Each\)/i);
  return match ? parseSignedNumber(match[1]) : 0n;
}

function parsePlazaPurchaseFromEmbed(embed, message) {
  const parts = [embed.title, embed.description];
  for (const field of embed.fields || []) parts.push(field.name, field.value);
  const fullText = parts.filter(Boolean).join('\n');

  if (!/sniped an item|trading plaza/i.test(fullText)) return null;

  const rawItem = extractExactLabeledValue(fullText, 'Item');
  const paidRaw = extractExactLabeledValue(fullText, 'Paid');
  const rapRaw = extractExactLabeledValue(fullText, 'RAP');
  const profitRaw = extractExactLabeledValue(fullText, 'Profit');
  const account = extractExactLabeledValue(fullText, 'In Account');
  if (!rawItem || !paidRaw || !account) return null;

  const parsedItem = parsePlazaItem(rawItem);
  const paidTotal = parseSignedNumber(paidRaw.split('(')[0]);
  const embeddedRapTotal = parseSignedNumber(String(rapRaw || '').split('(')[0]);
  const embeddedProfit = parseSignedNumber(String(profitRaw || '').split('(')[0]);
  const quantity = Math.max(1, parsedItem.quantity);
  const paidEachParsed = parseEachValue(paidRaw);
  const rapEachParsed = parseEachValue(rapRaw);

  return {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    createdAt: message.createdTimestamp,
    item: parsedItem.item,
    quantity,
    account,
    paidTotal,
    paidEach: paidEachParsed > 0n ? paidEachParsed : paidTotal / BigInt(quantity),
    embeddedRapTotal,
    embeddedRapEach: rapEachParsed > 0n
      ? rapEachParsed
      : (embeddedRapTotal > 0n ? embeddedRapTotal / BigInt(quantity) : 0n),
    embeddedProfit,
    embeddedProfitPercent: parsePercent(profitRaw),
    thumbnail: embed.thumbnail?.url || null,
  };
}

async function fetchPlazaPurchases(channel, fromMillis, toMillis) {
  const purchases = [];
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
        const parsed = parsePlazaPurchaseFromEmbed(embed, message);
        if (parsed) purchases.push(parsed);
      }
    }

    before = messages[messages.length - 1].id;
  }

  return { purchases, scanned, hitLimit: scanned >= MAX_MESSAGES && !reachedStart };
}

async function fetchPlazaPurchasesFromChannels(channelIds, fromMillis, toMillis) {
  const results = await Promise.all(channelIds.map(async (channelId) => {
    const channel = await getTextChannel(channelId);
    const result = await fetchPlazaPurchases(channel, fromMillis, toMillis);
    return { channelId, ...result };
  }));

  return {
    purchases: results.flatMap((result) => result.purchases),
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    hitLimit: results.some((result) => result.hitLimit),
    channelsScanned: results.length,
  };
}

async function repricePlazaPurchases(purchases) {
  const priceResult = await fetchPs99RapPrices(purchases.map((purchase) => purchase.item));
  let pricingFromPs99Rap = 0;
  let pricingFallback = 0;

  const repriced = purchases.map((purchase) => {
    const itemKey = normalizeItemName(purchase.item);
    const current = priceResult.prices.get(itemKey);
    const currentUnitRap = current?.rap > 0n ? current.rap : purchase.embeddedRapEach;
    const rapSource = current?.rap > 0n ? 'ps99rap' : 'webhook';
    if (rapSource === 'ps99rap') pricingFromPs99Rap += 1;
    else pricingFallback += 1;

    const currentRapTotal = currentUnitRap * BigInt(purchase.quantity);
    const currentProfit = currentRapTotal - purchase.paidTotal;
    const currentProfitPercent = purchase.paidTotal > 0n
      ? (Number(currentProfit) / Number(purchase.paidTotal)) * 100
      : 0;
    const discountPerUnit = currentUnitRap - purchase.paidEach;

    return {
      ...purchase,
      currentUnitRap,
      currentRapTotal,
      currentProfit,
      currentProfitPercent,
      discountPerUnit,
      rapSource,
      rapSourceUrl: current?.sourceUrl || null,
    };
  });

  return {
    purchases: repriced,
    pricingWanted: new Set(purchases.map((purchase) => normalizeItemName(purchase.item))).size,
    pricingFound: priceResult.prices.size,
    pricingFromPs99Rap,
    pricingFallback,
    ps99RapErrors: priceResult.errors.length,
  };
}

function filterPlazaPurchases(purchases, itemQuery, account) {
  const normalizedItem = normalizeItemName(itemQuery);
  return purchases.filter((purchase) => (
    (!normalizedItem || normalizeItemName(purchase.item).includes(normalizedItem))
    && accountMatches(purchase.account, account)
  ));
}

function parseRequiredDateRange(raw) {
  const dates = splitDateRange(raw);
  if (!dates) return null;
  const from = parseOptionalDate(dates.from, false);
  const to = parseOptionalDate(dates.to, true);
  if (!from || !to || to < from) return null;
  return { from, to };
}

function getPlazaMessageUrl(purchase) {
  if (!purchase.guildId || !purchase.channelId || !purchase.messageId) return null;
  return `https://discord.com/channels/${purchase.guildId}/${purchase.channelId}/${purchase.messageId}`;
}

function formatProfitPercent(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

function sortPlazaPurchases(purchases, sortMode) {
  return [...purchases].sort((a, b) => {
    if (sortMode === 'percent') return b.currentProfitPercent - a.currentProfitPercent;
    if (sortMode === 'quantity') return b.quantity - a.quantity || (b.createdAt - a.createdAt);
    if (sortMode === 'discount') {
      if (a.discountPerUnit !== b.discountPerUnit) return a.discountPerUnit > b.discountPerUnit ? -1 : 1;
      return b.createdAt - a.createdAt;
    }
    if (a.currentProfit !== b.currentProfit) return a.currentProfit > b.currentProfit ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

function plazaSortLabel(sortMode) {
  return {
    profit: 'aktualny profit',
    percent: 'profit procentowy',
    quantity: 'liczba sztuk',
    discount: 'różnica ceny do RAP za sztukę',
  }[sortMode] || sortMode;
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

  const history = pageEntries.map((point, index) => {
    const absoluteIndex = start + index;
    const olderPoint = session.priceHistory[absoluteIndex + 1];
    const delta = olderPoint ? point.rap - olderPoint.rap : null;
    const deltaText = delta == null
      ? ''
      : ` • zmiana: \`${formatSignedBigInt(delta)}\``;
    const currentText = point.isCurrent ? ' • **aktualna cena**' : '';

    return `${absoluteIndex + 1}. **${formatDateOnly(point.createdAt)}**${currentText}\n`
      + `   RAP: \`${formatBigInt(point.rap)}\`${deltaText}`;
  }).join('\n') || 'Brak';

  const percentText = session.oldestRap > 0n
    ? `${((Number(session.change) / Number(session.oldestRap)) * 100).toFixed(2)}%`
    : 'brak danych';

  const embed = new EmbedBuilder()
    .setTitle(`💹 RAP: ${session.displayName}`)
    .setColor(session.change >= 0n ? 0x57f287 : 0xed4245)
    .setDescription(
      '**Źródło:** wyłącznie PS99RAP — bez mieszania kanałów i kont\n'
      + `**Zakres:** ${session.dateLabel}\n`
      + '**Kolejność:** najnowsze daty są na górze\n'
      + `**RAP na początku zakresu:** \`${formatBigInt(session.oldestRap)}\`\n`
      + `**${session.latestLabel}:** \`${formatBigInt(session.latestRap)}\`\n`
      + `**Łączna zmiana:** \`${formatSignedBigInt(session.change)}\` (${percentText})`,
    )
    .addFields(
      { name: '📉 Najniższy RAP', value: `\`${formatBigInt(session.minRap)}\``, inline: true },
      { name: '📈 Najwyższy RAP', value: `\`${formatBigInt(session.maxRap)}\``, inline: true },
      { name: '🧾 Zmian ceny', value: `\`${session.priceHistory.length}\``, inline: true },
      { name: '📜 Historia cen — najnowsze u góry', value: truncate(history) },
    )
    .setFooter({ text: `PS99RAP • strona ${page + 1}/${session.pageCount}` })
    .setTimestamp();

  if (session.sourceUrl) embed.setURL(session.sourceUrl);
  if (session.thumbnail) embed.setThumbnail(session.thumbnail);
  return embed;
}


function buildBestBuysPageEmbed(session, page) {
  const start = page * HISTORY_PAGE_SIZE;
  const pagePurchases = session.sortedPurchases.slice(start, start + HISTORY_PAGE_SIZE);
  const lines = pagePurchases.map((purchase, index) => {
    const itemText = purchase.rapSourceUrl
      ? `[${purchase.item}](${purchase.rapSourceUrl})`
      : purchase.item;
    const messageUrl = getPlazaMessageUrl(purchase);
    const dateText = messageUrl
      ? `[${formatDateTime(purchase.createdAt)}](${messageUrl})`
      : formatDateTime(purchase.createdAt);
    return `${start + index + 1}. **${itemText} ×${purchase.quantity}**\n`
      + `   Zapłacono: \`${formatBigInt(purchase.paidTotal)}\` (${formatBigInt(purchase.paidEach)}/szt.)\n`
      + `   Aktualny RAP: \`${formatBigInt(purchase.currentRapTotal)}\` (${formatBigInt(purchase.currentUnitRap)}/szt.)\n`
      + `   Profit: \`${formatSignedBigInt(purchase.currentProfit)}\` (${formatProfitPercent(purchase.currentProfitPercent)}) • \`${purchase.account}\` • ${dateText}`;
  }).join('\n') || 'Brak zakupów na tej stronie.';

  return new EmbedBuilder()
    .setTitle('🏆 Najlepsze zakupy — Trading Plaza')
    .setColor(session.totalProfit >= 0n ? 0x57f287 : 0xed4245)
    .setDescription(
      `**Kanał:** ${session.channelLabel}\n`
      + `**Okres:** ${session.from.toFormat('dd.MM.yyyy')} – ${session.to.toFormat('dd.MM.yyyy')}\n`
      + `**Konto:** \`${session.account}\`\n`
      + `**Przedmiot:** ${session.itemQuery || 'wszystkie'}\n`
      + `**Sortowanie:** ${plazaSortLabel(session.sortMode)}\n`
      + '**Wycena:** aktualny RAP z PS99RAP; brak ceny = RAP z webhooka',
    )
    .addFields(
      { name: '🧾 Zakupy', value: `\`${session.purchases.length}\``, inline: true },
      { name: '📦 Sztuki', value: `\`${formatBigInt(session.totalQuantity)}\``, inline: true },
      { name: '💸 Wydano', value: `\`${formatBigInt(session.totalPaid)}\``, inline: true },
      { name: '💎 Aktualny RAP', value: `\`${formatBigInt(session.totalRap)}\``, inline: true },
      { name: '📈 Szacowany profit', value: `\`${formatSignedBigInt(session.totalProfit)}\``, inline: true },
      { name: '🌐 Ceny PS99RAP', value: `\`${session.pricingFound}/${session.pricingWanted}\``, inline: true },
      { name: '📋 Wyniki', value: truncate(lines) },
    )
    .setFooter({
      text: session.hitLimit
        ? `Strona ${page + 1}/${session.pageCount} • osiągnięto limit ${MAX_MESSAGES} wiadomości • RAP: ps99rap.com`
        : `Strona ${page + 1}/${session.pageCount} • RAP: ps99rap.com`,
    })
    .setTimestamp();
}

function buildPlazaItemPageEmbed(session, page) {
  const start = page * HISTORY_PAGE_SIZE;
  const pagePurchases = session.sortedPurchases.slice(start, start + HISTORY_PAGE_SIZE);
  const lines = pagePurchases.map((purchase, index) => {
    const messageUrl = getPlazaMessageUrl(purchase);
    const dateText = messageUrl
      ? `[${formatDateTime(purchase.createdAt)}](${messageUrl})`
      : formatDateTime(purchase.createdAt);
    return `${start + index + 1}. **×${purchase.quantity}** • ${dateText} • \`${purchase.account}\`\n`
      + `   Zapłacono: \`${formatBigInt(purchase.paidTotal)}\` (${formatBigInt(purchase.paidEach)}/szt.)\n`
      + `   Teraz warte: \`${formatBigInt(purchase.currentRapTotal)}\` • profit: \`${formatSignedBigInt(purchase.currentProfit)}\``;
  }).join('\n') || 'Brak historii na tej stronie.';

  const currentPriceLines = session.itemPrices.map((item) => {
    const name = item.sourceUrl ? `[${item.item}](${item.sourceUrl})` : item.item;
    return `• **${name}** — \`${formatBigInt(item.currentUnitRap)}\` RAP/szt.`;
  }).join('\n') || 'Brak aktualnej ceny.';

  const biggest = session.biggestPurchase;
  const cheapest = session.cheapestPurchase;

  return new EmbedBuilder()
    .setTitle(`📦 Plaza Item: ${session.itemQuery}`)
    .setColor(0xfee75c)
    .setDescription(
      `**Kanał:** ${session.channelLabel}\n`
      + `**Okres:** ${session.from.toFormat('dd.MM.yyyy')} – ${session.to.toFormat('dd.MM.yyyy')}\n`
      + `**Konto:** \`${session.account}\`\n`
      + '**Aktualna wycena:** PS99RAP; fallback z webhooka',
    )
    .addFields(
      { name: '🧾 Zakupy', value: `\`${session.purchases.length}\``, inline: true },
      { name: '📦 Kupiono sztuk', value: `\`${formatBigInt(session.totalQuantity)}\``, inline: true },
      { name: '💸 Wydano', value: `\`${formatBigInt(session.totalPaid)}\``, inline: true },
      { name: '💎 Aktualna wartość', value: `\`${formatBigInt(session.totalRap)}\``, inline: true },
      { name: '📈 Szacowany profit', value: `\`${formatSignedBigInt(session.totalProfit)}\``, inline: true },
      { name: '🏷️ Średnia cena/szt.', value: `\`${formatBigInt(session.averagePaidEach)}\``, inline: true },
      {
        name: '🏆 Największy zakup',
        value: biggest
          ? `**${biggest.item} ×${biggest.quantity}** • ${formatDateTime(biggest.createdAt)}\nZapłacono: \`${formatBigInt(biggest.paidTotal)}\` (${formatBigInt(biggest.paidEach)}/szt.)`
          : 'Brak',
      },
      {
        name: '💰 Najniższa cena za sztukę',
        value: cheapest
          ? `\`${formatBigInt(cheapest.paidEach)}\` • **${cheapest.item}** • ${formatDateTime(cheapest.createdAt)}`
          : 'Brak',
      },
      { name: '🌐 Aktualny RAP przedmiotów', value: truncate(currentPriceLines) },
      { name: '📜 Historia — najnowsze u góry', value: truncate(lines) },
    )
    .setFooter({ text: `Strona ${page + 1}/${session.pageCount} • RAP: ps99rap.com` })
    .setTimestamp();
}

function buildPlazaTimePageEmbed(session, page) {
  const start = page * 12;
  const pageHours = session.hours.slice(start, start + 12);
  const lines = pageHours.map((hour) => (
    `**${String(hour.hour).padStart(2, '0')}:00–${String(hour.hour).padStart(2, '0')}:59** — `
    + `${hour.transactions} zakupów • ${formatBigInt(hour.quantity)} szt.\n`
    + `Wydano: \`${formatBigInt(hour.paid)}\` • RAP: \`${formatBigInt(hour.rap)}\` • profit: \`${formatSignedBigInt(hour.profit)}\``
  )).join('\n') || 'Brak danych.';

  return new EmbedBuilder()
    .setTitle('🕒 Godziny zakupów — Trading Plaza')
    .setColor(0x5865f2)
    .setDescription(
      `**Kanał:** ${session.channelLabel}\n`
      + `**Okres:** ${session.from.toFormat('dd.MM.yyyy')} – ${session.to.toFormat('dd.MM.yyyy')}\n`
      + `**Konto:** \`${session.account}\`\n`
      + '**Wycena:** aktualny RAP z PS99RAP',
    )
    .addFields(
      { name: '🧾 Najwięcej zakupów', value: session.bestTransactionsText, inline: true },
      { name: '📦 Najwięcej sztuk', value: session.bestQuantityText, inline: true },
      { name: '💎 Największy profit', value: session.bestProfitText, inline: true },
      { name: '📊 Godziny', value: truncate(lines) },
    )
    .setFooter({ text: `Strona ${page + 1}/${session.pageCount} • strefa ${TIME_ZONE} • RAP: ps99rap.com` })
    .setTimestamp();
}

function renderPaginationSession(session, page) {
  const safePage = Math.max(0, Math.min(page, session.pageCount - 1));
  let embed;

  if (session.kind === 'drop') embed = buildDropPageEmbed(session, safePage);
  else if (session.kind === 'pet') embed = buildPetPageEmbed(session, safePage);
  else if (session.kind === 'petvalue') embed = buildPetValuePageEmbed(session, safePage);
  else if (session.kind === 'bestbuys') embed = buildBestBuysPageEmbed(session, safePage);
  else if (session.kind === 'plazaitem') embed = buildPlazaItemPageEmbed(session, safePage);
  else embed = buildPlazaTimePageEmbed(session, safePage);

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


function buildAccountPickerComponents(session) {
  const pageCount = Math.max(1, Math.ceil(session.accounts.length / ACCOUNT_PAGE_SIZE));
  session.accountPage = Math.max(0, Math.min(session.accountPage || 0, pageCount - 1));

  const start = session.accountPage * ACCOUNT_PAGE_SIZE;
  const accounts = session.accounts.slice(start, start + ACCOUNT_PAGE_SIZE);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`account_pick:${session.id}`)
    .setPlaceholder('Wybierz konto Roblox')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Wszystkie konta')
        .setDescription('Nie filtruj wyników po nicku')
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
        .setCustomId(`account_pick_page:${session.id}:prev`)
        .setLabel('Poprzednie konta')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(session.accountPage <= 0),
      new ButtonBuilder()
        .setCustomId(`account_pick_page:${session.id}:noop`)
        .setLabel(`${session.accountPage + 1}/${pageCount}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`account_pick_page:${session.id}:next`)
        .setLabel('Następne konta')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(session.accountPage >= pageCount - 1),
    ));
  }

  return components;
}

async function ensureAccountsLoaded(channelKey) {
  const selection = getChannelSelection(channelKey);
  if (!selection) return { selection: null, accounts: [] };

  let catalog = getCombinedCatalog(channelKey);
  if (catalog.accounts.size === 0) {
    const fallbackFrom = DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day');
    const fallbackTo = DateTime.now().setZone(TIME_ZONE).endOf('day');
    await fetchDropsFromChannels(selection.ids, fallbackFrom.toMillis(), fallbackTo.toMillis());
    catalog = getCombinedCatalog(channelKey);
  }

  const accounts = [...catalog.accounts.values()]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }));

  return { selection, accounts };
}

function accountPickerSummary(action, params, selection) {
  const lines = [`Kanał: **${selection.label}**`];
  if (action === 'drop' || action === 'today') {
    lines.push(`Typ: **${typeLabel(params.type)}**`);
    lines.push(`Wariant: **${variantLabel(params.variant)}**`);
  }
  if (action === 'drop') lines.push(`Zakres: **${params.rangeRaw}**`);
  if (action === 'pet') {
    lines.push(`Pet: **${params.queryRaw}**`);
    lines.push(`Wariant: **${variantLabel(params.variant)}**`);
  }
  lines.push('', 'Wybierz konto Roblox z listy:');
  return lines.join('\n');
}

async function startAccountPicker(interaction, action, params) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { selection, accounts } = await ensureAccountsLoaded(params.channelKey);
  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono wybranego kanału.');
    return;
  }

  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    action,
    params,
    accounts,
    accountPage: 0,
  };
  dropFormSessions.set(sessionId, session);

  await interaction.editReply({
    content: accountPickerSummary(action, params, selection),
    components: buildAccountPickerComponents(session),
  });
}

async function prepareResultInteraction(interaction) {
  if (interaction.deferred || interaction.replied) return;
  if (interaction.isMessageComponent()) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
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

  await dailyPlazaReportTick(now);
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
// RAPORT DZIENNY TRADING PLAZA 23:59
// ============================================================

function groupPlazaPurchases(purchases) {
  const byItem = new Map();
  const byAccount = new Map();

  for (const purchase of purchases) {
    const itemKey = normalizeItemName(purchase.item);
    const item = byItem.get(itemKey) || {
      item: purchase.item,
      quantity: 0n,
      transactions: 0,
      paid: 0n,
      rap: 0n,
      profit: 0n,
      unitRap: purchase.currentUnitRap,
      sourceUrl: purchase.rapSourceUrl,
    };
    item.quantity += BigInt(purchase.quantity);
    item.transactions += 1;
    item.paid += purchase.paidTotal;
    item.rap += purchase.currentRapTotal;
    item.profit += purchase.currentProfit;
    item.unitRap = purchase.currentUnitRap;
    if (purchase.rapSourceUrl) item.sourceUrl = purchase.rapSourceUrl;
    byItem.set(itemKey, item);

    const accountKey = normalizeAccount(purchase.account);
    const account = byAccount.get(accountKey) || {
      account: purchase.account,
      transactions: 0,
      quantity: 0n,
      paid: 0n,
      rap: 0n,
      profit: 0n,
    };
    account.transactions += 1;
    account.quantity += BigInt(purchase.quantity);
    account.paid += purchase.paidTotal;
    account.rap += purchase.currentRapTotal;
    account.profit += purchase.currentProfit;
    byAccount.set(accountKey, account);
  }

  return {
    items: [...byItem.values()].sort((a, b) => {
      if (a.quantity !== b.quantity) return a.quantity > b.quantity ? -1 : 1;
      return b.transactions - a.transactions;
    }),
    accounts: [...byAccount.values()].sort((a, b) => {
      if (a.profit !== b.profit) return a.profit > b.profit ? -1 : 1;
      return b.transactions - a.transactions;
    }),
  };
}

function buildDailyPlazaReportEmbeds(channelConfig, reportDate, purchases, metadata) {
  const totalQuantity = purchases.reduce((sum, purchase) => sum + BigInt(purchase.quantity), 0n);
  const totalPaid = purchases.reduce((sum, purchase) => sum + purchase.paidTotal, 0n);
  const totalRap = purchases.reduce((sum, purchase) => sum + purchase.currentRapTotal, 0n);
  const totalProfit = totalRap - totalPaid;
  const bestPurchase = [...purchases].sort((a, b) => (
    a.currentProfit === b.currentProfit ? b.createdAt - a.createdAt : (a.currentProfit > b.currentProfit ? -1 : 1)
  ))[0] || null;
  const grouped = groupPlazaPurchases(purchases);
  const mostBought = grouped.items[0] || null;

  const summary = new EmbedBuilder()
    .setTitle(`⛱️ Trading Plaza — raport dnia — ${channelConfig.label}`)
    .setColor(totalProfit >= 0n ? channelConfig.color : 0xed4245)
    .setDescription(
      `**Data:** ${reportDate.toFormat('dd.MM.yyyy')}\n`
      + '**Wycena:** aktualny RAP z PS99RAP; brak ceny = RAP z webhooka\n'
      + `**Strefa czasowa:** ${TIME_ZONE}`,
    )
    .addFields(
      { name: '🧾 Zakupy', value: `\`${purchases.length}\``, inline: true },
      { name: '📦 Kupione przedmioty', value: `\`${formatBigInt(totalQuantity)}\``, inline: true },
      { name: '💸 Wydano', value: `\`${formatBigInt(totalPaid)}\``, inline: true },
      { name: '💎 Łączny aktualny RAP', value: `\`${formatBigInt(totalRap)}\``, inline: true },
      { name: '📈 Szacowany profit', value: `\`${formatSignedBigInt(totalProfit)}\``, inline: true },
      { name: '🌐 Ceny PS99RAP', value: `\`${metadata.pricingFound}/${metadata.pricingWanted}\``, inline: true },
      {
        name: '🏆 Najlepszy zakup',
        value: bestPurchase
          ? `**${bestPurchase.item} ×${bestPurchase.quantity}**\nZapłacono: \`${formatBigInt(bestPurchase.paidTotal)}\` • RAP: \`${formatBigInt(bestPurchase.currentRapTotal)}\`\nProfit: \`${formatSignedBigInt(bestPurchase.currentProfit)}\` (${formatProfitPercent(bestPurchase.currentProfitPercent)})`
          : 'Brak zakupów',
      },
      {
        name: '📦 Najczęściej kupowany',
        value: mostBought
          ? `**${mostBought.item}** — ${formatBigInt(mostBought.quantity)} szt. w ${mostBought.transactions} zakupach`
          : 'Brak zakupów',
      },
    )
    .setFooter({
      text: metadata.hitLimit
        ? `Osiągnięto limit ${MAX_MESSAGES} wiadomości • RAP: ps99rap.com`
        : 'Automatyczny raport Plaza 23:59 • RAP: ps99rap.com',
    })
    .setTimestamp();
  if (bestPurchase?.thumbnail) summary.setThumbnail(bestPurchase.thumbnail);

  const itemLines = grouped.items.map((item, index) => {
    const name = item.sourceUrl ? `[${item.item}](${item.sourceUrl})` : item.item;
    return `${index + 1}. **${name}** — ${formatBigInt(item.quantity)} szt. • wydano \`${formatBigInt(item.paid)}\` • RAP \`${formatBigInt(item.rap)}\` • profit \`${formatSignedBigInt(item.profit)}\``;
  });
  const accountLines = grouped.accounts.map((account, index) => (
    `${index + 1}. \`${account.account}\` — ${account.transactions} zakupów • ${formatBigInt(account.quantity)} szt. • wydano \`${formatBigInt(account.paid)}\` • profit \`${formatSignedBigInt(account.profit)}\``
  ));

  const embeds = [summary];
  splitTextIntoChunks(itemLines).forEach((chunk, index, chunks) => {
    embeds.push(new EmbedBuilder()
      .setTitle(`📦 Przedmioty${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`)
      .setColor(channelConfig.color)
      .setDescription(chunk));
  });
  splitTextIntoChunks(accountLines).forEach((chunk, index, chunks) => {
    embeds.push(new EmbedBuilder()
      .setTitle(`👥 Konta${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`)
      .setColor(channelConfig.color)
      .setDescription(chunk));
  });
  return embeds;
}

async function sendDailyPlazaReport(channelConfig, reportDate) {
  const from = reportDate.startOf('day');
  const to = reportDate.endOf('day');
  const result = await fetchPlazaPurchasesFromChannels([channelConfig.id], from.toMillis(), to.toMillis());
  const repriced = await repricePlazaPurchases(result.purchases);
  const targetChannel = await getTextChannel(channelConfig.reportChannelId);
  const embeds = buildDailyPlazaReportEmbeds(channelConfig, reportDate, repriced.purchases, {
    scanned: result.scanned,
    hitLimit: result.hitLimit,
    pricingFound: repriced.pricingFound,
    pricingWanted: repriced.pricingWanted,
  });
  await sendEmbedsInBatches(targetChannel, embeds);
  state.dailyPlazaReports[channelConfig.key] = reportDate.toISODate();
  saveState();
  console.log(`Wysłano raport Plaza: ${channelConfig.label} — ${reportDate.toISODate()}`);
}

async function dailyPlazaReportTick(now) {
  for (const channelConfig of PLAZA_CHANNELS) {
    if (state.dailyPlazaReports[channelConfig.key] === now.toISODate()) continue;
    try {
      await sendDailyPlazaReport(channelConfig, now);
    } catch (error) {
      console.error(`Błąd raportu Plaza ${channelConfig.label}:`, error);
    }
  }
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
  const channelKey = interaction.commandName === 'petvalue'
    ? 'all'
    : interaction.options.getString('kanal') || 'all';
  const catalog = getCombinedCatalog(channelKey);

  if (focused.name === 'nazwa') {
    if (interaction.commandName === 'petvalue') {
      if (!isPs99RapCatalogFresh()) {
        refreshPs99RapCatalog().catch(() => {});
      }

      const typeFilter = interaction.options.getString('typ') || 'all';
      const variantFilter = interaction.options.getString('wariant') || 'all';
      const psChoices = getPs99RapAutocompleteChoices(focused.value, typeFilter, variantFilter);
      if (psChoices.length > 0) {
        await interaction.respond(psChoices);
        return;
      }
    }

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
    console.log(`Zarejestrowano /drop, /today, /webhookurl, /pet, /petvalue, /bestbuys, /plazaitem i /plazatime na serwerze ${GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log('Zarejestrowano globalne komendy /drop, /today, /webhookurl, /pet, /petvalue, /bestbuys, /plazaitem i /plazatime.');
  }
}

async function executeTodayCommand(interaction, params = null) {
  await prepareResultInteraction(interaction);

  const channelKey = params?.channelKey ?? interaction.options.getString('kanal', true);
  const account = (params?.account ?? interaction.options.getString('konto') ?? '').trim() || 'wszystkie';
  const type = params?.type ?? interaction.options.getString('typ') ?? 'all';
  const variant = params?.variant ?? interaction.options.getString('wariant') ?? 'all';
  const selection = getChannelSelection(channelKey);

  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono wybranego kanału.');
    return;
  }

  const now = DateTime.now().setZone(TIME_ZONE);
  const from = now.startOf('day');
  const to = now;
  const result = await fetchDropsFromChannels(selection.ids, from.toMillis(), to.toMillis());
  const filtered = result.drops.filter((drop) => (
    (type === 'all' || drop.type === type)
    && variantMatches(drop.item, variant)
    && accountMatches(drop.account, account)
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
  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    kind: 'drop',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount,
    drops: repriced.drops,
    itemGroups,
    type,
    variant,
    account: isAllAccounts(account) ? 'wszystkie' : account,
    channelLabel: `${selection.label} • DZISIAJ`,
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

  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}


async function executeDropForm(interaction, params) {
  await prepareResultInteraction(interaction);

  const range = splitDateTimeRange(params.rangeRaw);
  if (!range) {
    await interaction.editReply(
      '❌ Nieprawidłowy zakres. Użyj formatu: `11.07.2026 00:00 - 11.07.2026 23:59`.',
    );
    return;
  }

  const from = parseLocalDateTime(range.dateFrom, range.timeFrom);
  const to = parseLocalDateTime(range.dateTo, range.timeTo);
  if (!from || !to) {
    await interaction.editReply('❌ Nieprawidłowa data lub godzina. Przykład: `11.07.2026 00:30`.');
    return;
  }
  if (to < from) {
    await interaction.editReply('❌ Data/godzina „do” nie może być wcześniejsza niż „od”.');
    return;
  }

  const selection = getChannelSelection(params.channelKey);
  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono kanału.');
    return;
  }

  const account = String(params.account || '').trim() || 'wszystkie';
  const result = await fetchDropsFromChannels(selection.ids, from.toMillis(), to.toMillis());
  const filtered = result.drops.filter((drop) => (
    (params.type === 'all' || drop.type === params.type)
    && variantMatches(drop.item, params.variant)
    && accountMatches(drop.account, account)
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
    type: params.type,
    variant: params.variant,
    account,
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
  const rendered = renderPaginationSession(pagination, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}


async function executeBestBuysCommand(interaction, params) {
  await prepareResultInteraction(interaction);
  const range = parseRequiredDateRange(params.datesRaw);
  if (!range) {
    await interaction.editReply('❌ Nieprawidłowy zakres dat. Użyj: `12.07.2026 - 12.07.2026`.');
    return;
  }
  const selection = getPlazaChannelSelection(params.channelKey);
  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono kanału Plaza.');
    return;
  }

  const account = String(params.account || '').trim() || 'wszystkie';
  const itemQuery = String(params.itemQuery || '').trim();
  const result = await fetchPlazaPurchasesFromChannels(selection.ids, range.from.toMillis(), range.to.toMillis());
  const filtered = filterPlazaPurchases(result.purchases, itemQuery, account);
  const repriced = await repricePlazaPurchases(filtered);
  const sortedPurchases = sortPlazaPurchases(repriced.purchases, params.sortMode);
  const totalQuantity = repriced.purchases.reduce((sum, purchase) => sum + BigInt(purchase.quantity), 0n);
  const totalPaid = repriced.purchases.reduce((sum, purchase) => sum + purchase.paidTotal, 0n);
  const totalRap = repriced.purchases.reduce((sum, purchase) => sum + purchase.currentRapTotal, 0n);
  const pageCount = Math.max(1, Math.ceil(sortedPurchases.length / HISTORY_PAGE_SIZE));
  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    kind: 'bestbuys',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount,
    sortedPurchases,
    purchases: repriced.purchases,
    channelLabel: selection.label,
    from: range.from,
    to: range.to,
    account,
    itemQuery,
    sortMode: params.sortMode,
    totalQuantity,
    totalPaid,
    totalRap,
    totalProfit: totalRap - totalPaid,
    pricingFound: repriced.pricingFound,
    pricingWanted: repriced.pricingWanted,
    scanned: result.scanned,
    hitLimit: result.hitLimit,
  };
  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

async function executePlazaItemCommand(interaction, params) {
  await prepareResultInteraction(interaction);
  const range = parseRequiredDateRange(params.datesRaw);
  if (!range) {
    await interaction.editReply('❌ Nieprawidłowy zakres dat. Użyj: `12.07.2026 - 12.07.2026`.');
    return;
  }
  const selection = getPlazaChannelSelection(params.channelKey);
  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono kanału Plaza.');
    return;
  }
  const account = String(params.account || '').trim() || 'wszystkie';
  const itemQuery = String(params.itemQuery || '').trim();
  const result = await fetchPlazaPurchasesFromChannels(selection.ids, range.from.toMillis(), range.to.toMillis());
  const filtered = filterPlazaPurchases(result.purchases, itemQuery, account);
  if (filtered.length === 0) {
    await interaction.editReply(`❌ Nie znaleziono zakupów pasujących do **${itemQuery}** w wybranym okresie.`);
    return;
  }
  const repriced = await repricePlazaPurchases(filtered);
  const sortedPurchases = [...repriced.purchases].sort((a, b) => b.createdAt - a.createdAt);
  const totalQuantity = repriced.purchases.reduce((sum, purchase) => sum + BigInt(purchase.quantity), 0n);
  const totalPaid = repriced.purchases.reduce((sum, purchase) => sum + purchase.paidTotal, 0n);
  const totalRap = repriced.purchases.reduce((sum, purchase) => sum + purchase.currentRapTotal, 0n);
  const biggestPurchase = [...repriced.purchases].sort((a, b) => b.quantity - a.quantity || b.createdAt - a.createdAt)[0];
  const cheapestPurchase = [...repriced.purchases].sort((a, b) => (
    a.paidEach === b.paidEach ? b.createdAt - a.createdAt : (a.paidEach < b.paidEach ? -1 : 1)
  ))[0];
  const itemPriceMap = new Map();
  for (const purchase of repriced.purchases) {
    const key = normalizeItemName(purchase.item);
    if (!itemPriceMap.has(key)) {
      itemPriceMap.set(key, {
        item: purchase.item,
        currentUnitRap: purchase.currentUnitRap,
        sourceUrl: purchase.rapSourceUrl,
      });
    }
  }
  const pageCount = Math.max(1, Math.ceil(sortedPurchases.length / HISTORY_PAGE_SIZE));
  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    kind: 'plazaitem',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount,
    sortedPurchases,
    purchases: repriced.purchases,
    channelLabel: selection.label,
    from: range.from,
    to: range.to,
    account,
    itemQuery,
    totalQuantity,
    totalPaid,
    totalRap,
    totalProfit: totalRap - totalPaid,
    averagePaidEach: totalQuantity > 0n ? totalPaid / totalQuantity : 0n,
    biggestPurchase,
    cheapestPurchase,
    itemPrices: [...itemPriceMap.values()],
  };
  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

async function executePlazaTimeCommand(interaction, params) {
  await prepareResultInteraction(interaction);
  const range = parseRequiredDateRange(params.datesRaw);
  if (!range) {
    await interaction.editReply('❌ Nieprawidłowy zakres dat. Użyj: `12.07.2026 - 12.07.2026`.');
    return;
  }
  const selection = getPlazaChannelSelection(params.channelKey);
  if (!selection) {
    await interaction.editReply('❌ Nie znaleziono kanału Plaza.');
    return;
  }
  const account = String(params.account || '').trim() || 'wszystkie';
  const result = await fetchPlazaPurchasesFromChannels(selection.ids, range.from.toMillis(), range.to.toMillis());
  const filtered = filterPlazaPurchases(result.purchases, '', account);
  const repriced = await repricePlazaPurchases(filtered);
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    transactions: 0,
    quantity: 0n,
    paid: 0n,
    rap: 0n,
    profit: 0n,
  }));
  for (const purchase of repriced.purchases) {
    const hour = DateTime.fromMillis(purchase.createdAt, { zone: TIME_ZONE }).hour;
    const bucket = hours[hour];
    bucket.transactions += 1;
    bucket.quantity += BigInt(purchase.quantity);
    bucket.paid += purchase.paidTotal;
    bucket.rap += purchase.currentRapTotal;
    bucket.profit += purchase.currentProfit;
  }
  const activeHours = hours.filter((hour) => hour.transactions > 0);
  const bestTransactions = [...activeHours].sort((a, b) => b.transactions - a.transactions || a.hour - b.hour)[0];
  const bestQuantity = [...activeHours].sort((a, b) => (
    a.quantity === b.quantity ? a.hour - b.hour : (a.quantity > b.quantity ? -1 : 1)
  ))[0];
  const bestProfit = [...activeHours].sort((a, b) => (
    a.profit === b.profit ? a.hour - b.hour : (a.profit > b.profit ? -1 : 1)
  ))[0];
  const hourText = (hour, metric) => hour
    ? `\`${String(hour.hour).padStart(2, '0')}:00\` — ${metric}`
    : 'Brak danych';
  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    kind: 'plazatime',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount: 2,
    hours,
    channelLabel: selection.label,
    from: range.from,
    to: range.to,
    account,
    bestTransactionsText: hourText(bestTransactions, `${bestTransactions?.transactions || 0} zakupów`),
    bestQuantityText: hourText(bestQuantity, `${formatBigInt(bestQuantity?.quantity || 0n)} szt.`),
    bestProfitText: hourText(bestProfit, formatSignedBigInt(bestProfit?.profit || 0n)),
  };
  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

function getPublicBaseUrl() {
  return PUBLIC_BASE_URL_RAW || null;
}

function buildRelayUrl(channelConfig) {
  const base = getPublicBaseUrl();
  if (!base || !channelConfig?.ingestSecret) return null;
  return `${base}/drop-webhook/${encodeURIComponent(channelConfig.key)}/${encodeURIComponent(channelConfig.ingestSecret)}`;
}

async function executeWebhookUrlCommand(interaction, params = null) {
  const channelKey = params?.channelKey ?? interaction.options.getString('kanal', true);
  if (channelKey === 'all') {
    await interaction.reply({
      content: '❌ Dla adresu webhooka wybierz osobno Pawła albo Ryzena.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channelConfig = getChannelConfigByKey(channelKey);
  const relayUrl = buildRelayUrl(channelConfig);
  if (!getPublicBaseUrl()) {
    await interaction.reply({
      content: '❌ Brak publicznej domeny. Na Railway wejdź w **Settings → Networking → Generate Domain** albo ustaw `PUBLIC_BASE_URL`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!channelConfig?.ingestSecret) {
    const variableName = channelKey === 'pawel' ? 'PAWEL_INGEST_SECRET' : 'RYZEN_INGEST_SECRET';
    await interaction.reply({
      content: `❌ Dodaj na Railway zmienną \`${variableName}\` z długim losowym hasłem i wykonaj Redeploy.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `${channelConfig.emoji} **Adres dla ${channelConfig.label}:**\n\n\`${relayUrl}\`\n\nWklej ten adres w istniejącym skrypcie Roblox **zamiast webhooka Discord**. Nie udostępniaj go innym — zawiera sekret.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function executePetCommand(interaction, params = null) {
  await prepareResultInteraction(interaction);

  const queryRaw = (params?.queryRaw ?? interaction.options.getString('nazwa', true)).trim();
  const channelKey = params?.channelKey ?? interaction.options.getString('kanal', true);
  const accountRaw = (params?.accountRaw ?? interaction.options.getString('konto') ?? '').trim() || 'wszystkie';
  const variant = params?.variant ?? interaction.options.getString('wariant') ?? 'all';
  const dateFromRaw = (params?.dateFromRaw ?? interaction.options.getString('data_od') ?? '').trim();
  const dateToRaw = (params?.dateToRaw ?? interaction.options.getString('data_do') ?? '').trim();
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

async function executePetValueCommand(interaction, params = null) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const queryRaw = (params?.queryRaw ?? interaction.options.getString('nazwa', true)).trim();
  const period = params?.period ?? interaction.options.getString('okres') ?? '30d';
  const dateFromRaw = (params?.dateFromRaw ?? interaction.options.getString('data_od') ?? '').trim();
  const dateToRaw = (params?.dateToRaw ?? interaction.options.getString('data_do') ?? '').trim();
  const query = normalizeItemName(queryRaw);

  const customFrom = parseOptionalDate(dateFromRaw, false);
  const customTo = parseOptionalDate(dateToRaw, true);
  if (dateFromRaw && !customFrom) {
    await interaction.editReply('❌ Nieprawidłowa data „od”. Użyj `DD.MM.RRRR`.');
    return;
  }
  if (dateToRaw && !customTo) {
    await interaction.editReply('❌ Nieprawidłowa data „do”. Użyj `DD.MM.RRRR`.');
    return;
  }

  const now = DateTime.now().setZone(TIME_ZONE);
  let effectiveTo = customTo || now.endOf('day');
  let effectiveFrom;
  let dateLabel;

  if (customFrom || customTo) {
    effectiveFrom = customFrom || DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day');
    dateLabel = `${effectiveFrom.toFormat('dd.MM.yyyy')} – ${effectiveTo.toFormat('dd.MM.yyyy')}`;
  } else if (period === 'all') {
    effectiveFrom = DateTime.fromISO('2015-01-01', { zone: TIME_ZONE }).startOf('day');
    dateLabel = 'cała historia dostępna w PS99RAP';
  } else {
    const days = { '7d': 7, '30d': 30, '90d': 90, '180d': 180 }[period] || 30;
    effectiveFrom = now.minus({ days: days - 1 }).startOf('day');
    dateLabel = `ostatnie ${days} dni`;
  }

  if (effectiveTo < effectiveFrom) {
    await interaction.editReply('❌ Data „do” nie może być wcześniejsza niż data „od”.');
    return;
  }

  // /petvalue korzysta z pełnego katalogu PS99RAP, a nie tylko z petów,
  // które pojawiły się wcześniej na kanałach Pawła lub Ryzena.
  await refreshPs99RapCatalog();
  const typeFilter = params?.type ?? interaction.options.getString('typ') ?? 'all';
  const variantFilter = params?.variant ?? interaction.options.getString('wariant') ?? 'all';
  const resolvedRaw = resolvePs99RapCatalogEntry(queryRaw);
  const filteredMatches = resolvedRaw.matches.filter((entry) => (
    (typeFilter === 'all' || detectPetType(entry.name) === typeFilter)
    && variantMatches(entry.name, variantFilter)
  ));
  const resolved = {
    entry: resolvedRaw.entry
      && (typeFilter === 'all' || detectPetType(resolvedRaw.entry.name) === typeFilter)
      && variantMatches(resolvedRaw.entry.name, variantFilter)
      ? resolvedRaw.entry
      : (filteredMatches.length === 1 ? filteredMatches[0] : null),
    matches: filteredMatches,
  };

  if (!resolved.entry && resolved.matches.length > 1) {
    const examples = resolved.matches.slice(0, 10).map((entry) => `• ${entry.name}`).join('\n');
    await interaction.editReply(
      `❌ Ta część nazwy pasuje do kilku przedmiotów. Dopisz więcej liter albo wybierz pełną nazwę z podpowiedzi:\n${examples}`,
    );
    return;
  }

  const selectedEntry = resolved.entry;
  const displayName = selectedEntry?.name || queryRaw;
  const exactItemId = selectedEntry?.id || toPs99RapItemId(displayName);
  const ps99RapHistory = await fetchPs99RapHistory(displayName, exactItemId);

  if (ps99RapHistory.error) {
    await interaction.editReply(
      `❌ PS99RAP chwilowo nie odpowiada dla **${displayName}**. Spróbuj ponownie za chwilę.`,
    );
    return;
  }

  const filtered = ps99RapHistory.history
    .filter((point) => (
      point.createdAt >= effectiveFrom.toMillis()
      && point.createdAt <= effectiveTo.toMillis()
    ))
    .sort((a, b) => a.createdAt - b.createdAt);

  if (filtered.length === 0) {
    await interaction.editReply(
      `❌ PS99RAP nie ma historii ceny dla **${displayName}** w zakresie: ${dateLabel}.`,
    );
    return;
  }

  // Zostawiamy ostatnią cenę z każdego dnia. Dzięki temu daty są czytelne,
  // nie ma kilku chaotycznych wpisów z tego samego dnia.
  const lastPointByDay = new Map();
  for (const point of filtered) {
    const dayKey = DateTime.fromMillis(point.createdAt, { zone: TIME_ZONE }).toISODate();
    lastPointByDay.set(dayKey, point);
  }

  const dailyPoints = [...lastPointByDay.values()].sort((a, b) => a.createdAt - b.createdAt);
  const chronologicalChanges = [];
  for (const point of dailyPoints) {
    const previous = chronologicalChanges[chronologicalChanges.length - 1];
    if (!previous || previous.rap !== point.rap) chronologicalChanges.push(point);
  }

  // Dopisz bieżący RAP z PS99RAP, jeżeli różni się od ostatniego zapisu historii.
  const rangeIncludesToday = effectiveTo.toMillis() >= now.startOf('day').toMillis();
  const currentPrice = rangeIncludesToday
    ? await fetchPs99RapCurrentById(exactItemId, displayName)
    : null;
  if (currentPrice?.rap > 0n) {
    const previous = chronologicalChanges[chronologicalChanges.length - 1];
    if (!previous || previous.rap !== currentPrice.rap) {
      chronologicalChanges.push({
        createdAt: Date.now(),
        rap: currentPrice.rap,
        source: 'ps99rap',
        sourceUrl: currentPrice.sourceUrl || ps99RapHistory.sourceUrl,
        isCurrent: true,
      });
    }
  }

  if (chronologicalChanges.length === 0) {
    await interaction.editReply(`❌ Brak poprawnych danych RAP dla **${displayName}**.`);
    return;
  }

  const oldestRap = chronologicalChanges[0].rap;
  const latestRap = chronologicalChanges[chronologicalChanges.length - 1].rap;
  const allRaps = chronologicalChanges.map((point) => point.rap);
  const minRap = allRaps.reduce((min, value) => (value < min ? value : min), allRaps[0]);
  const maxRap = allRaps.reduce((max, value) => (value > max ? value : max), allRaps[0]);
  const priceHistory = [...chronologicalChanges].reverse();

  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    kind: 'petvalue',
    ownerId: interaction.user.id,
    createdAt: Date.now(),
    pageCount: Math.max(1, Math.ceil(priceHistory.length / HISTORY_PAGE_SIZE)),
    priceHistory,
    displayName,
    dateLabel,
    oldestRap,
    latestRap,
    latestLabel: rangeIncludesToday ? 'Aktualny RAP' : 'RAP na końcu zakresu',
    change: latestRap - oldestRap,
    minRap,
    maxRap,
    thumbnail: null,
    sourceUrl: ps99RapHistory.sourceUrl || currentPrice?.sourceUrl || null,
  };

  paginationSessions.set(sessionId, session);
  const rendered = renderPaginationSession(session, 0);
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

// ============================================================
// RELAY WEBHOOKA ROBLOX -> WIADOMOŚĆ BOTA
// ============================================================

function secureStringEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readJsonRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > RELAY_BODY_LIMIT_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ raw, payload: JSON.parse(raw || '{}') });
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function replaceRapInWebhookText(text, rap) {
  const formatted = formatBigInt(rap);
  return String(text || '').replace(
    /(\*{0,2}RAP\s*:\*{0,2}\s*)(?:`[^`]*`|[0-9][0-9\s,._]*)/gi,
    `$1\`${formatted}\``,
  );
}

function clampText(value, max, fallback = '\u200b') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

async function getCurrentRapForRelay(drop) {
  try {
    await refreshPs99RapCatalog();
    const resolved = resolvePs99RapCatalogEntry(drop.item);
    if (resolved.entry) {
      const current = await fetchPs99RapCurrentById(resolved.entry.id, resolved.entry.name);
      if (current?.rap > 0n) return current;
    }

    const bulk = await fetchPs99RapPrices([drop.item]);
    const price = bulk.prices.get(normalizeItemName(drop.item));
    if (price?.rap > 0n) return price;
  } catch (error) {
    console.error('Relay: nie udało się pobrać bieżącego RAP:', error);
  }

  return {
    item: drop.item,
    rap: drop.rap,
    source: 'incoming',
    sourceUrl: null,
  };
}

function buildRelayedDropEmbed(rawEmbed, drop, currentPrice, channelConfig) {
  const currentRap = currentPrice?.rap > 0n ? currentPrice.rap : drop.rap;
  const builder = new EmbedBuilder()
    .setColor(Number.isInteger(rawEmbed?.color) ? rawEmbed.color : channelConfig.color)
    .setTimestamp();

  if (rawEmbed?.title) builder.setTitle(clampText(rawEmbed.title, 256));
  if (rawEmbed?.description) {
    builder.setDescription(clampText(replaceRapInWebhookText(rawEmbed.description, currentRap), 4096));
  }

  let rapWasPresent = /\bRAP\s*:/i.test(String(rawEmbed?.description || ''));
  const fields = Array.isArray(rawEmbed?.fields)
    ? rawEmbed.fields.slice(0, 25).map((field) => {
      const originalValue = String(field?.value || '');
      if (/\bRAP\s*:/i.test(originalValue) || /\bRAP\b/i.test(String(field?.name || ''))) {
        rapWasPresent = true;
      }
      return {
        name: clampText(field?.name, 256),
        value: clampText(replaceRapInWebhookText(originalValue, currentRap), 1024),
        inline: Boolean(field?.inline),
      };
    })
    : [];

  if (!rapWasPresent && fields.length < 25) {
    fields.push({ name: '💎 Aktualny RAP', value: `\`${formatBigInt(currentRap)}\``, inline: true });
  }
  if (fields.length) builder.addFields(fields);

  const thumbnailUrl = rawEmbed?.thumbnail?.url || drop.thumbnail;
  if (thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)) builder.setThumbnail(thumbnailUrl);

  const source = currentPrice?.source === 'ps99rap' ? 'PS99RAP' : 'RAP przesłany przez skrypt';
  builder.setFooter({
    text: `DropVault • ${channelConfig.label} • aktualna cena: ${source}`,
  });

  return builder;
}

async function processRelayPayload(channelConfig, payload, rawBody) {
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
  const fakeMessage = {
    id: crypto.randomUUID(),
    guildId: null,
    createdTimestamp: Date.now(),
    channelId: channelConfig.id,
  };

  let rawEmbed = null;
  let drop = null;
  for (const candidate of embeds) {
    const parsed = parseDropFromEmbed(candidate, fakeMessage);
    if (parsed) {
      rawEmbed = candidate;
      drop = parsed;
      break;
    }
  }
  if (!drop || !rawEmbed) throw Object.assign(new Error('Nie znaleziono Item / In Account w embedzie.'), { statusCode: 422 });

  const hash = crypto
    .createHash('sha256')
    .update(`${channelConfig.key}:${rawBody}`)
    .digest('hex');
  const previous = relayRecentPayloads.get(hash);
  if (previous && Date.now() - previous < RELAY_DUPLICATE_WINDOW_MS) {
    return { duplicate: true, item: drop.item };
  }
  relayRecentPayloads.set(hash, Date.now());

  const currentPrice = await getCurrentRapForRelay(drop);
  const embed = buildRelayedDropEmbed(rawEmbed, drop, currentPrice, channelConfig);
  const channel = await getTextChannel(channelConfig.id);
  const sent = await channel.send({
    content: '',
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  return {
    duplicate: false,
    item: drop.item,
    rap: currentPrice?.rap > 0n ? currentPrice.rap : drop.rap,
    messageId: sent.id,
  };
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function startRelayServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        sendJson(res, 200, {
          ok: true,
          service: 'DropVault',
          discordReady: client.isReady(),
          relayConfigured: DROP_CHANNELS.filter((entry) => entry.ingestSecret).map((entry) => entry.key),
        });
        return;
      }

      const match = url.pathname.match(/^\/drop-webhook\/([^/]+)\/([^/]+)$/);
      if (req.method !== 'POST' || !match) {
        sendJson(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      if (!client.isReady()) {
        sendJson(res, 503, { ok: false, error: 'discord_not_ready' });
        return;
      }

      const channelKey = decodeURIComponent(match[1]);
      const suppliedSecret = decodeURIComponent(match[2]);
      const channelConfig = getChannelConfigByKey(channelKey);
      if (!channelConfig?.ingestSecret || !secureStringEquals(suppliedSecret, channelConfig.ingestSecret)) {
        sendJson(res, 401, { ok: false, error: 'invalid_secret' });
        return;
      }

      const { raw, payload } = await readJsonRequest(req);
      const result = await processRelayPayload(channelConfig, payload, raw);
      sendJson(res, result.duplicate ? 200 : 201, {
        ok: true,
        duplicate: result.duplicate,
        item: result.item,
        rap: result.rap == null ? undefined : result.rap.toString(),
      });
    } catch (error) {
      console.error('Błąd relay webhooka:', error);
      sendJson(res, error.statusCode || 500, {
        ok: false,
        error: error.message || 'internal_error',
      });
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DropVault HTTP relay działa na 0.0.0.0:${PORT}`);
    for (const channelConfig of DROP_CHANNELS) {
      const relayUrl = buildRelayUrl(channelConfig);
      if (relayUrl) console.log(`${channelConfig.label} relay: ${relayUrl}`);
    }
  });
}

startRelayServer();


// ============================================================
// PANELE PRYWATNYCH SERWERÓW ROBLOX
// ============================================================

function buildServerPanelPayload(panel) {
  // Linki są wysyłane jako osobne bloki kodu w treści wiadomości.
  // Discord pokazuje przy takim bloku ikonę kopiowania, tak jak na screenie użytkownika.
  const copyBlocks = panel.links
    .map((url, index) => `**Serwer ${index + 1}**\n\`\`\`text\n${url}\n\`\`\``)
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(panel.color)
    .setTitle(`${panel.emoji} ${panel.label}`)
    .setDescription(
      'Kliknij ikonę kopiowania przy wybranym linku albo użyj przycisku, aby od razu wejść na serwer.',
    )
    .setFooter({ text: `DropVault • server-panel:${panel.key}` })
    .setTimestamp();

  const rows = [];
  for (let index = 0; index < panel.links.length; index += 5) {
    const row = new ActionRowBuilder();
    for (const [offset, url] of panel.links.slice(index, index + 5).entries()) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel(`Serwer ${index + offset + 1}`)
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Link)
          .setURL(url),
      );
    }
    rows.push(row);
  }

  return {
    content: copyBlocks,
    embeds: [embed],
    components: rows,
    allowedMentions: { parse: [] },
  };
}

function isServerPanelMessage(message, panel) {
  if (!message || message.author?.id !== client.user?.id) return false;
  const expectedFooter = `DropVault • server-panel:${panel.key}`;
  return message.embeds.some((embed) => embed.footer?.text === expectedFooter);
}

async function publishServerPanel(panel) {
  const channel = await getTextChannel(panel.channelId);
  const payload = buildServerPanelPayload(panel);
  let panelMessage = null;

  const storedMessageId = state.serverPanelMessages?.[panel.key];
  if (storedMessageId) {
    panelMessage = await channel.messages.fetch(storedMessageId).catch(() => null);
    if (!isServerPanelMessage(panelMessage, panel)) panelMessage = null;
  }

  if (!panelMessage) {
    const recentMessages = await channel.messages.fetch({ limit: 100 });
    panelMessage = recentMessages.find((message) => isServerPanelMessage(message, panel)) || null;
  }

  if (panelMessage) {
    await panelMessage.edit(payload);
  } else {
    panelMessage = await channel.send(payload);
  }

  state.serverPanelMessages ||= {};
  state.serverPanelMessages[panel.key] = panelMessage.id;
  saveState();
  console.log(`Panel serwerów zaktualizowany: ${panel.label}`);
}

async function publishAllServerPanels() {
  for (const panel of SERVER_PANELS) {
    try {
      await publishServerPanel(panel);
    } catch (error) {
      console.error(`Nie udało się opublikować panelu ${panel.label}:`, error);
    }
  }
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

  await publishAllServerPanels();
  startScheduler();
  await refreshPs99RapCatalog();
  startPs99RapCatalogRefresh();
  await warmCatalogAndRecords();
  alertsReady = true;
  console.log('DropVault jest gotowy: formularze modalne, dropy, Trading Plaza, PS99RAP, raporty 23:59, panele serwerów, relay webhooków, alerty i rekordy aktywne.');
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
      await interaction.showModal(buildDropFormModal(interaction.user.id));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'today') {
      await interaction.showModal(buildTodayFormModal(interaction.user.id));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'webhookurl') {
      await interaction.showModal(buildWebhookUrlFormModal(interaction.user.id));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'pet') {
      await interaction.showModal(buildPetFormModal(interaction.user.id));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'petvalue') {
      await interaction.showModal(buildPetValueFormModal(interaction.user.id));
      return;
    }


    if (interaction.isChatInputCommand() && interaction.commandName === 'bestbuys') {
      await interaction.showModal(buildBestBuysFormModal(interaction.user.id));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'plazaitem') {
      await interaction.showModal(buildPlazaItemFormModal(interaction.user.id));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'plazatime') {
      await interaction.showModal(buildPlazaTimeFormModal(interaction.user.id));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('form:')) {
      const [, formName, ownerId] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'Ten formularz należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }


      if (formName === 'bestbuys') {
        await executeBestBuysCommand(interaction, {
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
          sortMode: getModalSelect(interaction, 'form_sort', 'profit'),
          datesRaw: interaction.fields.getTextInputValue('form_dates'),
          itemQuery: interaction.fields.getTextInputValue('form_item'),
          account: interaction.fields.getTextInputValue('form_account'),
        });
        return;
      }

      if (formName === 'plazaitem') {
        await executePlazaItemCommand(interaction, {
          itemQuery: interaction.fields.getTextInputValue('form_item'),
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
          datesRaw: interaction.fields.getTextInputValue('form_dates'),
          account: interaction.fields.getTextInputValue('form_account'),
        });
        return;
      }

      if (formName === 'plazatime') {
        await executePlazaTimeCommand(interaction, {
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
          datesRaw: interaction.fields.getTextInputValue('form_dates'),
          account: interaction.fields.getTextInputValue('form_account'),
        });
        return;
      }

      if (formName === 'drop') {
        await startAccountPicker(interaction, 'drop', {
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
          type: getModalSelect(interaction, 'form_type', 'all'),
          variant: getModalSelect(interaction, 'form_variant', 'all'),
          rangeRaw: interaction.fields.getTextInputValue('form_range'),
        });
        return;
      }

      if (formName === 'today') {
        await startAccountPicker(interaction, 'today', {
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
          type: getModalSelect(interaction, 'form_type', 'all'),
          variant: getModalSelect(interaction, 'form_variant', 'all'),
        });
        return;
      }

      if (formName === 'webhookurl') {
        await executeWebhookUrlCommand(interaction, {
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
        });
        return;
      }

      if (formName === 'pet') {
        const datesRaw = interaction.fields.getTextInputValue('form_dates');
        const dates = splitDateRange(datesRaw);
        if (datesRaw.trim() && !dates) {
          await interaction.reply({
            content: '❌ Nieprawidłowy zakres dat. Użyj: `01.07.2026 - 11.07.2026`.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await startAccountPicker(interaction, 'pet', {
          queryRaw: interaction.fields.getTextInputValue('form_pet_name'),
          channelKey: getModalSelect(interaction, 'form_channel', 'pawel'),
          variant: getModalSelect(interaction, 'form_variant', 'all'),
          dateFromRaw: dates?.from || '',
          dateToRaw: dates?.to || '',
        });
        return;
      }

      if (formName === 'petvalue') {
        const datesRaw = interaction.fields.getTextInputValue('form_dates');
        const dates = splitDateRange(datesRaw);
        if (datesRaw.trim() && !dates) {
          await interaction.reply({
            content: '❌ Nieprawidłowy zakres dat. Użyj: `01.07.2026 - 11.07.2026`.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await executePetValueCommand(interaction, {
          queryRaw: interaction.fields.getTextInputValue('form_pet_name'),
          type: getModalSelect(interaction, 'form_type', 'all'),
          variant: getModalSelect(interaction, 'form_variant', 'all'),
          period: getModalSelect(interaction, 'form_period', '30d'),
          dateFromRaw: dates?.from || '',
          dateToRaw: dates?.to || '',
        });
        return;
      }
    }


    if (interaction.isButton() && interaction.customId.startsWith('account_pick_page:')) {
      const [, sessionId, action] = interaction.customId.split(':');
      const session = dropFormSessions.get(sessionId);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
        await interaction.reply({ content: '❌ Lista kont wygasła. Uruchom komendę ponownie.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: 'Ta lista kont należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === 'prev') session.accountPage -= 1;
      if (action === 'next') session.accountPage += 1;
      await interaction.update({ components: buildAccountPickerComponents(session) });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('account_pick:')) {
      const sessionId = interaction.customId.split(':')[1];
      const session = dropFormSessions.get(sessionId);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
        await interaction.reply({ content: '❌ Lista kont wygasła. Uruchom komendę ponownie.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== session.ownerId) {
        await interaction.reply({ content: 'Ta lista kont należy do innej osoby.', flags: MessageFlags.Ephemeral });
        return;
      }

      const account = interaction.values[0] === '__all__' ? 'wszystkie' : interaction.values[0];
      dropFormSessions.delete(sessionId);

      if (session.action === 'drop') {
        await executeDropForm(interaction, { ...session.params, account });
        return;
      }
      if (session.action === 'today') {
        await executeTodayCommand(interaction, { ...session.params, account });
        return;
      }
      if (session.action === 'pet') {
        await executePetCommand(interaction, { ...session.params, accountRaw: account });
        return;
      }

      await interaction.update({ content: '❌ Nieznany typ formularza.', components: [] });
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
