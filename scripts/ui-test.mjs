/**
 * Browser-level verification of the storyboard -> worker -> gallery flow.
 *
 * The API-level suite (scripts/e2e-test.sh) proves the server contracts. This
 * proves the UI actually drives them: React state, checkpoint discovery, shot
 * submission, status polling, localStorage persistence across a reload, and the
 * gallery's inline video element really loading frames.
 *
 * Requires the app on :3000 and the mock worker on :8188.
 */

import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP || 'http://127.0.0.1:3000';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', 'docs', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

/* Start from a pristine durable record: the storage adapter must not carry
   boards or jobs in from an earlier run, or fresh-browser assertions would
   adopt someone else's sequence. */
rmSync(path.join(HERE, '..', '.motiona-data'), { recursive: true, force: true });

let pass = 0;
let fail = 0;
const ok = (name) => { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m  ${name}`); };
const bad = (name, detail = '') => { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `\n     ${detail}` : ''}`); };
const check = (name, actual, expected) =>
  String(actual) === String(expected) ? ok(name) : bad(name, `expected '${expected}', got '${actual}'`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    // this sandbox has ~2 GB RAM: keep Chromium's footprint small enough that
    // next-server + worker + browser fit without swap-thrashing the navigations
    '--disable-gpu', '--mute-audio', '--renderer-process-limit=2',
    '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  ],
});


const page = await browser.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120000);
await page.setViewport({ width: 1440, height: 1000 });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('requestfailed', (req) => {
  const url = req.url();
  // The app intentionally probes ComfyUI; a failed probe is not a page defect.
  if (url.includes('8188')) return;
  // Cancelling an in-flight media load when navigating away is normal browser
  // behaviour, not a broken subresource.
  if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
  failedRequests.push(`${url} — ${req.failure()?.errorText}`);
});

