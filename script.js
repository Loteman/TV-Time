/* ---------- STATE ---------- */
/* TV mode - the site's interface, full screen, in tv.js / tv.css: on every
   device (remote, mouse, keyboard, touch), unless the address has ?old-ui,
   which keeps the classic desktop / mobile view (the Android TV app, which
   adds "ZapZapApp" to its user agent - "TVTimeApp" in builds from before
   the site was renamed - always gets TV mode). index.html's
   first script decides it before anything is drawn, by marking the body. */
const TV_APP = /ZapZapApp|TVTimeApp/.test(navigator.userAgent);
const TV_MODE = document.body.classList.contains('tv-mode');
/* The TV itself (the app, or ?tv imitating it in a browser): a remote can't
   operate a broadcaster's page, so there only direct streams are offered and
   tested. Computers and phones show broadcaster pages too. */
const TV_DEVICE = TV_MODE && (TV_APP || new URLSearchParams(location.search).has('tv'));

/* What was saved under the site's old name (TV TIME) moves to the new
   keys - once, so nobody loses their favorites or settings. */
try {
  ['favorites', 'status', 'lastChannel', 'tvSettings'].forEach(key => {
    const old = localStorage.getItem('tvtime:' + key);
    if(old === null) return;
    if(localStorage.getItem('zapzap:' + key) === null) localStorage.setItem('zapzap:' + key, old);
    localStorage.removeItem('tvtime:' + key);
  });
} catch(e){}   // storage blocked - nothing to move

let mode = 'tv';               // 'tv' | 'radio'
let currentId = null;
/* Favorites persist in localStorage. First-time visitors (nothing saved yet)
   start with a default set; once the viewer changes their favorites, their
   own list is kept - an empty one included. */
const FAVORITES_KEY = 'zapzap:favorites';
const DEFAULT_FAVORITES = ['kan11', 'keshet12', 'reshet13', 'ch14', 'chinuchit', 'galgalatz', 'galatz'];

function loadFavorites(){
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    if(Array.isArray(saved)) return new Set(saved);
  } catch(e){}   // storage blocked or corrupt - use the defaults
  return new Set(DEFAULT_FAVORITES);
}

function saveFavorites(){
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch(e){}
}

let favorites = loadFavorites();
let showFavOnly = false;
let searchTerm = '';
let brightnessValue = 100;
let filterStatuses = new Set(['ok']);            // 'ok' | 'timeout' | 'blocked'
let filterSources = new Set(['stream', 'site']); // 'stream' (has a direct stream) | 'site' (page only)

/* status: 'idle' | 'testing' | 'ok' | 'blocked' | 'timeout' */
[...TV_CHANNELS, ...RADIO_CHANNELS].forEach(c => c.status = 'idle');

/* The last test results are kept in localStorage, so a returning viewer sees
   the channel statuses immediately while a fresh test runs in the background.
   Results older than STATUS_CACHE_MAX_AGE_MS are ignored. */
const STATUS_CACHE_KEY = 'zapzap:status';
const STATUS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHEABLE_STATUSES = new Set(['ok', 'timeout', 'blocked']);

function loadCachedStatuses(){
  try {
    const saved = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY));
    if(!saved || !saved.channels || Date.now() - saved.savedAt > STATUS_CACHE_MAX_AGE_MS) return;
    [...TV_CHANNELS, ...RADIO_CHANNELS].forEach(c => {
      const s = saved.channels[c.id];
      if(!s || !CACHEABLE_STATUSES.has(s.status)) return;
      c.status = s.status;
      if(c.stream) c.streamOk = s.streamOk;
      if(c.url) c.linkStatus = s.linkStatus;
    });
  } catch(e){}   // storage blocked or corrupt - start untested
}

function saveStatuses(){
  const channels = {};
  [...TV_CHANNELS, ...RADIO_CHANNELS].forEach(c => {
    if(CACHEABLE_STATUSES.has(c.status)){
      channels[c.id] = {status: c.status, streamOk: c.streamOk, linkStatus: c.linkStatus};
    }
  });
  try { localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({savedAt: Date.now(), channels})); } catch(e){}
}

loadCachedStatuses();

/* ---------- ELEMENTS ---------- */
const channelListEl = document.getElementById('channelList');
const playerShell = document.getElementById('playerShell');
const playerEmpty = document.getElementById('playerEmpty');
const loadingOverlay = document.getElementById('loadingOverlay');
const nowPlaying = document.getElementById('nowPlaying');
const npAvatar = document.getElementById('npAvatar');
const npTitle = document.getElementById('npTitle');
const npSub = document.getElementById('npSub');
const npFav = document.getElementById('npFav');
const npOpenNew = document.getElementById('npOpenNew');
const tabTv = document.getElementById('tabTv');
const tabRadio = document.getElementById('tabRadio');
const favToggleMobile = document.getElementById('favToggleMobile');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const filterBtn = document.getElementById('filterBtn');
const filterPanel = document.getElementById('filterPanel');
const filterResetBtn = document.getElementById('filterResetBtn');
const chkOk = document.getElementById('chkOk');
const chkTimeout = document.getElementById('chkTimeout');
const chkBlocked = document.getElementById('chkBlocked');
const chkStream = document.getElementById('chkStream');
const chkSite = document.getElementById('chkSite');
const searchDesktop = document.getElementById('searchDesktop');
const searchMobile = document.getElementById('searchMobile');
const zapPrev = document.getElementById('zapPrev');
const zapNext = document.getElementById('zapNext');
const volumeIcon = document.getElementById('volumeIcon');

function currentList(){ return mode === 'tv' ? TV_CHANNELS : RADIO_CHANNELS; }
function findChannel(id){ return currentList().find(c => c.id === id); }

function initials(name){
  const clean = name.replace(/[^a-zA-Zא-ת0-9]/g,'');
  return clean.slice(0,2).toUpperCase();
}

function avatarLabel(ch){
  return ch.label || (ch.remoteNumber ? String(ch.remoteNumber) : initials(ch.name));
}

/* Fills an avatar box with the channel's label; a longer one (a radio
   station's short name) gets a smaller font so it fits the box. */
