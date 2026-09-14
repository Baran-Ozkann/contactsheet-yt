import { parsePlaylistInput } from '../core/playlist-input.js';
import type { Message, PlaylistView, PopupState } from '../core/messaging.js';

/**
 * The contact-sheet interface (spec §6).
 *
 * The popup does no work of its own (spec §2.2): it asks the service worker for
 * state and sends it requests. In particular Refresh sends `sync:start` to the
 * worker, which finds a YouTube tab and hands off the job — it never talks to a
 * content script directly, because that path persists nothing.
 *
 * Every user-facing string comes from _locales (spec §10 rule 13), and every
 * node is built with the DOM API — `innerHTML` is forbidden (§7 rule 2).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRESHED_HOLD_MS = 1400;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const nodes = {
  master: el<HTMLButtonElement>('master'),
  subtitle: el<HTMLParagraphElement>('subtitle'),
  message: el<HTMLParagraphElement>('message'),
  rows: el<HTMLDivElement>('rows'),
  addInput: el<HTMLInputElement>('add-input'),
  addButton: el<HTMLButtonElement>('add-button'),
  refresh: el<HTMLButtonElement>('refresh'),
  syncStatus: el<HTMLSpanElement>('sync-status'),
  empty: el<HTMLElement>('empty'),
  emptyCopy: el<HTMLParagraphElement>('empty-copy'),
  ghostStrip: el<HTMLDivElement>('ghost-strip'),
  live: el<HTMLParagraphElement>('live'),
  sprocket: document.getElementById('sprocket') as unknown as SVGSVGElement,
};

function t(key: string, ...substitutions: string[]): string {
  // Falls back to the key rather than to a hardcoded sentence: a missing
  // translation should be obvious in review, not silently papered over.
  return chrome.i18n.getMessage(key, substitutions) || key;
}

let numberFormat = new Intl.NumberFormat();

function num(value: number): string {
  return numberFormat.format(value);
}

/** Announces a state change in the polite live region (spec §6.7). */
function announce(text: string): void {
  nodes.live.textContent = text;
}

async function send(message: Message): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

// ---- chrome -----------------------------------------------------------------

/** Builds the sprocket holes to fit the popup height (spec §6.4). */
function buildSprocket(): void {
  const pitch = 26;
  const count = Math.ceil(520 / pitch);
  nodes.sprocket.setAttribute('viewBox', `0 0 16 ${count * pitch}`);
  nodes.sprocket.setAttribute('preserveAspectRatio', 'none');
  for (let i = 0; i < count; i += 1) {
    const hole = document.createElementNS(SVG_NS, 'rect');
    hole.setAttribute('x', '4');
    hole.setAttribute('y', String(i * pitch + 8));
    hole.setAttribute('width', '8');
    hole.setAttribute('height', '11');
    hole.setAttribute('rx', '2');
    // Staggered so the amber runs down the strip rather than pulsing together.
    hole.style.animationDelay = `${(i % 8) * 0.25}s`;
    nodes.sprocket.append(hole);
  }
}

/** The hand-drawn cross: two slightly wobbly strokes (spec §6.5). */
function buildCross(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cross');
  svg.setAttribute('viewBox', '0 0 100 44');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  // Deliberately not straight lines — a grease pencil does not draw straight.
  for (const d of ['M 6 7 C 34 16, 62 28, 94 37', 'M 94 8 C 63 17, 35 27, 6 38']) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('pathLength', '1');
    svg.append(path);
  }
  return svg;
}

function localize(): void {
  const lang = chrome.i18n.getUILanguage();
  document.documentElement.lang = lang;
  numberFormat = new Intl.NumberFormat(lang);
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = node.dataset.i18nAria;
    if (key) node.setAttribute('aria-label', t(key));
  }
  nodes.addInput.placeholder = t('popupAddPlaceholder');
}

// ---- rendering --------------------------------------------------------------

function rowNote(view: PlaylistView): string | null {
  // A hidden playlist with no index is L0: its card goes, its videos stay. That
  // is legitimate, and saying so beats letting the user guess (spec §4.0).
  if (view.hidden && view.layer === 'L0') return t('popupLayerCardOnly');
  if (view.hidden && view.partial) {
    return t('popupPartial', num(view.indexedCount), num(view.itemCount ?? view.indexedCount));
  }
  return null;
}

function buildRow(view: PlaylistView, position: number): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row';
  row.setAttribute('role', 'switch');
  row.setAttribute('aria-checked', String(view.hidden));
  row.dataset.playlistId = view.id;

  const no = document.createElement('span');
  no.className = 'row-no';
  no.textContent = String(position).padStart(2, '0');

  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = view.title; // textContent only — spec §7 rule 2

  const count = document.createElement('span');
  count.className = 'row-count';
  count.textContent = t('popupRowVideos', num(view.indexedCount));

  row.append(no, title, count);

  const note = rowNote(view);
  if (note !== null) {
    const noteEl = document.createElement('span');
    noteEl.className = 'row-note';
    noteEl.textContent = note;
    row.append(noteEl);
  }

  row.append(buildCross());
  return row;
}

/**
 * Three unexposed frames, one already carrying a faint mark. Shown once, on
 * first open, so the gesture is demonstrated rather than explained.
 */
function buildGhostStrip(): void {
  if (nodes.ghostStrip.childElementCount > 0) return;
  for (let i = 0; i < 3; i += 1) {
    const ghost = document.createElement('div');
    ghost.className = 'ghost';

    const no = document.createElement('span');
    no.className = 'ghost-no';
    no.textContent = String(i + 1).padStart(2, '0');

    const bar = document.createElement('span');
    bar.className = 'ghost-bar';

    ghost.append(no, bar);
    if (i === 0) ghost.append(buildCross());
    nodes.ghostStrip.append(ghost);
  }
}