try {
  /* ------------------------------------------------------------- age gate */
  section('1. Storyboard loads and hydrates');
  await page.goto(`${APP}/storyboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // The gate mounts with hydration; wait for it OR the content so a slow
  // first compile cannot race the presence check.
  await page.waitForFunction(
    () => Boolean(document.querySelector('.ageEnter') || document.querySelector('.sequencePanel')),
    { timeout: 30000 },
  );
  const gate = await page.$('.ageEnter');
  if (gate) {
    await gate.click();
    await sleep(400);
    ok('age gate passed');
  } else {
    ok('age gate already satisfied');
  }

  await page.waitForSelector('.sequencePanel', { timeout: 15000 });
  ok('sequence panel rendered');

  const heading = await page.$eval('.productIntro h1', (el) => el.textContent.trim());
  check('page heading', heading, 'Direct the sequence.');

  /* ------------------------------------ age gate decline path (fresh profile) */
  {
    const cleanContext = await browser.createBrowserContext();
    const fresh = await cleanContext.newPage();
    await fresh.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await fresh.waitForSelector('.ageEnter', { timeout: 45000 })
      .then(() => ok('fresh profile is gated before any content'))
      .catch(() => bad('fresh profile is gated before any content', 'no gate'));

    const declineLabel = await fresh.$eval('.ageLeave', (el) => el.textContent.trim()).catch(() => '');
    /under 18/.test(declineLabel)
      ? ok(`decline choice is explicit ("${declineLabel}")`)
      : bad('decline choice is explicit', declineLabel);

    await fresh.click('.ageLeave');
    const left = await fresh
      .waitForFunction(() => window.location.href === 'about:blank', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    left
      ? ok('declining leaves the site entirely — homepage never loads')
      : bad('declining leaves the site entirely', await fresh.evaluate(() => window.location.href).catch(() => '?'));

    await cleanContext.close();
  }

  /* ------------------------------------------- checkpoint discovery in UI */
  section('2. ComfyUI checkpoint discovery reaches the UI');
  let checkpointOptions = [];
  for (let i = 0; i < 20; i += 1) {
    checkpointOptions = await page.$$eval('.sequenceFields select', (selects) => {
      const cp = selects[2];
      return cp ? [...cp.options].map((o) => o.value).filter(Boolean) : [];
    });
    if (checkpointOptions.length > 0) break;
    await sleep(500);
  }
  checkpointOptions.length > 0
    ? ok(`checkpoint picker populated (${checkpointOptions.length} models: ${checkpointOptions.join(', ')})`)
    : bad('checkpoint picker populated', `got ${JSON.stringify(checkpointOptions)}`);

  const seed = await page.$eval('.seedRow code', (el) => el.textContent.trim());
  /^\d+$/.test(seed) ? ok(`master seed generated (${seed})`) : bad('master seed generated', seed);

  /* ------------------------------------------------------- compose a board */
  section('3. Composing a sequence');
  await page.evaluate(() => {
    const set = (el, value) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const fields = document.querySelectorAll('.sequenceFields');
    set(fields[0].querySelector('input'), 'Harbour sequence');
    const selects = document.querySelectorAll('.sequenceFields select');
    set(selects[0], '16:9');
    set(selects[2], selects[2].options[selects[2].options.length - 1].value);

    const identity = fields[1];
    set(identity.querySelector('input'), 'Navigator Sable');
    const areas = identity.querySelectorAll('textarea');
    set(areas[0], 'tall, silver-streaked braid, weathered amber coat');
    set(areas[1], 'painterly cel shading, muted teal and amber grade');
  });
  await sleep(300);

  const titleValue = await page.$eval('.sequenceFields input', (el) => el.value);
  check('title input took the value', titleValue, 'Harbour sequence');

  // The identity group is the second .sequenceFields block; a bare
  // '.sequenceFields label input' would match the Title field first.
  const charName = await page.evaluate(
    () => document.querySelectorAll('.sequenceFields')[1]?.querySelector('input')?.value ?? '',
  );
  check('character anchor persisted into state', charName, 'Navigator Sable');

  const traits = await page.evaluate(
    () => document.querySelectorAll('.sequenceFields')[1]?.querySelectorAll('textarea')[0]?.value ?? '',
  );
  check('appearance traits persisted into state', traits, 'tall, silver-streaked braid, weathered amber coat');

  /* ----------------------------------------------------------- add a shot */
  await page.evaluate(() => {
    [...document.querySelectorAll('.sequenceActions .primary')].find((b) => /Add shot/.test(b.textContent))?.click();
  });
  await page.waitForSelector('.shot', { timeout: 8000 });
  ok('shot card added to the timeline');

  await page.evaluate(() => {
    const area = document.querySelector('.shotFields textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, 'walks along a rain-slick dock at dusk, gulls overhead');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);

  const frames = await page.$eval('.frameCount', (el) => el.textContent.trim());
  /frames/.test(frames) ? ok(`frame count derived from duration (${frames})`) : bad('frame count derived', frames);

  const badgeBefore = await page.$eval('.shotStatus', (el) => el.textContent.trim());
  check('shot starts as Draft', badgeBefore, 'Draft');

  await page.screenshot({ path: path.join(SHOTS, '01-storyboard-composed.png'), fullPage: true });

  /* ------------------------------------------------------- render the shot */
  section('4. Rendering through the UI');
  await page.evaluate(() => {
    document.querySelector('.shotActions .primary')?.click();
  });

  // The notice confirms submission and reports the prompt_id.
  let noticeText = '';
  for (let i = 0; i < 20; i += 1) {
    noticeText = await page.$eval('.sequenceNotice span', (el) => el.textContent.trim()).catch(() => '');
    if (noticeText) break;
    await sleep(400);
  }
  /queued/i.test(noticeText)
    ? ok(`submission reported: "${noticeText.slice(0, 90)}"`)
    : bad('submission reported', noticeText || 'no notice appeared');

  const badgeQueued = await page.$eval('.shotStatus', (el) => el.textContent.trim());
  ['Queued', 'Rendering', 'Complete'].includes(badgeQueued)
    ? ok(`status left Draft (now "${badgeQueued}")`)
    : bad('status left Draft', badgeQueued);

  const promptTag = await page.$eval('.promptIdTag', (el) => el.textContent.trim()).catch(() => '');
  /^[0-9a-f]{8}$/.test(promptTag)
    ? ok(`prompt_id shown on the shot (${promptTag})`)
    : bad('prompt_id shown on the shot', promptTag || 'absent');

  /* ------------------------------------- wait for the poller to finish it */
  section('5. In-page polling reaches a terminal state');
  let finalBadge = '';
  for (let i = 0; i < 40; i += 1) {
    finalBadge = await page.$eval('.shotStatus', (el) => el.textContent.trim()).catch(() => '');
    if (finalBadge === 'Complete' || finalBadge === 'Failed') break;
    await sleep(1500);
  }
  check('shot reached Complete via polling', finalBadge, 'Complete');

  await page.screenshot({ path: path.join(SHOTS, '02-storyboard-complete.png'), fullPage: true });

  /* ----------------------------------------------------- persistence test */
  section('6. Persistence across a full reload');
  const stored = await page.evaluate(() => localStorage.getItem('motiona-storyboards'));
  let parsed = null;
  try { parsed = JSON.parse(stored || 'null'); } catch { /* ignore */ }
  Array.isArray(parsed) && parsed.length > 0
    ? ok(`board written to localStorage (${parsed.length} board(s))`)
    : bad('board written to localStorage', String(stored).slice(0, 120));

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.shot', { timeout: 30000 }).catch(() => {});

  const restoredShots = await page.$$eval('.shot', (els) => els.length).catch(() => 0);
  check('shot survived the reload', restoredShots, 1);

  const restoredTitle = await page.$eval('.sequenceFields input', (el) => el.value).catch(() => '');
  check('title survived the reload', restoredTitle, 'Harbour sequence');

  const restoredStatus = await page.$eval('.shotStatus', (el) => el.textContent.trim()).catch(() => '');
  check('shot status survived the reload', restoredStatus, 'Complete');

  const serverBoards = await page.evaluate(async () => {
    const r = await fetch('/api/storyboards');
    return r.ok ? (await r.json()).count : -1;
  });
  serverBoards > 0
    ? ok(`board also persisted server-side (${serverBoards} record(s))`)
    : bad('board also persisted server-side', String(serverBoards));

  /* --------------------------------------------------------------- gallery */
  section('7. Gallery shows the rendered output');
  await page.goto(`${APP}/gallery`, { waitUntil: 'domcontentloaded', timeout: 120000 });

  let cards = 0;
  for (let i = 0; i < 20; i += 1) {
    cards = await page.$$eval('.jobCard', (els) => els.length).catch(() => 0);
    if (cards > 0) break;
    await sleep(600);
  }
  cards > 0 ? ok(`job card rendered (${cards})`) : bad('job card rendered', 'none');

  const storageLabel = await page.$eval('.privacyBadge', (el) => el.textContent.trim()).catch(() => '');
  /Local disk store|Object storage/.test(storageLabel)
    ? ok(`storage adapter labelled honestly ("${storageLabel}")`)
    : bad('storage adapter labelled honestly', storageLabel);

  const videoInfo = await page.evaluate(async () => {
    const video = document.querySelector('.jobPreview video');
    if (!video) return null;
    const src = video.getAttribute('src') || '';
    // Wait for metadata so we know the file is a real, decodable video.
    const ready = await new Promise((resolve) => {
      if (video.readyState >= 1) return resolve(true);
      const t = setTimeout(() => resolve(false), 15000);
      video.addEventListener('loadedmetadata', () => { clearTimeout(t); resolve(true); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(t); resolve(false); }, { once: true });
      video.load();
    });
    return { src, ready, duration: Number.isFinite(video.duration) ? video.duration : 0, w: video.videoWidth, h: video.videoHeight };
  });

  videoInfo
    ? ok('video element present in the gallery')
    : bad('video element present in the gallery', 'none found');

  if (videoInfo) {
    /^\/api\/comfyui\/view/.test(videoInfo.src)
      ? ok(`src is the app proxy (${videoInfo.src.slice(0, 60)}…)`)
      : bad('src is the app proxy', videoInfo.src);
    videoInfo.ready ? ok('video metadata decoded in the browser') : bad('video metadata decoded in the browser', 'error or timeout');
    videoInfo.duration > 0
      ? ok(`playable: ${videoInfo.duration.toFixed(2)}s at ${videoInfo.w}x${videoInfo.h}`)
      : bad('playable duration', String(videoInfo.duration));
  }

  const statusChip = await page.$eval('.jobCard .shotStatus', (el) => el.textContent.trim()).catch(() => '');
  check('gallery job status is completed', statusChip, 'completed');

  const metaText = await page.$$eval('.jobMeta dd', (els) => els.map((e) => e.textContent.trim()));
  metaText.some((t) => /^\d+$/.test(t)) ? ok(`seed recorded on the job (${metaText.join(' | ').slice(0, 70)})`) : bad('seed recorded on the job', metaText.join(' | '));

  /* ------------------------------------------- dev worker honesty banner */
  const banner = await page.$eval('.devWorkerNotice', (el) => el.textContent.trim()).catch(() => '');
  /Offline dev worker connected/.test(banner)
    ? ok('gallery labels the mock backend explicitly')
    : bad('gallery labels the mock backend explicitly', banner || 'no banner');

  /* --------------------------------------------------- preview modal ----- */
  section('7b. Preview player');
  await page.click('.jobCard .thumbBtn');
  await page.waitForSelector('.previewModal', { timeout: 8000 });
  ok('preview modal opened from the gallery thumbnail');

  const modalInfo = await page.evaluate(async () => {
    const video = document.querySelector('.previewStage video');
    if (!video) return null;
    const ready = await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve(true);
      const t = setTimeout(() => resolve(false), 15000);
      video.addEventListener('loadeddata', () => { clearTimeout(t); resolve(true); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(t); resolve(false); }, { once: true });
    });
    let playing = !video.paused;
    for (let i = 0; i < 15 && !playing; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      playing = !video.paused;
    }
    return {
      ready,
      playing,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      filename: document.querySelector('.previewHead b')?.textContent || '',
      hasDownload: Boolean([...document.querySelectorAll('.previewActions .primary')].find((b) => /Download/.test(b.textContent))),
    };
  });

  modalInfo ? ok('modal player present') : bad('modal player present', 'none');
  if (modalInfo) {
    modalInfo.ready ? ok('modal video decoded frames') : bad('modal video decoded frames', 'timeout/error');
    modalInfo.playing ? ok('modal autoplays (muted, looped)') : bad('modal autoplays', 'paused');
    modalInfo.duration > 0 ? ok(`modal duration ${modalInfo.duration.toFixed(2)}s`) : bad('modal duration', String(modalInfo.duration));
    /\.mp4$/.test(modalInfo.filename) ? ok(`modal names the file (${modalInfo.filename})`) : bad('modal names the file', modalInfo.filename);
    modalInfo.hasDownload ? ok('modal carries a Download action') : bad('modal carries a Download action', 'missing');
  }

  await page.screenshot({ path: path.join(SHOTS, '05-preview-modal.png') });

  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 400));
  (await page.$('.previewModal')) === null
    ? ok('Escape closes the preview modal')
    : bad('Escape closes the preview modal', 'still open');

  /* -------------------------------------------------------- downloader --- */
  section('7c. Animation downloader');
  const downloadDir = path.join(HERE, '..', '.downloads');
  mkdirSync(downloadDir, { recursive: true });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

  await page.click('.jobCardActions .downloadBtn');

  let savedName = '';
  for (let i = 0; i < 30; i += 1) {
    const entries = readdirSync(downloadDir).filter((n) => !n.endsWith('.crdownload'));
    if (entries.length > 0) { savedName = entries[0]; break; }
    await sleep(500);
  }
  /^motiona_.+\.mp4$/.test(savedName)
    ? ok(`download saved with the worker filename (${savedName})`)
    : bad('download saved with the worker filename', savedName || 'nothing landed in ' + downloadDir);

  if (savedName) {
    const size = statSync(path.join(downloadDir, savedName)).size;
    size > 5000 ? ok(`downloaded file is a real video (${size} bytes)`) : bad('downloaded file is a real video', `${size} bytes`);
  }

  await page.screenshot({ path: path.join(SHOTS, '03-gallery.png'), fullPage: true });

  /* --------------------------------------------------------- animate screen */
  section('8. Animate screen');
  await page.goto(`${APP}/animate`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.productIntro', { timeout: 20000 });
  const animateHeading = await page.$eval('.productIntro h1', (el) => el.textContent.trim()).catch(() => '');
  check('animate screen renders', animateHeading, 'Turn shots into motion.');
  const queueDisabled = await page.$eval('.jobLaunch .primary', (el) => el.disabled).catch(() => null);
  check('queue button disabled until a workflow is imported', queueDisabled, true);
  await page.screenshot({ path: path.join(SHOTS, '04-animate.png'), fullPage: true });

  /* ------------------------------------------------- accounts + dashboard */
  section('10. Signup leads to a dashboard');
  await page.goto(`${APP}/signup`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.authForm', { timeout: 15000 });
  await sleep(600); // let hydration attach the controlled-input handlers

  await page.evaluate(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.authForm input');
    set(inputs[0], 'Sable Navigator');
    set(inputs[1], 'sable@example.com');
    set(inputs[2], 'harbour-sequence-18');
    inputs[3].click(); // terms + 18+ attestation
  });
  await page.click('.authSubmit');

  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 20000 })
    .then(() => ok('signup redirects to /dashboard'))
    .catch(async () => bad('signup redirects to /dashboard', await page.evaluate(() => window.location.pathname)));

  await page.waitForSelector('.dashTiles', { timeout: 20000 });
  ok('dashboard rendered');

  const greeting = await page.$eval('.productIntro h1', (el) => el.textContent.trim());
  /Welcome back, Sable/.test(greeting) ? ok(`greeting uses the account name ("${greeting}")`) : bad('greeting uses the account name', greeting);

  const tiles = await page.$$eval('.dashTile', (els) => els.map((e) => e.getAttribute('href')));
  JSON.stringify(tiles) === JSON.stringify(['/studio', '/storyboard', '/animate', '/gallery'])
    ? ok('dashboard navigates to every workspace surface')
    : bad('dashboard navigates to every workspace surface', tiles.join(','));

  await page.screenshot({ path: path.join(SHOTS, '06-dashboard.png'), fullPage: true });

  const chip = await page.$eval('.accountChip', (el) => el.textContent.trim());
  /sable@example.com/.test(chip) ? ok(`account chip shows the signed-in email (${chip})`) : bad('account chip shows the signed-in email', chip);

  /* chip follows onto workspace screens */
  await page.goto(`${APP}/storyboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.accountChip', { timeout: 20000 });
  const chipOnProduct = await page.$eval('.accountChip a', (el) => el.textContent.trim()).catch(() => '');
  /sable@example.com/.test(chipOnProduct)
    ? ok('workspace headers carry the account chip')
    : bad('workspace headers carry the account chip', chipOnProduct);

  /* new board is attributed to the account */
  await page.waitForSelector('.sequencePanel', { timeout: 15000 });
  await sleep(1200); // allow hydrate + debounced save
  const owned = await page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem('motiona-storyboards') || '[]');
    return boards[0]?.owner || '';
  });
  owned === 'sable@example.com' ? ok('new sequences are attributed to the account') : bad('new sequences are attributed to the account', owned);

  /* sign out then guarded redirect */
  await page.goto(`${APP}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.dashFooter .secondary', { timeout: 30000 });
  await page.click('.dashFooter .secondary');
  await page.waitForFunction(() => window.location.pathname === '/', { timeout: 8000 })
    .then(() => ok('sign out returns to the landing page'))
    .catch(async () => bad('sign out returns to the landing page', await page.evaluate(() => window.location.pathname)));

  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 }); // warm the route compile
  await page.goto(`${APP}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.location.pathname === '/login', { timeout: 15000 })
    .then(() => ok('dashboard is guarded — signed-out visitors bounce to /login'))
    .catch(async () => bad('dashboard is guarded', await page.evaluate(() => window.location.pathname)));

  /* login restores the session */
  await page.waitForSelector('.authForm', { timeout: 15000 });
  await sleep(500);
  await page.evaluate(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.authForm input');
    set(inputs[0], 'sable@example.com');
    set(inputs[1], 'harbour-sequence-18');
  });
  await page.click('.authSubmit');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 20000 })
    .then(() => ok('login restores the session and opens the dashboard'))
    .catch(async () => bad('login restores the session', await page.evaluate(() => window.location.pathname)));

  /* wrong password is refused */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('motiona-session') || 'null');
    if (s) localStorage.removeItem('motiona-session');
  });
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.authForm', { timeout: 20000 });
  await sleep(400);
  await page.evaluate(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.authForm input');
    set(inputs[0], 'sable@example.com');
    set(inputs[1], 'wrong-password-1');
  });
  await page.click('.authSubmit');
  await sleep(600);
  const authError = await page.$eval('.authStatus.error', (el) => el.textContent.trim()).catch(() => '');
  /Incorrect password/.test(authError)
    ? ok('wrong password is refused with a clear message')
    : bad('wrong password is refused', authError || 'no error shown');


  /* -------------------------------------------------------- console health */
  section('11. Work survives a cleared browser (server-side records)');
  /* section 10 ended on a deliberately failed login, so sign back in first */
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.authForm', { timeout: 15000 });
  await sleep(500);
  await page.evaluate(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.authForm input');
    set(inputs[0], 'sable@example.com');
    set(inputs[1], 'harbour-sequence-18');
  });
  await page.click('.authSubmit');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 20000 });

  await page.goto(`${APP}/storyboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.sequencePanel', { timeout: 15000 });
  await sleep(800);

  await page.evaluate(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('.sequenceFields label input'), 'Harbour Survivor Cut');
  });
  await sleep(1600); // debounced save -> localStorage AND POST /api/storyboards

  const serverTitles = await page.evaluate(async () => {
    const res = await fetch('/api/storyboards', { cache: 'no-store' });
    const data = await res.json();
    return (data.storyboards || []).map((b) => b.title);
  });
  serverTitles.includes('Harbour Survivor Cut')
    ? ok('renamed sequence reached the server store')
    : bad('renamed sequence reached the server store', serverTitles.join(' | '));

  await page.goto(`${APP}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.dashTiles', { timeout: 20000 });
  await sleep(1200); // allow the server merge to land
  const rowsBeforeWipe = await page.$$eval('.dashRow b', (els) => els.map((e) => e.textContent.trim()));
  rowsBeforeWipe.includes('Harbour Survivor Cut')
    ? ok('dashboard lists the server-backed sequence')
    : bad('dashboard lists the server-backed sequence', rowsBeforeWipe.join(' | '));

  /* wipe the browser: accounts, session, cached boards and cached jobs all go */
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.ageEnter', { timeout: 30000 });
  await page.click('.ageEnter');
  await sleep(600);
  ok('age gate re-appears after a storage wipe (never skipped)');

  await page.goto(`${APP}/signup`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.authForm', { timeout: 15000 });
  await sleep(600);
  await page.evaluate(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.authForm input');
    set(inputs[0], 'Sable Navigator');
    set(inputs[1], 'sable@example.com');
    set(inputs[2], 'harbour-sequence-18');
    inputs[3].click();
  });
  await page.click('.authSubmit');
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 20000 })
    .then(() => ok('re-signup with the same email lands back on the dashboard'))
    .catch(async () => bad('re-signup with the same email lands back on the dashboard',
      await page.evaluate(() => window.location.pathname)));

  await page.waitForSelector('.dashTiles', { timeout: 20000 });
  await sleep(1500); // server merge repopulates the panels
  const rowsAfterWipe = await page.$$eval('.dashRow b', (els) => els.map((e) => e.textContent.trim()));
  rowsAfterWipe.includes('Harbour Survivor Cut')
    ? ok('sequence survived the cleared browser via the server store')
    : bad('sequence survived the cleared browser via the server store', rowsAfterWipe.join(' | ') || 'no rows at all');

  const syncNoteText = await page.$eval('.authDemoNote', (el) => el.textContent);
  /\(synced\)/.test(syncNoteText)
    ? ok('dashboard reports that the server sync completed')
    : bad('dashboard reports that the server sync completed', syncNoteText.trim().slice(0, 90));

  await page.screenshot({ path: path.join(SHOTS, '07-persistence.png'), fullPage: true });

  await page.goto(`${APP}/storyboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.sequencePanel', { timeout: 30000 });
  await sleep(1500);
  const rehydratedTitle = await page.$eval('.sequenceFields label input', (el) => el.value);
  rehydratedTitle === 'Harbour Survivor Cut'
    ? ok('storyboard hydrates the server copy into an empty browser')
    : bad('storyboard hydrates the server copy into an empty browser', rehydratedTitle);


  section('12. Studio chat composer (vs-chat-input)');
  await page.goto(`${APP}/studio?view=chat`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.vs-chat-input', { timeout: 30000 });
  ok('composer renders in the studio chat');

  /* keyboard-complete model picker */
  await page.click('.vs-chat-input-model-btn');
  await page.waitForFunction(() => !document.querySelector('.vs-chat-input-menu')?.hidden, { timeout: 8000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const modelName = await page.$eval('.vs-chat-input-model-name', (el) => el.textContent.trim());
  modelName === 'Loom 3 Deep'
    ? ok('model picker is keyboard-complete (arrows + Enter select)')
    : bad('model picker is keyboard-complete', modelName);

  /* Enter sends, the box clears, and send morphs to stop while busy */
  await page.evaluate(() => {
    window.__sawBusy = false;
    const form = document.querySelector('.vs-chat-input');
    new MutationObserver(() => { if (form.dataset.busy === 'true') window.__sawBusy = true; })
      .observe(form, { attributes: true, attributeFilter: ['data-busy'] });
  });
  await page.click('.vs-chat-input-text');
  await page.keyboard.type('Generate a cinematic portrait of a cyberpunk detective');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.msg.user .msgContent')];
    return msgs.some((m) => m.textContent.includes('cyberpunk'));
  }, { timeout: 10000 })
    .then(() => ok('Enter sends the message into the conversation'))
    .catch(() => bad('Enter sends the message into the conversation'));
  const cleared = await page.$eval('.vs-chat-input-text', (el) => el.value);
  cleared === '' ? ok('the box clears itself on submit') : bad('the box clears itself on submit', cleared);
  const sawBusy = await page.evaluate(() => window.__sawBusy);
  sawBusy ? ok('send morphs to stop while the reply generates') : bad('send morphs to stop while the reply generates');

  /* Esc stops while busy (component contract, driven deterministically) */
  const stopped = await page.evaluate(() => new Promise((resolve) => {
    const form = document.querySelector('.vs-chat-input');
    const textarea = form.querySelector('.vs-chat-input-text');
    form.addEventListener('vs-chat-input:stop', () => resolve({ seen: true, busy: form.vsChatInput.busy }), { once: true });
    form.vsChatInput.setBusy(true);
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    setTimeout(() => resolve({ seen: false, busy: form.vsChatInput.busy }), 1500);
  }));
  stopped.seen && stopped.busy === false
    ? ok('Esc stops a busy generation and the button returns to send')
    : bad('Esc stops a busy generation', JSON.stringify(stopped));

  /* attach a file: chip appears and its upload ring completes */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const tmp = path.join(os.tmpdir(), 'vs-attach.png');
  writeFileSync(tmp, png);
  const fileInput = await page.waitForSelector('.vs-chat-input input[type=file]', { timeout: 8000 });
  await fileInput.uploadFile(tmp);
  await page.waitForSelector('.vs-chat-input-chip', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.vs-chat-input-chip')?.dataset.progress === '1', { timeout: 8000 })
    .then(() => ok('attached file shows a chip and its upload ring completes'))
    .catch(async () => bad('attached file shows a chip and its upload ring completes',
      await page.$eval('.vs-chat-input-chip', (el) => el.dataset.progress).catch(() => 'no chip')));

  /* Backspace in an empty box removes the last file */
  await page.click('.vs-chat-input-text');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.querySelectorAll('.vs-chat-input-chip').length === 0, { timeout: 8000 })
    .then(() => ok('Backspace in an empty box removes the last file'))
    .catch(() => bad('Backspace in an empty box removes the last file'));

  /* send disabled while the box is empty */
  const sendDisabled = await page.$eval('.vs-chat-input-send', (el) => el.disabled);
  sendDisabled ? ok('send stays disabled while the box is empty') : bad('send stays disabled while the box is empty');

  await page.screenshot({ path: path.join(SHOTS, '08-composer.png'), fullPage: true });

  section('9. Console and network health');
  const realErrors = consoleErrors.filter((t) => !/favicon|Download the React DevTools/i.test(t));
  realErrors.length === 0 ? ok('no console errors') : bad('no console errors', realErrors.slice(0, 4).join('\n     '));
  pageErrors.length === 0 ? ok('no uncaught page exceptions') : bad('no uncaught page exceptions', pageErrors.slice(0, 3).join('\n     '));
  failedRequests.length === 0 ? ok('no failed subresource requests') : bad('no failed subresource requests', failedRequests.slice(0, 4).join('\n     '));
} catch (error) {
  bad('test harness threw', error instanceof Error ? error.stack?.split('\n').slice(0, 4).join('\n     ') : String(error));
  await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  console.log(`\n\x1b[1m----------------------------------------\x1b[0m`);
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log(`  screenshots -> ${SHOTS}`);
  console.log(`\x1b[1m----------------------------------------\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}