function setAvatar(el, ch){
  const label = avatarLabel(ch);
  el.textContent = label;
  el.classList.toggle('avatar-long', label.length > 3);
}

/* ---------- RENDER LIST ---------- */
/* One set of filters (status, source, favorites, search) for both the
   sidebar list and the all-channels page. */
function matchesFilters(c){
  if(!filterStatuses.has(c.status)) return false;
  // a channel with a direct stream plays in the direct player (the page is
  // only its fallback), so it counts as "stream"; the rest are "site"
  if(!filterSources.has(c.stream ? 'stream' : 'site')) return false;
  if(showFavOnly && !favorites.has(c.id)) return false;
  const term = searchTerm.trim().toLowerCase();
  if(term && !matchesSearch(c, term)) return false;
  return true;
}

/* A search finds a channel by its name, or by its channel number (from the
   start: "1" finds 11-16, "13" finds 13) or its avatar label (a station's
   short name, e.g. 88). */
function matchesSearch(c, term){
  return c.name.toLowerCase().includes(term) ||
         (!!c.remoteNumber && String(c.remoteNumber).startsWith(term)) ||
         (!!c.label && c.label.toLowerCase().includes(term));
}

function emptyListMessage(list){
  if(showFavOnly) return 'אין ערוצים במועדפים';
  if(list.some(c => c.status === 'idle' || c.status === 'testing')){
    return 'בודק ערוצים... ערוצים יתווספו לרשימה ברגע שהבדיקה תסתיים';
  }
  return 'לא נמצאו ערוצים התואמים לסינון שנבחר';
}

/* Re-renders every view that lists channels - called on any filter,
   favorite or status change. */
function renderList(){
  renderSidebarList();
  if(viewingAllChannels) renderAllChannelsView();
  if(window.tvRender) tvRender();   // the TV interface (tv.js) has its own channel rows
}

function renderSidebarList(){
  const list = currentList();
  const filtered = list.filter(matchesFilters);

  channelListEl.innerHTML = '';

  if(filtered.length === 0){
    const div = document.createElement('div');
    div.className = 'empty-search';
    div.textContent = emptyListMessage(list);
    channelListEl.appendChild(div);
    return;
  }

  const groups = {};
  filtered.forEach(c => {
    if(!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  });

  Object.keys(groups).forEach(groupName => {
    const label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = groupName;
    channelListEl.appendChild(label);

    groups[groupName].forEach(c => {
      const row = document.createElement('div');
      row.className = 'channel-row' + (c.id === currentId ? ' selected' : '') + (mode==='radio' && c.id===currentId ? ' radio-selected' : '');
      row.dataset.id = c.id;

      const avatar = document.createElement('div');
      avatar.className = 'ch-avatar';
      avatar.style.background = c.color + '33';
      avatar.style.color = c.color;
      setAvatar(avatar, c);

      const nameEl = document.createElement('div');
      nameEl.className = 'ch-name';
      nameEl.textContent = c.name;

      const fav = document.createElement('iconify-icon');
      fav.className = 'ch-fav' + (favorites.has(c.id) ? ' on' : '');
      fav.setAttribute('icon', favorites.has(c.id) ? 'mdi:star' : 'mdi:star-outline');

      fav.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFav(c.id);
      });

      const dot = document.createElement('span');
      dot.className = 'status-dot' + (c.status !== 'idle' ? ' ' + c.status : '');
      dot.title = statusLabel(c.status, c);

      row.appendChild(fav);
      row.appendChild(nameEl);
      row.appendChild(dot);
      row.appendChild(avatar);

      row.addEventListener('click', () => selectChannel(c.id));

      channelListEl.appendChild(row);
    });
  });
}

/* URLs like sites.google.com are wrapper/proxy pages: they always allow
   framing themselves, so the reachability test would always report them
   as "ok" even when the real video embedded inside the wrapper is broken
   or blocked. We can't see past the wrapper's own JS, so these are
   reported as "unverifiable" instead of a false positive. */
function isWrapperUrl(url){
  return !!url && /sites\.google\.com/i.test(url);
}

/* Channels confirmed by hand to often fail in practice (player/JS-level
   errors, DRM/referrer/cookie checks, etc.) even though the top-level page
   itself isn't blocked by X-Frame-Options/CSP. Same-origin policy makes
   this class of failure invisible to a generic client-side reachability
   test, so there's no way to detect it automatically - these IDs are
   flagged manually instead of trusting a false "ok". */
const KNOWN_UNRELIABLE_IDS = new Set(['ch10', 'i24news', 'knesset99']);

function isUnverifiable(ch){
  return isWrapperUrl(ch.url) || KNOWN_UNRELIABLE_IDS.has(ch.id);
}

function statusLabel(s, ch){
  if(ch && ch.stream && ch.streamOk && s === 'ok'){
    return 'השידור הישיר נבדק ועובד';
  }
  if(ch && !ch.url && s === 'blocked'){
    return 'השידור הישיר לא זמין כרגע, ולערוץ הזה אין אתר משדר לגיבוי';
  }
  let text;
  if(ch && isUnverifiable(ch) && s === 'timeout'){
    text = 'לא ניתן לאמת אוטומטית - נצפו כשלים בפועל בערוץ זה (למשל חסימה ברמת קוד ה-JS של האתר) שבדיקת iframe חיצונית לא יכולה לזהות';
  } else {
    switch(s){
      case 'ok': text = 'הערוץ נטען בהצלחה'; break;
      case 'blocked': text = 'הערוץ חוסם הטמעה (iframe)'; break;
      case 'timeout': text = 'לא ברור - נסה שוב או פתח בטאב חדש'; break;
      case 'testing': return 'בודק...';
      default: return 'טרם נבדק';
    }
  }
  // the status shown is the broadcaster page's, since that's what will open
  if(ch && ch.stream && ch.streamOk === false){
    text = 'השידור הישיר לא זמין כרגע, לכן ייפתח אתר המשדר. ' + text;
  }
  return text;
}