function renderEmpty(state: PopupState): void {
  const isEmpty = state.playlists.length === 0;
  if (isEmpty) buildGhostStrip();
  nodes.empty.hidden = !isEmpty;
  nodes.rows.hidden = isEmpty;
  nodes.emptyCopy.textContent = isEmpty ? t('popupEmpty') : '';
}

function formatSyncStatus(state: PopupState): string {
  if (state.syncing) return t('popupSyncing');
  if (state.lastSyncedAt === null) return t('popupNeverSynced');
  const time = new Date(state.lastSyncedAt).toLocaleTimeString(chrome.i18n.getUILanguage(), {
    hour: '2-digit',
    minute: '2-digit',
  });
  return t('popupLastSync', time);
}

function render(state: PopupState): void {
  nodes.master.setAttribute('aria-checked', String(state.enabled));

  // Teaching on first open, out of the way afterwards: the line says what the
  // extension does while there is nothing to count, and becomes the count once
  // there is.
  nodes.subtitle.textContent =
    state.playlists.length === 0
      ? t('popupExplainer')
      : t('popupSubtitle', num(state.hiddenPlaylistCount), num(state.hiddenVideoCount));

  renderEmpty(state);

  nodes.rows.textContent = '';
  state.playlists.forEach((view, i) => nodes.rows.append(buildRow(view, i + 1)));

  nodes.syncStatus.textContent = formatSyncStatus(state);
  document.body.classList.toggle('is-syncing', state.syncing);
}

async function load(): Promise<void> {
  const res = (await send({ type: 'popup:state' })) as { ok: true; state: PopupState } | null;
  if (!res || res.ok !== true) {
    nodes.message.textContent = t('popupSettingsError');
    nodes.message.hidden = false;
    nodes.message.classList.add('is-error');
    return;
  }
  nodes.message.classList.remove('is-error');
  render(res.state);
}

// ---- actions ----------------------------------------------------------------

async function toggleRow(row: HTMLElement): Promise<void> {
  const playlistId = row.dataset.playlistId;
  if (!playlistId) return;
  const next = row.getAttribute('aria-checked') !== 'true';
  // Flip immediately so the cross animates from the click, not from the
  // round-trip; the reload below is authoritative.
  row.setAttribute('aria-checked', String(next));
  await send({ type: 'playlists:toggle', playlistId, hidden: next });
  announce(t(next ? 'popupAnnounceHidden' : 'popupAnnounceShown'));
  await load();
}

async function addFromInput(): Promise<void> {
  const raw = nodes.addInput.value;
  const playlistId = parsePlaylistInput(raw);
  if (playlistId === null) {
    // Says what happened and what to do — no apology (spec §6.6).
    nodes.message.textContent = t('popupAddInvalid');
    nodes.message.hidden = false;
    nodes.message.classList.add('is-error');
    announce(t('popupAddInvalid'));
    return;
  }
  nodes.message.classList.remove('is-error');
  nodes.addInput.value = '';
  await send({ type: 'playlists:add', playlistId });
  announce(t('popupAnnounceAdded'));
  await load();
}

interface SyncOutcome {
  ok: boolean;
  reason?: string;
}

async function refresh(): Promise<void> {
  nodes.refresh.disabled = true;
  nodes.refresh.textContent = t('actionRefreshing');
  document.body.classList.add('is-syncing');
  announce(t('actionRefreshing'));

  // The worker owns the whole chain: find a tab, hand off the job, persist what
  // comes back. Calling a content script from here would index nothing.
  const outcome = (await send({ type: 'sync:start' })) as SyncOutcome | null;

  document.body.classList.remove('is-syncing');
  nodes.refresh.disabled = false;

  if (!outcome || outcome.ok !== true) {
    const key =
      outcome?.reason === 'no-tab'
        ? 'popupNoTab'
        : outcome?.reason === 'nothing-to-sync'
          ? 'popupEmpty'
          : 'popupError';
    nodes.refresh.textContent = t('actionRefresh');
    nodes.message.textContent = t(key);
    nodes.message.hidden = false;
    nodes.message.classList.add('is-error');
    announce(t(key));
    await load();
    return;
  }

  nodes.refresh.textContent = t('actionRefreshed');
  announce(t('actionRefreshed'));
  await load();
  setTimeout(() => {
    nodes.refresh.textContent = t('actionRefresh');
  }, REFRESHED_HOLD_MS);
}

async function toggleMaster(): Promise<void> {
  const next = nodes.master.getAttribute('aria-checked') !== 'true';
  nodes.master.setAttribute('aria-checked', String(next));
  await send({ type: 'settings:set', patch: { enabled: next } });
  announce(t(next ? 'popupAnnounceEnabled' : 'popupAnnounceDisabled'));
  await load();
}

// ---- wiring -----------------------------------------------------------------

function start(): void {
  localize();
  buildSprocket();

  nodes.master.addEventListener('click', () => void toggleMaster());
  nodes.refresh.addEventListener('click', () => void refresh());
  nodes.addButton.addEventListener('click', () => void addFromInput());
  nodes.addInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void addFromInput();
  });

  // One listener for the whole strip: rows are replaced on every render.
  nodes.rows.addEventListener('click', (event) => {
    const row = (event.target as Element | null)?.closest<HTMLElement>('.row');
    if (row) void toggleRow(row);
  });

  // The worker is the only writer, so its writes are the change signal — this
  // keeps the popup live while a sync is running.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void load();
  });

  void load();
}

start();