/* ---------- REACHABILITY TEST ---------- */
/* Broadcaster page test - best-effort client-side heuristic. Not 100%
   guaranteed on every browser, but reasonably reliable: if the frame actually
   navigates to the target's origin, reading contentWindow.location.href throws
   a cross-origin SecurityError (page works). If the frame stayed on our own
   origin (X-Frame-Options / CSP blocked it), that read succeeds (blocked).
   Caveat: current Chromium shows a blocked or failed frame as a cross-origin
   error page, so there the read throws too and such pages count as "ok" -
   in practice the test mostly catches pages that don't respond in time.
   The frame isn't left to load the whole page: it's polled, and as soon as
   it has navigated away from our origin the answer is known and the frame
   is removed. That keeps the test fast and light enough to run for every
   channel at once. */
const LINK_POLL_MS = 50;

function testLink(ch, timeoutMs){
  if(!ch.url) return Promise.resolve(null);   // stream-only channel
  if(isUnverifiable(ch)) return Promise.resolve('timeout');

  return new Promise(resolve => {
    let settled = false;
    const testFrame = document.createElement('iframe');
    testFrame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
    testFrame.setAttribute('aria-hidden','true');

    const cleanup = (status) => {
      if(settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      testFrame.remove();
      resolve(status);
    };

    // before the navigation commits the frame holds our own about:blank, so
    // the read succeeds; once it's on the target's origin, the read throws
    const poll = setInterval(() => {
      try { testFrame.contentWindow.location.href; }
      catch(e){ cleanup('ok'); }
    }, LINK_POLL_MS);

    testFrame.onload = () => {
      try {
        // if this read succeeds, the frame never left our own origin => blocked
        const href = testFrame.contentWindow.location.href;
        cleanup('blocked');
      } catch(e){
        // security error => frame is on the target's origin => it loaded fine
        cleanup('ok');
      }
    };

    const timer = setTimeout(() => cleanup('timeout'), timeoutMs);

    try{
      testFrame.src = ch.url;
      document.body.appendChild(testFrame);
    }catch(e){
      cleanup('timeout');
    }
  });
}

/* A `stream` is HLS (a .m3u8 playlist, played with hls.js) or a plain
   media stream the browser plays by itself (e.g. MP3 radio). */
function isHls(url){
  return /\.m3u8(\?|$)/i.test(url);
}

async function fetchPlaylist(url, signal){
  const res = await fetch(url, {signal, cache:'no-store'});
  if(!res.ok) throw new Error('HTTP ' + res.status);
  // relative entries resolve against where the playlist really is (after redirects)
  return {text: await res.text(), url: res.url || url};
}

/* Direct stream test - unlike the iframe heuristic this checks the real
   thing. Returns true, false, or 'timeout' when it simply didn't answer in
   time. */
function testStream(ch, timeoutMs){
  return isHls(ch.stream) ? testHlsStream(ch.stream, timeoutMs) : testMediaStream(ch.stream, timeoutMs);
}

/* HLS: the playlist must load (which also proves CORS lets us play it) and
   actually list media segments. */
async function testHlsStream(url, timeoutMs){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let playlist = await fetchPlaylist(url, ctrl.signal);
    if(playlist.text.includes('#EXT-X-STREAM-INF')){
      // master playlist - check the first quality variant too
      const variant = playlist.text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
      playlist = await fetchPlaylist(new URL(variant, playlist.url).href, ctrl.signal);
    }
    return playlist.text.includes('#EXTINF');
  } catch(e){
    if(ctrl.signal.aborted) return 'timeout';
    return false;   // HTTP error or CORS/network block
  } finally {
    clearTimeout(timer);
  }
}

/* A plain media stream never ends, so instead of downloading it, a silent
   media element loads it until the browser knows it can decode it. */
function testMediaStream(url, timeoutMs){
  return new Promise(resolve => {
    const media = new Audio();
    let settled = false;
    const finish = (result) => {
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      media.removeAttribute('src');
      media.load();   // stops the download
      resolve(result);
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    media.muted = true;
    media.preload = 'metadata';
    media.addEventListener('loadedmetadata', () => finish(true));
    media.addEventListener('error', () => finish(false));
    media.src = url;
  });
}

async function testOneChannel(ch, timeoutMs){
  // a cached result stays on screen until the fresh one replaces it
  if(ch.status === 'idle'){
    ch.status = 'testing';
    renderList();
  }

  // the TV itself never offers a broadcaster page, so it doesn't load one
  // to test it - the page counts as unverified there
  const [streamResult, linkStatus] = await Promise.all([
    ch.stream ? testStream(ch, timeoutMs) : null,
    TV_DEVICE ? (ch.url ? 'timeout' : null) : testLink(ch, timeoutMs),
  ]);
  const streamOk = streamResult === null ? null : streamResult === true;
  ch.streamOk = streamOk;
  ch.linkStatus = linkStatus;
  // the player tries a working stream first, otherwise the viewer gets the
  // broadcaster page - so that's the status that counts. A stream-only
  // channel whose stream is down has nothing to show.
  ch.status = streamOk ? 'ok' : (linkStatus || 'blocked');
  renderList();
  saveStatuses();

  if(streamResult === 'timeout') recheckStream(ch, RECHECK_TRIES);
  if(linkStatus === 'timeout' && !isUnverifiable(ch) && !TV_DEVICE) recheckLink(ch, RECHECK_TRIES);
}

/* A check that was only slow (e.g. while the page itself was loading, or on
   a slow TV box) gets more, unhurried tries in the background. They run a few
   at a time - all at once they'd slow each other down again on a weak
   device - and aren't awaited, so the run's progress still finishes on time. */
const RECHECK_TRIES = 3;
const RECHECK_CONCURRENCY = 4;
const recheckQueue = [];
let rechecksRunning = 0;

function queueRecheck(job){
  recheckQueue.push(job);
  runRechecks();
}

function runRechecks(){
  while(rechecksRunning < RECHECK_CONCURRENCY && recheckQueue.length){
    rechecksRunning++;
    recheckQueue.shift()().finally(() => {
      rechecksRunning--;
      runRechecks();
    });
  }
}

function recheckStream(ch, triesLeft){
  queueRecheck(async () => {
    const result = await testStream(ch, RECHECK_TIMEOUT_MS);
    if(result === 'timeout' && triesLeft > 1) recheckStream(ch, triesLeft - 1);
    if(result !== true || ch.streamOk) return;
    ch.streamOk = true;
    ch.status = 'ok';
    renderList();
    saveStatuses();
  });
}

function recheckLink(ch, triesLeft){
  queueRecheck(async () => {
    const result = await testLink(ch, RECHECK_TIMEOUT_MS);
    if(result === 'timeout' && triesLeft > 1) recheckLink(ch, triesLeft - 1);
    if(result === 'timeout' || ch.linkStatus !== 'timeout') return;
    ch.linkStatus = result;
    if(!ch.streamOk) ch.status = result;
    renderList();
    saveStatuses();
  });
}

const statusProgress = document.getElementById('statusProgress');
const statusProgressText = document.getElementById('statusProgressText');
let testRunId = 0;               // a newer run (e.g. the retest button) supersedes an older one
const testsInFlight = new Set();  // ids being tested right now, by any run

/* Both checks of a channel share this budget, so a whole run takes at most
   about this long - whatever hasn't answered by then counts as "unclear". */
const TEST_TIMEOUT_MS = 3000;
const RECHECK_TIMEOUT_MS = 10000;

async function testChannels(list){
  const runId = ++testRunId;
  let done = 0;
  const showProgress = () => {
    if(runId === testRunId) statusProgressText.textContent = `בודק סטטוס ערוצים... ${done}/${list.length}`;
  };

  statusProgress.hidden = false;
  showProgress();
  // all channels at once; favorites are started first
  const ordered = [...list.filter(c => favorites.has(c.id)), ...list.filter(c => !favorites.has(c.id))];
  await Promise.all(ordered.map(async ch => {
    testsInFlight.add(ch.id);
    try {
      await testOneChannel(ch, TEST_TIMEOUT_MS);
    } finally {
      testsInFlight.delete(ch.id);
    }
    done++;
    showProgress();
  }));
  if(runId === testRunId) statusProgress.hidden = true;
}

/* Every channel, TV and radio, is tested in parallel once when the site
   loads; switching tabs only shows results that are already there. Each
   channel is tested once per run, and one that an earlier run is still
   testing isn't queued again (its fresh result is on the way). The TV itself
   shows only channels with a direct stream, so it tests only those. */
function runAllTests(){
  testChannels([...TV_CHANNELS, ...RADIO_CHANNELS]
    .filter(c => (!TV_DEVICE || c.stream) && !testsInFlight.has(c.id)));
}

document.getElementById('retestBtn').addEventListener('click', () => {
  [...TV_CHANNELS, ...RADIO_CHANNELS].forEach(c => {
    if(!testsInFlight.has(c.id)) c.status = 'idle';
  });
  renderList();
  runAllTests();
});

function toggleFav(id){
  if(favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  renderList();
  if(id === currentId) updateNowPlayingFavIcon();
}

function updateNowPlayingFavIcon(){
  const icon = npFav.querySelector('iconify-icon');
  const on = favorites.has(currentId);
  icon.setAttribute('icon', on ? 'mdi:star' : 'mdi:star-outline');
  npFav.classList.toggle('on', on);
}

/* ---------- PLAYER ----------
   Channels with a `stream` play in our own <video> (hls.js, or native HLS on
   Safari): real volume and mute, no embed blocking. If the stream doesn't
   start or dies, the player falls back to the broadcaster's page (`url`) in
   an iframe, and the viewer can switch between the two from the now-playing
   bar at any time. */
const playerVideo = document.getElementById('playerVideo');
const playerToast = document.getElementById('playerToast');
const sourceToggle = document.getElementById('sourceToggle');
const STREAM_START_TIMEOUT_MS = 15000;

let currentSource = null;   // 'stream' | 'link' | null
let hls = null;
let loadSeq = 0;            // bumped on every load so callbacks of an older load are ignored
let streamStartTimer = null;
let overlayTimer = null;
let toastTimer = null;

/* Radio has no picture: while a station plays in the direct player, the
   screen shows the station (its equalizer moves while sound plays) instead
   of a black video. */
const radioArt = document.getElementById('radioArt');
const radioArtAvatar = document.getElementById('radioArtAvatar');
const radioArtName = document.getElementById('radioArtName');

function showRadioArt(ch){
  // the solid base layer keeps the (empty) video underneath from showing through
  radioArt.style.background = `radial-gradient(circle at 50% 38%, ${ch.color}45, #0b0e13 72%), #0b0e13`;
  setAvatar(radioArtAvatar, ch);
  radioArtAvatar.style.background = ch.color + '33';
  radioArtAvatar.style.color = ch.color;
  radioArtName.textContent = ch.name;
  radioArt.classList.add('paused');
  radioArt.hidden = false;
}

function showToast(text){
  playerToast.textContent = text;
  playerToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => playerToast.classList.remove('show'), 5000);
}

function applyBrightness(){
  // no filter at all at 100%: even a neutral one can keep weaker devices
  // (TV boxes) from playing the video on their hardware video layer
  const filter = brightnessValue === 100 ? '' : `brightness(${brightnessValue}%)`;
  playerVideo.style.filter = filter;
  const iframe = playerShell.querySelector('iframe');
  if(iframe) iframe.style.filter = filter;
}

function stopPlayback(){
  loadSeq++;
  currentSource = null;
  clearTimeout(streamStartTimer);
  clearTimeout(overlayTimer);
  clearTimeout(toastTimer);
  playerToast.classList.remove('show');
  if(hls){ hls.destroy(); hls = null; }
  playerVideo.pause();
  playerVideo.removeAttribute('src');
  playerVideo.load();
  playerVideo.hidden = true;
  radioArt.hidden = true;
  const oldFrame = playerShell.querySelector('iframe');
  if(oldFrame) oldFrame.remove();
  linkStopped = false;
}

function startLink(ch){
  currentSource = 'link';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
  iframe.setAttribute('allowfullscreen', 'true');
  // in the TV interface, focus inside a cross-origin page would trap the
  // arrow keys (a click into it still focuses it)
  if(TV_MODE) iframe.tabIndex = -1;
  iframe.src = ch.url;
  playerShell.insertBefore(iframe, playerShell.firstChild);
  applyBrightness();
  overlayTimer = setTimeout(() => loadingOverlay.classList.add('hide'), 1400);
}

function playVideo(seq){
  playerVideo.play().catch(err => {
    if(seq !== loadSeq || err.name !== 'NotAllowedError' || playerVideo.muted) return;
    // the browser blocked autoplay with sound - start muted rather than not at all
    playerVideo.muted = true;
    autoMuted = true;
    playerVideo.play().catch(() => {});
    showToast(TV_MODE ? 'הדפדפן חסם ניגון עם קול - לחיצה או מקש יפעילו אותו'
                      : 'הדפדפן חסם ניגון עם קול - לחצו על הרמקול כדי להפעיל את הקול');
  });
}

function startStream(ch){
  currentSource = 'stream';
  const seq = loadSeq;
  const fail = () => { if(seq === loadSeq && currentSource === 'stream') onStreamFailed(ch); };

  playerVideo.hidden = false;
  playerVideo.volume = volumeValue / 100;
  playerVideo.muted = isMuted;
  applyBrightness();
  if(RADIO_CHANNELS.includes(ch)) showRadioArt(ch);
  streamStartTimer = setTimeout(fail, STREAM_START_TIMEOUT_MS);

  if(!isHls(ch.stream)){
    playerVideo.src = ch.stream;   // a plain media stream (e.g. MP3 radio) - played natively
    playVideo(seq);
  } else if(window.Hls && Hls.isSupported()){
    const player = new Hls();
    hls = player;
    let recoveredOnce = false;
    player.on(Hls.Events.ERROR, (_, data) => {
      if(!data.fatal) return;
      if(data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredOnce){
        recoveredOnce = true;
        player.recoverMediaError();
        return;
      }
      fail();
    });
    player.on(Hls.Events.MANIFEST_PARSED, () => playVideo(seq));
    player.loadSource(ch.stream);
    player.attachMedia(playerVideo);
  } else if(playerVideo.canPlayType('application/vnd.apple.mpegurl')){
    playerVideo.src = ch.stream;   // Safari plays HLS natively
    playVideo(seq);
  } else {
    fail();
  }
}

const playerEmptyIcon = playerEmpty.querySelector('iconify-icon');
const playerEmptyText = playerEmpty.querySelector('div');
const PLAYER_EMPTY_DEFAULT = {icon: playerEmptyIcon.getAttribute('icon'), text: playerEmptyText.textContent};

function showPlayerMessage(text, icon){
  playerEmptyIcon.setAttribute('icon', icon);
  playerEmptyText.textContent = text;
  playerEmpty.style.display = 'flex';
}

/* The stream didn't start or died: fall back to the broadcaster's page, or -
   for a stream-only channel, and always on the TV itself, which never shows
   broadcaster pages - say it's unavailable right now. In the TV interface a
   failed start first gets one automatic retry: a TV box that just woke up
   may still be connecting. */
const STREAM_RETRY_DELAY_MS = 2000;

function onStreamFailed(ch){
  ch.streamOk = false;
  ch.status = ch.url ? (ch.linkStatus || 'timeout') : 'blocked';
  stopPlayback();
  if(ch.url && !TV_DEVICE){
    loadingOverlay.classList.remove('hide');
    startLink(ch);
    showToast('השידור הישיר לא זמין כרגע - עברנו לאתר המשדר');
  } else if(TV_MODE && !ch.retriedStream){
    ch.retriedStream = true;
    setTimeout(() => {
      if(currentId === ch.id && !currentSource) selectChannel(ch.id, 'stream');
    }, STREAM_RETRY_DELAY_MS);
  } else {
    loadingOverlay.classList.add('hide');
    showPlayerMessage('השידור של הערוץ הזה לא זמין כרגע', 'mdi:television-off');
  }
  updateSourceToggle();
  updateVolumeUI();
  renderList();
  saveStatuses();
}

// the radio equalizer moves only while sound actually plays
['pause', 'waiting', 'emptied'].forEach(type => {
  playerVideo.addEventListener(type, () => radioArt.classList.add('paused'));
});

playerVideo.addEventListener('playing', () => {
  if(currentSource !== 'stream') return;
  clearTimeout(streamStartTimer);
  loadingOverlay.classList.add('hide');
  radioArt.classList.remove('paused');
  const ch = findChannel(currentId);
  if(ch) ch.retriedStream = false;   // a later failure gets its own automatic retry
  if(ch && !ch.streamOk){
    ch.streamOk = true;
    ch.status = 'ok';
    renderList();
    saveStatuses();
  }
});

// native (Safari) playback errors - hls.js reports its own through Hls.Events.ERROR
playerVideo.addEventListener('error', () => {
  if(currentSource === 'stream' && !hls) onStreamFailed(findChannel(currentId));
});

/* source: 'stream' | 'link' | undefined (= stream if it isn't known to be down) */
function selectChannel(id, source){
  const ch = findChannel(id);
  if(!ch) return;
  currentId = id;
  if(!ch.stream) source = 'link';
  // stream-only, or on the TV itself (no broadcaster pages there): always worth a (re)try
  else if(!ch.url || TV_DEVICE) source = 'stream';
  else if(!source) source = ch.streamOk === false ? 'link' : 'stream';

  stopPlayback();
  playerEmpty.style.display = 'none';
  loadingOverlay.classList.remove('hide');
  if(source === 'stream') startStream(ch);
  else startLink(ch);

  nowPlaying.style.display = 'flex';
  npAvatar.style.background = ch.color + '33';
  npAvatar.style.color = ch.color;
  setAvatar(npAvatar, ch);
  npTitle.textContent = ch.name;
  npSub.textContent = ch.group + (mode === 'radio' ? ' · רדיו לייב' : ' · שידור חי');
  if(ch.url){
    npOpenNew.href = ch.url;
    npOpenNew.classList.remove('disabled');
    npOpenNew.removeAttribute('aria-disabled');
    npOpenNew.removeAttribute('title');
  } else {
    npOpenNew.removeAttribute('href');   // an <a> without href doesn't navigate
    npOpenNew.classList.add('disabled');
    npOpenNew.setAttribute('aria-disabled', 'true');
    npOpenNew.title = 'אין אתר משדר לערוץ הזה';
  }
  updateNowPlayingFavIcon();
  updateSourceToggle();
  updateVolumeUI();

  renderList();
  if(window.tvOnChannelChange) tvOnChannelChange(ch);
}

const streamOpt = sourceToggle.querySelector('[data-source="stream"]');
const linkOpt = sourceToggle.querySelector('[data-source="link"]');
const STREAM_OPT_TITLE = streamOpt.title;
const LINK_OPT_TITLE = linkOpt.title;

function setOptionAvailable(opt, available, title){
  opt.classList.toggle('disabled', !available);
  opt.setAttribute('aria-disabled', String(!available));
  opt.title = title;
}

/* The toggle is shown for every channel so they all look the same; an option
   the channel doesn't have (no stream / no page) is visibly disabled instead. */
function updateSourceToggle(){
  const ch = currentId ? findChannel(currentId) : null;
  const hasStream = !!(ch && ch.stream);
  const hasLink = !!(ch && ch.url);
  sourceToggle.querySelectorAll('.source-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.source === currentSource);
  });
  setOptionAvailable(streamOpt, hasStream,
    !hasStream ? 'אין שידור ישיר לערוץ הזה - הוא זמין רק דרך אתר המשדר'
    : ch.streamOk === false ? 'השידור הישיר לא זמין כרגע - לחיצה תנסה שוב'
    : STREAM_OPT_TITLE);
  setOptionAvailable(linkOpt, hasLink,
    hasLink ? LINK_OPT_TITLE : 'אין אתר משדר לערוץ הזה - הוא זמין רק בנגן הישיר');
}

sourceToggle.addEventListener('click', (e) => {
  const opt = e.target.closest('.source-opt');
  if(!opt || opt.classList.contains('disabled')) return;
  if(currentId && opt.dataset.source !== currentSource){
    selectChannel(currentId, opt.dataset.source);
  }
});

npFav.addEventListener('click', () => { if(currentId) toggleFav(currentId); });

/* ---------- BRIGHTNESS SLIDER ---------- */
const brightnessSlider = document.getElementById('brightnessSlider');
const brightnessValueLabel = document.getElementById('brightnessValueLabel');

// (also used by the TV interface's settings - tv.js)
function setBrightness(value){
  brightnessValue = value;
  brightnessSlider.value = value;
  brightnessValueLabel.textContent = value + '%';
  applyBrightness();
}
brightnessSlider.addEventListener('input', (e) => setBrightness(Number(e.target.value)));

/* ---------- VOLUME / MUTE ----------
   Direct player: a real volume slider and a real mute, kept while zapping
   like a TV remote. Broadcaster page (iframe): browsers give a page no access
   to a cross-origin frame's audio, so the slider is disabled there and "mute"
   can only mean unloading the page (it reloads on unmute). */
const volumeControl = document.getElementById('volumeControl');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValueLabel = document.getElementById('volumeValueLabel');
const volumeHint = document.getElementById('volumeHint');
const LINK_VOLUME_TITLE = "במצב 'אתר המשדר' הסליידר מושבת: דפדפנים לא מאפשרים לעמוד לשלוט בעוצמת הקול של תוכן חיצוני (iframe) מסיבות אבטחה, ולכן אין דרך לשלוח לאתר המשדר פקודת 'הנמך ל-40%' וכדומה. אייקון הרמקול הוא הפתרון היחיד האפשרי - הוא לא באמת משתיק את הקול אלא עוצר את הערוץ לגמרי (ומטעין אותו מחדש בביטול ההשתקה), כי אין דרך טכנית להשתיק בלי לעצור. בערוצים עם 'נגן ישיר' יש שליטה מלאה בעוצמת הקול.";
const LINK_MUTE_TITLE = 'עצירת השידור (השתקה מלאה) - לחיצה נוספת תפעיל אותו מחדש';

let volumeValue = 80;       // 0-100
let isMuted = false;        // real mute of our own <video>
let linkStopped = false;    // iframe "mute" = page unloaded
let stoppedSrc = null;
let autoMuted = false;      // muted by the browser's autoplay rule, not by the viewer

function updateVolumeUI(){
  const linkMode = currentSource === 'link';
  volumeSlider.disabled = linkMode;
  volumeControl.classList.toggle('disabled', linkMode);
  volumeValueLabel.hidden = linkMode;
  volumeHint.hidden = !linkMode;
  volumeSlider.value = volumeValue;
  volumeValueLabel.textContent = volumeValue + '%';

  let silent;
  if(linkMode){
    silent = linkStopped;
    volumeIcon.setAttribute('icon', silent ? 'mdi:volume-off' : 'mdi:volume-high');
    volumeControl.title = LINK_VOLUME_TITLE;
    volumeIcon.title = LINK_MUTE_TITLE;
  } else {
    silent = isMuted || volumeValue === 0;
    volumeIcon.setAttribute('icon', silent ? 'mdi:volume-off' : volumeValue < 50 ? 'mdi:volume-medium' : 'mdi:volume-high');
    volumeControl.title = 'עוצמת הקול של הנגן הישיר';
    volumeIcon.title = silent ? 'בטל השתקה' : 'השתק';
  }
  volumeIcon.classList.toggle('muted', silent);
}

/* The direct player's volume and mute - also used by the TV interface's
   own controls and keys (tv.js). */
function setVolume(value){
  volumeValue = Math.max(0, Math.min(100, Math.round(value)));
  if(volumeValue > 0) isMuted = false;   // turning it up unmutes, like most players
  applyStreamVolume();
}

function toggleStreamMute(){
  if(isMuted || volumeValue === 0){
    isMuted = false;
    if(volumeValue === 0) volumeValue = 50;   // unmuting at zero volume would stay silent
  } else {
    isMuted = true;
  }
  applyStreamVolume();
}

function applyStreamVolume(){
  autoMuted = false;   // the viewer's own choice from now on
  playerVideo.volume = volumeValue / 100;
  playerVideo.muted = isMuted;
  updateVolumeUI();
}

volumeSlider.addEventListener('input', () => setVolume(Number(volumeSlider.value)));

// keeps our slider in sync with the native video controls too
playerVideo.addEventListener('volumechange', () => {
  volumeValue = Math.round(playerVideo.volume * 100);
  isMuted = playerVideo.muted;
  updateVolumeUI();
});

volumeIcon.addEventListener('click', () => {
  if(currentSource === 'link'){
    const iframe = playerShell.querySelector('iframe');
    if(!iframe) return;
    if(!linkStopped){
      stoppedSrc = iframe.src;
      iframe.src = 'about:blank';
      linkStopped = true;
    } else {
      iframe.src = stoppedSrc || findChannel(currentId).url;
      linkStopped = false;
    }
    updateVolumeUI();
  } else {
    toggleStreamMute();
  }
});

/* ---------- ZAP ---------- */
/* Zapping goes through the channels the list shows right now - the same
   status / source / favorites / search filters - wrapping around (and the
   TV interface can keep it to the favorites). It starts from the current
   channel's place in the full list, so it also works when the playing
   channel itself is filtered out. Returns whether it switched. */
function zap(step, favoritesOnly){
  const list = currentList();
  const n = list.length;
  let idx = list.findIndex(c => c.id === currentId);   // -1: nothing playing yet
  for(let i = 0; i < n; i++){
    idx = (idx + step + n) % n;
    const ch = list[idx];
    if(ch.id !== currentId && matchesFilters(ch) && (!favoritesOnly || favorites.has(ch.id))){
      selectChannel(ch.id);
      return true;
    }
  }
  showToast(favoritesOnly ? 'אין ערוצים נוספים במועדפים' : 'אין ערוצים נוספים שמתאימים לסינון הנוכחי');
  return false;
}
zapPrev.addEventListener('click', () => zap(1));   // RTL: right = previous in list order
zapNext.addEventListener('click', () => zap(-1));  // RTL: left = next

/* ---------- TABS ---------- */
function setMode(newMode){
  mode = newMode;
  tabTv.classList.toggle('active', mode === 'tv');
  tabRadio.classList.toggle('active', mode === 'radio');
  tabRadio.classList.toggle('radio-active', mode === 'radio');
  currentId = null;
  stopPlayback();
  showPlayerMessage(PLAYER_EMPTY_DEFAULT.text, PLAYER_EMPTY_DEFAULT.icon);
  nowPlaying.style.display = 'none';
  loadingOverlay.classList.add('hide');
  updateVolumeUI();
  renderList();
}
tabTv.addEventListener('click', () => setMode('tv'));
tabRadio.addEventListener('click', () => setMode('radio'));

/* ---------- FAV FILTER TOGGLE ---------- */
function setFavOnly(val){
  showFavOnly = val;
  favToggleMobile.classList.toggle('active', showFavOnly);
  renderList();
}
favToggleMobile.addEventListener('click', () => setFavOnly(!showFavOnly));

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  filterPanel.classList.remove('open');
  settingsPanel.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if(!settingsPanel.contains(e.target) && e.target !== settingsBtn){
    settingsPanel.classList.remove('open');
  }
});

/* ---------- CHANNEL FILTER (status + source) ---------- */
/* Opens under the button, right-aligned with it, but kept inside the window -
   on narrow screens the button sits near the left edge. Call once the panel
   is open so it has a size to measure. */
function positionFilterPanel(){
  const rect = filterBtn.getBoundingClientRect();
  const margin = 8;
  const width = filterPanel.offsetWidth;
  const height = filterPanel.offsetHeight;
  // fixed positioning is measured without the scrollbar, unlike window.innerWidth
  const viewW = document.documentElement.clientWidth;
  const viewH = document.documentElement.clientHeight;

  let right = viewW - rect.right;
  right = Math.max(margin, Math.min(right, viewW - width - margin));

  let top = rect.bottom + 8;
  if(top + height > viewH - margin){
    top = Math.max(margin, rect.top - 8 - height);   // not enough room below - open above
  }

  filterPanel.style.top = top + 'px';
  filterPanel.style.right = right + 'px';
  filterPanel.style.left = 'auto';
}

filterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.remove('open');
  if(filterPanel.classList.contains('open')){
    filterPanel.classList.remove('open');
  } else {
    filterPanel.classList.add('open');
    positionFilterPanel();
  }
});
document.addEventListener('click', (e) => {
  if(!filterPanel.contains(e.target) && e.target !== filterBtn && !filterBtn.contains(e.target)){
    filterPanel.classList.remove('open');
  }
});

function syncFiltersFromCheckboxes(){
  const newStatuses = new Set();
  if(chkOk.checked) newStatuses.add('ok');
  if(chkTimeout.checked) newStatuses.add('timeout');
  if(chkBlocked.checked) newStatuses.add('blocked');
  if(newStatuses.size === 0){
    chkOk.checked = true;
    newStatuses.add('ok');
  }
  filterStatuses = newStatuses;

  const newSources = new Set();
  if(chkStream.checked) newSources.add('stream');
  if(chkSite.checked) newSources.add('site');
  if(newSources.size === 0){
    chkStream.checked = true;
    newSources.add('stream');
  }
  filterSources = newSources;

  renderList();
}

[chkOk, chkTimeout, chkBlocked, chkStream, chkSite].forEach(chk => {
  chk.addEventListener('change', syncFiltersFromCheckboxes);
});

filterResetBtn.addEventListener('click', () => {
  chkOk.checked = true;
  chkTimeout.checked = false;
  chkBlocked.checked = false;
  chkStream.checked = true;
  chkSite.checked = true;
  syncFiltersFromCheckboxes();
});

/* ---------- ALL CHANNELS PAGE ---------- */
const appMain = document.getElementById('appMain');
const allChannelsBtn = document.getElementById('allChannelsBtn');
const allChannelsBtnIcon = document.getElementById('allChannelsBtnIcon');
const allChannelsOverlay = document.getElementById('allChannelsOverlay');
const allChannelsContent = document.getElementById('allChannelsContent');
let viewingAllChannels = false;

function makeSectionTitle(text, icon, cls){
  const el = document.createElement('div');
  el.className = 'ac-section-title ' + cls;
  const iconEl = document.createElement('iconify-icon');
  iconEl.setAttribute('icon', icon);
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(iconEl);
  el.appendChild(span);
  return el;
}

function renderAllChannelsView(){
  const all = [...TV_CHANNELS, ...RADIO_CHANNELS];
  const radioGroupNames = new Set(RADIO_CHANNELS.map(c => c.group));
  const groups = {};
  all.filter(matchesFilters).forEach(c => {
    if(!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  });

  allChannelsContent.innerHTML = '';

  if(Object.keys(groups).length === 0){
    const div = document.createElement('div');
    div.className = 'empty-search';
    div.textContent = emptyListMessage(all);
    allChannelsContent.appendChild(div);
    return;
  }

  // a section title only appears when the filters leave something under it
  let insertedTvHeader = false;
  let insertedRadioHeader = false;

  Object.keys(groups).forEach(groupName => {
    const isRadioGroup = radioGroupNames.has(groupName);
    if(!isRadioGroup && !insertedTvHeader){
      allChannelsContent.appendChild(makeSectionTitle('טלוויזיה', 'mdi:television-classic', 'tv'));
      insertedTvHeader = true;
    }
    if(isRadioGroup && !insertedRadioHeader){
      allChannelsContent.appendChild(makeSectionTitle('רדיו', 'mdi:radio', 'radio'));
      insertedRadioHeader = true;
    }

    const groupEl = document.createElement('div');
    groupEl.className = 'ac-group';

    const title = document.createElement('div');
    title.className = 'ac-group-title';
    title.textContent = groupName;
    groupEl.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'ac-grid';

    groups[groupName].forEach(c => {
      const card = document.createElement('div');
      card.className = 'ac-card';

      const dot = document.createElement('span');
      dot.className = 'ac-dot' + (c.status !== 'idle' ? ' ' + c.status : '');
      dot.title = statusLabel(c.status, c);

      const avatar = document.createElement('div');
      avatar.className = 'ac-avatar';
      avatar.style.background = c.color + '33';
      avatar.style.color = c.color;
      setAvatar(avatar, c);

      const nameEl = document.createElement('div');
      nameEl.className = 'ac-name';
      nameEl.textContent = c.name;

      const fav = document.createElement('iconify-icon');
      fav.className = 'ac-fav' + (favorites.has(c.id) ? ' on' : '');
      fav.setAttribute('icon', favorites.has(c.id) ? 'mdi:star' : 'mdi:star-outline');
      fav.addEventListener('click', (e) => {
        e.stopPropagation();   // starring shouldn't open the channel
        toggleFav(c.id);       // re-renders this page too
      });

      card.appendChild(dot);
      card.appendChild(fav);
      card.appendChild(avatar);
      card.appendChild(nameEl);

      card.addEventListener('click', () => {
        const isRadio = RADIO_CHANNELS.some(r => r.id === c.id);
        showMainView();
        if((isRadio && mode !== 'radio') || (!isRadio && mode !== 'tv')){
          setMode(isRadio ? 'radio' : 'tv');
        }
        selectChannel(c.id);
      });

      grid.appendChild(card);
    });

    groupEl.appendChild(grid);
    allChannelsContent.appendChild(groupEl);
  });
}

/* The search / filter / favorites row is a single element that moves between
   the sidebar and the top of this page, so both views share the same
   controls and the same state. */
const channelTools = document.getElementById('channelTools');
const acToolbar = document.getElementById('acToolbar');

function showAllChannelsView(){
  viewingAllChannels = true;
  filterPanel.classList.remove('open');
  acToolbar.appendChild(channelTools);
  renderAllChannelsView();
  appMain.style.display = 'none';
  allChannelsOverlay.classList.add('open');
  allChannelsBtnIcon.setAttribute('icon', 'mdi:access-point');
  allChannelsBtn.title = 'LIVE - חזרה לדף הראשי';
}

function showMainView(){
  viewingAllChannels = false;
  filterPanel.classList.remove('open');
  statusProgress.before(channelTools);
  allChannelsOverlay.classList.remove('open');
  appMain.style.display = 'flex';
  allChannelsBtnIcon.setAttribute('icon', 'mdi:view-grid-outline');
  allChannelsBtn.title = 'כל הערוצים';
}

allChannelsBtn.addEventListener('click', () => {
  if(viewingAllChannels){
    showMainView();
  } else {
    showAllChannelsView();
  }
});

/* The classic view lives at ?old-ui - its links to the home page and to
   About (whose way back is the home page) keep it. */
if(!TV_MODE){
  document.getElementById('brandHome').href = './?old-ui';
  document.getElementById('aboutLink').href = 'about.html?old-ui';
}

/* ---------- LOGO = HOME ----------
   Goes back to the main view without reloading, so the playing channel and
   the (in-memory) favorites survive. A real link, so ctrl/middle-click still
   opens the site in a new tab. */
document.getElementById('brandHome').addEventListener('click', (e) => {
  if(e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  settingsPanel.classList.remove('open');
  filterPanel.classList.remove('open');
  showMainView();
  window.scrollTo({top: 0, behavior: 'smooth'});
});

/* ---------- SEARCH ---------- */
function onSearch(val){
  searchTerm = val;
  searchDesktop.value = val;
  searchMobile.value = val;
  renderList();
}
searchDesktop.addEventListener('input', e => onSearch(e.target.value));
searchMobile.addEventListener('input', e => onSearch(e.target.value));

/* ---------- KEYBOARD ZAP (desktop convenience) ---------- */
document.addEventListener('keydown', (e) => {
  if(TV_MODE) return;   // the remote's arrows are handled by tv.js
  if(e.target.tagName === 'INPUT') return;
  if(e.key === 'ArrowLeft') zap(-1);
  if(e.key === 'ArrowRight') zap(1);
});

/* ---------- INIT ---------- */
renderList();
updateVolumeUI();
runAllTests();
