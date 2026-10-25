/* ZapZap - the site's interface, built for a TV's remote and working with
   a mouse, a keyboard and touch too. Active in TV mode (TV_MODE in
   script.js: everywhere but ?old-ui, which keeps the classic view). The
   classic layout is hidden and the player fills the screen; everything
   else is drawn over it:
   - Watching: up/down change channel, OK / left / right open the channel
     browser, Back twice exits. A channel change shows an info banner.
   - Browser: a menu row and rows of channel cards at the bottom (favorites,
     then each category); OK plays, holding OK toggles a favorite, Back
     closes. It also closes by itself after a while without a key press.
   - Settings: a sheet with a few display switches and (not on the TV) the
     brightness, kept between launches, a legend of the status dots, how to
     use it all (for what's in use - the screen itself has no key hints), a
     status re-check and About.
   - Mouse (a computer): moving it shows the browser, which
     hides again a few seconds after it stops (unless the pointer is on it);
     hovering focuses, clicking plays, the star on a card toggles a favorite,
     the wheel moves between rows (sideways: along a row, as do the arrows at
     a row's ends), and double-click or F toggles full screen. The banner
     has channel up / down arrows. The keyboard works as the remote does,
     plus F (full screen), M (mute), + / - (volume), P (picture in picture)
     and typing a name (search).
   - Search (not on the TV itself): a menu button, or typing - the menu row
     becomes a search field and the rows show the matching channels.
   - All channels (a menu button): the browser rises to fill the screen,
     under the logo, and nothing plays meanwhile; picking a channel plays
     it, Back (or the button again) returns to the one that was playing.
   - Touch (a phone or tablet): a tap on the picture shows / hides
     the browser, a vertical swipe on it changes channel, the rows scroll
     with the finger, a tap plays and a long press toggles a favorite.
   - Portrait (a phone held upright, or any tall window): the picture sits
     at the top with what's playing under it, and the browser fills the rest
     of the screen, always open.
   On the TV itself (TV_DEVICE) only channels with a direct stream are
   offered: a broadcaster's page can't be operated with a remote. (A radio
   station without one doesn't appear; the radio rows and menu shortcut show
   the ones that have it.) Elsewhere broadcaster pages are channels too, and
   a stream that fails falls back to its page. A page fills the screen under
   a bar with what's playing, and takes the clicks, taps and mouse moves
   itself, so the browser opens from the bar or the screen's bottom edge
   (touch: the bar's "channels" button); the banner also offers switching
   between the direct player and the page, and opening the page in a new
   tab.
   It builds on script.js's state and functions (selectChannel, zap,
   matchesFilters, favorites...), which are shared globals. */
(function(){
  if(!TV_MODE) return;

  const LAST_CHANNEL_KEY = 'zapzap:lastChannel';
  const TV_SETTINGS_KEY = 'zapzap:tvSettings';
  const BROWSE_IDLE_MS = 15000;   // the browser closes after this long without a key
  const INFO_MS = 4500;           // how long the info banner stays after a channel change
  const EXIT_CONFIRM_MS = 2500;   // a second Back within this exits the app
  const LONG_PRESS_MS = 650;      // holding OK this long on a card toggles a favorite
  const ZAP_REPEAT_MS = 350;      // a held up/down zaps at most this often
  const PEEK_PX = 60;             // a row keeps this much of the next card in view (design px)
  const MOUSE_IDLE_MS = 3000;     // with a mouse, the browser hides this soon after it stops
  const TOUCH_IDLE_MS = 10000;    // with touch, this long after the last touch or scroll
  const LONG_TOUCH_MS = 500;      // a finger held this long on a card toggles a favorite
  const SWIPE_PX = 40;            // a vertical swipe on the picture this long changes channel

  // a computer: sized for a screen seen from close by (tv.css's tv-desk)
  const DESK = !TV_DEVICE && !matchMedia('(pointer: coarse)').matches;

  // one design pixel in CSS px - the --u unit in tv.css (1 on the TV's 960x540)
  function unit(){
    if(portrait) return Math.min(innerWidth / 400, 1.5);
    if(DESK) return Math.max(0.85, Math.min(innerWidth / 1600, innerHeight / 900));
    return Math.max(inputMode === 'touch' ? 0.78 : 0.6, Math.min(innerWidth / 960, innerHeight / 540));
  }

  const body = document.body;
  body.classList.toggle('tv-desk', DESK);
  const loadingText = document.getElementById('loadingText');
  const allChannels = () => [...TV_CHANNELS, ...RADIO_CHANNELS];
  const findAny = id => allChannels().find(c => c.id === id);
  const isRadio = ch => RADIO_CHANNELS.includes(ch);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function el(tag, cls, text){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  }

  /* The few icons this interface uses, inline (Material Design Icons,
     Apache-2.0): the desktop's icon library loads from the network, and a TV
     that's still connecting when the app opens would show none. */
  const ICONS = {
    'mdi:star': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2L9.19 8.62L2 9.24l5.45 4.73L5.82 21z',
    'mdi:television-classic': 'M8.16 3L6.75 4.41L9.34 7H4c-1.11 0-2 .89-2 2v10c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V9c0-1.11-.89-2-2-2h-5.34l2.59-2.59L15.84 3L12 6.84zM4 9h13v10H4zm15.5 0a1 1 0 0 1 1 1a1 1 0 0 1-1 1a1 1 0 0 1-1-1a1 1 0 0 1 1-1m0 3a1 1 0 0 1 1 1a1 1 0 0 1-1 1a1 1 0 0 1-1-1a1 1 0 0 1 1-1',
    'mdi:radio': 'M20 6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8c0-.85.53-1.58 1.28-1.87L15.71 1l.76 1.83L8.83 6zm0 2H4v4h12v-2h2v2h2zM7 14a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3',
    'mdi:cog-outline': 'M12 8a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2m-2 12c-.25 0-.46-.18-.5-.42l-.37-2.65c-.63-.25-1.17-.59-1.69-.99l-2.49 1.01c-.22.08-.49 0-.61-.22l-2-3.46a.493.493 0 0 1 .12-.64l2.11-1.66L4.5 12l.07-1l-2.11-1.63a.493.493 0 0 1-.12-.64l2-3.46c.12-.22.39-.31.61-.22l2.49 1c.52-.39 1.06-.73 1.69-.98l.37-2.65c.04-.24.25-.42.5-.42h4c.25 0 .46.18.5.42l.37 2.65c.63.25 1.17.59 1.69.98l2.49-1c.22-.09.49 0 .61.22l2 3.46c.13.22.07.49-.12.64L19.43 11l.07 1l-.07 1l2.11 1.63c.19.15.25.42.12.64l-2 3.46c-.12.22-.39.31-.61.22l-2.49-1c-.52.39-1.06.73-1.69.98l-.37 2.65c-.04.24-.25.42-.5.42zm1.25-18l-.37 2.61c-1.2.25-2.26.89-3.03 1.78L5.44 7.35l-.75 1.3L6.8 10.2a5.55 5.55 0 0 0 0 3.6l-2.12 1.56l.75 1.3l2.43-1.04c.77.88 1.82 1.52 3.01 1.76l.37 2.62h1.52l.37-2.61c1.19-.25 2.24-.89 3.01-1.77l2.43 1.04l.75-1.3l-2.12-1.55c.4-1.17.4-2.44 0-3.61l2.11-1.55l-.75-1.3l-2.41 1.04a5.42 5.42 0 0 0-3.03-1.77L12.75 4z',
    'mdi:information-outline': 'M11 9h2V7h-2m1 13c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m0-18A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m-1 15h2v-6h-2z',
    'mdi:loading': 'M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8',
    'mdi:volume-high': 'M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.84-5 6.7v2.07c4-.91 7-4.49 7-8.77s-3-7.86-7-8.77M16.5 12c0-1.77-1-3.29-2.5-4.03V16c1.5-.71 2.5-2.24 2.5-4M3 9v6h4l5 5V4L7 9z',
    'mdi:refresh': 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 0 0-8 8a8 8 0 0 0 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18a6 6 0 0 1-6-6a6 6 0 0 1 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
    'mdi:close': 'M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z',
    'mdi:chevron-left': 'M15.41 16.58L10.83 12l4.58-4.59L14 6l-6 6l6 6z',
    'mdi:chevron-right': 'M8.59 16.58L13.17 12L8.59 7.41L10 6l6 6l-6 6z',
    'mdi:volume-off': 'M12 4L9.91 6.09L12 8.18M4.27 3L3 4.27L7.73 9H3v6h4l5 5v-6.73l4.25 4.26c-.67.51-1.42.93-2.25 1.17v2.07c1.38-.32 2.63-.95 3.68-1.81L19.73 21L21 19.73l-9-9M19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.9 8.9 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71m-2.5 0c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.05-.2.05-.42.05-.63',
    'mdi:web': 'M16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2s.06-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.92 7.92 0 0 1 9.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8 8 0 0 1 5.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.7 15.7 0 0 0-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2',
    'mdi:play-circle-outline': 'M10 16.5l6-4.5l-6-4.5M12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m0-18A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2',
    'mdi:open-in-new': 'M14 3v2h3.59l-9.83 9.83l1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2z',
    'mdi:view-grid-outline': 'M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h8v8h-8zm2 2v4h4v-4z',
    'mdi:magnify': 'M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5l-1.5 1.5l-5-5v-.79l-.27-.27A6.52 6.52 0 0 1 9.5 16A6.5 6.5 0 0 1 3 9.5A6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14S14 12 14 9.5S12 5 9.5 5',
    'mdi:volume-medium': 'M5 9v6h4l5 5V4L9 9m9.5 3c0-1.77-1-3.29-2.5-4.03V16c1.5-.71 2.5-2.24 2.5-4',
    'mdi:chevron-up': 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6l-6 6z',
    'mdi:chevron-down': 'M7.41 8.58L12 13.17l4.59-4.59L18 10l-6 6l-6-6z',
    'mdi:picture-in-picture-bottom-right': 'M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 2v12h18V6zm9 5h7v5h-7z',
    'mdi:fullscreen': 'M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zm3 9h2v5h-5v-2h3zm-7 3v2H5v-5h2v3z',
    'mdi:fullscreen-exit': 'M14 14h5v2h-3v3h-2zm-9 0h5v5H8v-3H5zm3-9h2v5H5V8h3zm11 3v2h-5V5h2v3z',
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(name){
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'tv-icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  /* The focused control carries a .tv-focus class (that's what the styles use)
     besides the real DOM focus: :focus stops matching whenever the page
     loses window focus, e.g. while a system overlay is up on the TV. */
  let focusedEl = null;
  function setFocus(elm){
    if(focusedEl && focusedEl !== elm) focusedEl.classList.remove('tv-focus');
    focusedEl = elm;
    if(!elm) return;
    elm.classList.add('tv-focus');
    elm.focus({preventScroll: true});
  }

  // a line of hints: [['▲▼', 'החלפת ערוץ'], ...]
  function hints(list){
    const wrap = el('div', 'tv-hints');
    list.forEach(([key, label]) => {
      const item = el('span');
      item.append(el('span', 'tv-key', key), document.createTextNode(label));
      wrap.append(item);
    });
    return wrap;
  }

  /* ---------- LAYOUT ---------- */
  const ui = el('div', 'tv-ui');

  // info banner (top): what's playing, and the time
  const info = el('div', 'tv-info');
  const infoAvatar = el('div', 'tv-info-avatar');
  const infoName = el('div', 'tv-info-name');
  const infoSub = el('div', 'tv-info-sub');
  const infoSubText = el('span', 'tv-info-sub-text');
  // a channel the check couldn't confirm: a chip, and why (hover / tap)
  const infoStatus = el('span', 'tv-info-status');
  const infoStatusText = el('span');
  infoStatus.append(infoStatusText);
  infoSub.append(infoSubText, infoStatus);
  const infoText = el('div', 'tv-info-text');
  infoText.append(infoName, infoSub);
  const clock = el('div', 'tv-clock');
  const liveLabel = el('span');
  const liveBadge = el('div', 'tv-live');
  liveBadge.append(el('span', 'tv-live-dot'), liveLabel);
  const infoSide = el('div', 'tv-info-side');
  infoSide.append(clock, liveBadge);

  /* Channel actions, by mouse or touch (not on the TV itself, which has no
     broadcaster pages): the other source - the direct player or the
     broadcaster's page - for a channel with both, the page in a new tab,
     and, while a page fills the screen and takes the clicks, the channels.
     tv.css shows each where it applies; on a narrow screen as icons. */
  const infoActions = el('div', 'tv-info-actions');
  // the player's own controls - in the menu row's media group (see MENU)
  const volumeBox = el('div', 'tv-volume');
  const muteBtn = el('div', 'tv-btn tv-mute');
  muteBtn.tabIndex = -1;
  const volumeRange = el('input', 'tv-volume-range');
  volumeRange.type = 'range';
  volumeRange.min = 0;
  volumeRange.max = 100;
  volumeRange.step = 5;
  volumeRange.setAttribute('aria-label', 'עוצמת הקול');
  volumeBox.append(muteBtn, volumeRange);
  // picture in picture: the direct player's video in a small window that
  // stays on top (where the browser supports it - Safari its own way)
  const pipBtn = el('div', 'tv-btn tv-pip');
  pipBtn.tabIndex = -1;
  const PIP = !TV_DEVICE && (!!document.pictureInPictureEnabled || !!playerVideo.webkitSupportsPresentationMode);
  const sourceBtn = el('div', 'tv-btn tv-act');
  const newTabBtn = el('a', 'tv-btn tv-act');
  newTabBtn.target = '_blank';
  newTabBtn.rel = 'noopener';
  setButton(newTabBtn, 'mdi:open-in-new', 'פתיחה בטאב חדש');
  const channelsBtn = el('div', 'tv-btn tv-act tv-act-channels');
  setButton(channelsBtn, 'mdi:view-grid-outline', 'ערוצים');
  infoActions.append(sourceBtn, newTabBtn, channelsBtn);

  // channel up / down by mouse, next to what's playing (tv.css: mouse only)
  const zapBox = el('div', 'tv-zap');
  [[1, 'mdi:chevron-up', 'הערוץ הבא'], [-1, 'mdi:chevron-down', 'הערוץ הקודם']].forEach(([step, name, label]) => {
    const btn = el('div', 'tv-zap-btn');
    btn.append(icon(name));
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', () => tvZap(step));
    zapBox.append(btn);
  });
  // the site's logo: in the middle of the banner / the bar over a page, and
  // over the all-channels view
  function logo(cls){
    const box = el('div', cls);
    const name = el('b', null, 'Zap');
    name.append(el('span', null, 'Zap'));
    box.append(icon('mdi:television-classic'), name);
    return box;
  }
  const barBrand = logo('tv-bar-brand');

  if(TV_DEVICE) info.append(infoAvatar, infoText, infoSide, barBrand);
  else info.append(zapBox, infoAvatar, infoText, infoActions, infoSide, barBrand);

  function setButton(btn, iconName, label){
    btn.replaceChildren(icon(iconName), el('span', null, label));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  // channel browser (bottom): a menu row, then rows of channel cards
  const browse = el('div', 'tv-browse');
  const menuEl = el('div', 'tv-menu');
  const rowsView = el('div', 'tv-rows');
  const rowsStrip = el('div', 'tv-rows-strip');
  rowsView.append(rowsStrip);
  const statusText = el('span');
  const statusLine = el('div', 'tv-status-line');
  statusLine.append(icon('mdi:loading'), statusText);
  const foot = el('div', 'tv-browse-foot');
  foot.append(statusLine);
  const allHead = el('div', 'tv-all-head');   // (the all-channels view)
  allHead.append(logo('tv-logo'));
  browse.append(allHead, menuEl, rowsView, foot);

  // settings sheet
  const sheet = el('div', 'tv-sheet');
  const sheetPanel = el('div', 'tv-sheet-panel');
  const sheetTitle = el('div', 'tv-sheet-title');
  sheetTitle.append(icon('mdi:cog-outline'), el('span', null, 'הגדרות'));
  sheetPanel.append(sheetTitle);
  sheet.append(sheetPanel);

  ui.append(info, browse, sheet, playerToast);   // toasts show above the overlays
  body.append(ui);

  playerVideo.controls = false;   // nothing to seek in live TV; the remote drives the player

  /* ---------- INFO BANNER ---------- */
  function timeNow(){
    return new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'});
  }

  function refreshInfo(){
    clock.textContent = timeNow();
    const ch = currentId ? findAny(currentId) : null;
    refreshSource(ch);
    if(!ch){
      infoAvatar.textContent = 'TV';
      infoAvatar.classList.remove('avatar-long');
      infoAvatar.style.background = '';
      infoAvatar.style.color = '';
      infoName.textContent = 'ZapZap';
      infoSubText.textContent = 'בחרו ערוץ מהרשימה';
      infoStatus.hidden = true;
      liveLabel.textContent = 'שידור חי';
      fitBar();
      return;
    }
    setAvatar(infoAvatar, ch);
    infoAvatar.style.background = ch.color + '33';
    infoAvatar.style.color = ch.color;
    infoName.textContent = ch.name;
    // (the TV itself only has direct streams - no need to say so there)
    const source = TV_DEVICE ? '' : currentSource === 'stream' ? 'נגן ישיר' : currentSource === 'link' ? 'אתר המשדר' : '';
    infoSubText.textContent = [ch.group, source].filter(Boolean).join(' · ');
    const unsure = ch.status === 'timeout' || ch.status === 'blocked';
    infoStatus.hidden = !unsure;
    if(unsure){
      infoStatus.className = 'tv-info-status ' + ch.status;
      infoStatusText.textContent = ch.status === 'blocked' ? 'חסום' : 'לא ברור';
      infoStatus.title = statusLabel(ch.status, ch);   // script.js's explanation
    }
    liveLabel.textContent = isRadio(ch) ? 'רדיו חי' : 'שידור חי';
    fitBar();
  }
  setInterval(() => { clock.textContent = timeNow(); }, 15000);

  /* The banner (and the bar over a broadcaster's page) has the logo in its
     middle, over the row: where the sides reach it (a narrow screen, a long
     name), the buttons lose their labels, and if that isn't
     enough the logo goes. (Not in portrait, where the banner is under the
     picture and has no logo.) */
  function fitBar(){
    info.classList.remove('tv-bar-tight', 'tv-bar-nologo');
    if(portrait) return;
    const clear = () => {
      const logo = barBrand.getBoundingClientRect();
      const gap = 12 * unit();
      return infoActions.getBoundingClientRect().right <= logo.left - gap &&   // RTL: the actions are on the left
             infoText.getBoundingClientRect().left >= logo.right + gap;
    };
    if(clear()) return;
    info.classList.add('tv-bar-tight');
    if(!clear()) info.classList.add('tv-bar-nologo');
  }

  /* A broadcaster's page (body.tv-site) gets the screen under a bar - the
     banner, kept up (tv.css) - instead of the picture behind the overlays. */
  function refreshSource(ch){
    const site = currentSource === 'link';
    body.classList.toggle('tv-site', site);
    const both = !!(ch && ch.stream && ch.url && currentSource);
    sourceBtn.hidden = !both;
    if(both){
      if(site) setButton(sourceBtn, 'mdi:play-circle-outline', 'מעבר לנגן הישיר');
      else setButton(sourceBtn, 'mdi:web', 'מעבר לאתר המשדר');
    }
    newTabBtn.hidden = !(ch && ch.url);
    if(ch && ch.url) newTabBtn.href = ch.url;
    refreshVolume();
    refreshPip();
    const cur = menuRow.items[menuRow.col];
    refreshMenu(cur && cur.id);   // (the volume / picture-in-picture buttons)
  }

  infoStatus.addEventListener('click', () => showToast(infoStatus.title));

  /* ---------- PICTURE IN PICTURE ---------- */
  const inPip = () => document.pictureInPictureElement === playerVideo ||
                      playerVideo.webkitPresentationMode === 'picture-in-picture';

  // a TV channel in the direct player (radio has no picture)
  function canPip(){
    const ch = currentId ? findAny(currentId) : null;
    return PIP && currentSource === 'stream' && !!ch && !isRadio(ch);
  }

  function refreshPip(){
    if(!canPip() && inPip()) togglePip();   // e.g. switched to a page or a station
    const label = inPip() ? 'יציאה מתמונה בתוך תמונה' : 'תמונה בתוך תמונה';
    pipBtn.replaceChildren(icon('mdi:picture-in-picture-bottom-right'));
    pipBtn.classList.toggle('on', inPip());
    pipBtn.title = label;
    pipBtn.setAttribute('aria-label', label);
  }

  function togglePip(){
    if(!PIP) return;
    if(inPip()){
      if(document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
      else playerVideo.webkitSetPresentationMode('inline');
      return;
    }
    if(currentSource !== 'stream') return;
    if(playerVideo.requestPictureInPicture){
      playerVideo.requestPictureInPicture().catch(() => showToast('אי אפשר לפתוח תמונה בתוך תמונה כרגע'));
    } else {
      playerVideo.webkitSetPresentationMode('picture-in-picture');
    }
  }
  ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']
    .forEach(type => playerVideo.addEventListener(type, () => refreshPip()));

  /* ---------- VOLUME ----------
     The direct player's (script.js keeps it, and the mute, while zapping);
     a broadcaster's page has its own, which a page can't reach. */
  function refreshVolume(){
    const silent = isMuted || volumeValue === 0;
    muteBtn.replaceChildren(icon(silent ? 'mdi:volume-off' : volumeValue < 50 ? 'mdi:volume-medium' : 'mdi:volume-high'));
    const label = silent ? 'ביטול השתקה' : 'השתקה';
    muteBtn.title = label;
    muteBtn.setAttribute('aria-label', label);
    volumeRange.value = silent ? 0 : volumeValue;
    volumeRange.title = 'עוצמת הקול: ' + (silent ? 'מושתק' : volumeValue + '%');
  }
  playerVideo.addEventListener('volumechange', refreshVolume);   // after script.js's own listener
  volumeRange.addEventListener('input', () => setVolume(Number(volumeRange.value)));

  // the keyboard's M and + / - (with a toast, as the slider may not be in view)
  function toggleMute(){
    if(currentSource !== 'stream') return;
    toggleStreamMute();
    showToast(isMuted ? 'הקול הושתק' : 'הקול הופעל - ' + volumeValue + '%');
  }
  function stepVolume(step){
    if(currentSource !== 'stream') return;
    setVolume(volumeValue + step);
    showToast('עוצמת הקול: ' + volumeValue + '%');
  }

  sourceBtn.addEventListener('click', () => {
    if(currentId && currentSource) selectChannel(currentId, currentSource === 'link' ? 'stream' : 'link');
  });
  channelsBtn.addEventListener('click', () => {
    if(browseOpen) closeBrowse();
    else openBrowse();
  });

  let infoTimer = null;
  function showInfo(ms){
    refreshInfo();
    body.classList.add('tv-info-show');
    clearTimeout(infoTimer);
    if(ms) infoTimer = setTimeout(hideInfo, ms);
  }
  function hideInfo(){
    clearTimeout(infoTimer);
    body.classList.remove('tv-info-show');
  }

  /* ---------- CHANNEL ROWS ---------- */
  /* The menu row: getting around the channels at its start - shortcuts to
     the rows, search - and, as a group at its far end, the controls of the
     player and the app: volume, picture in picture, full screen, settings.
     (About is in Settings.) Where the labels don't fit, every button shows
     just its icon (fitMenu). `shownIf`: an item appears only while there's
     a row to jump to, or where it works. `btn`: a button built elsewhere
     (the volume's mute button, with its slider beside it in `node`). */
  const MENU = [
    {id: 'fav', label: 'מועדפים', icon: 'mdi:star',
     run: () => jumpTo(row => row.key === 'fav', noFavoritesText())},
    {id: 'tv', label: 'טלוויזיה', icon: 'mdi:television-classic',
     run: () => jumpTo(row => row.kind === 'tv'), shownIf: () => rows.some(row => row.kind === 'tv')},
    {id: 'radio', label: 'רדיו', icon: 'mdi:radio',
     run: () => jumpTo(row => row.kind === 'radio'), shownIf: () => rows.some(row => row.kind === 'radio')},
    {id: 'all', label: 'כל הערוצים', icon: 'mdi:view-grid-outline', on: () => allMode,
     run: () => { if(allMode) closeAll(true); else openAll(); }},
    // (typing on the TV's remote is too slow to be worth it)
    {id: 'search', label: 'חיפוש', icon: 'mdi:magnify',
     run: () => openSearch(), shownIf: () => !TV_DEVICE},
    // the far-end group (the TV's remote has its own volume keys; and in
    // the all-channels view nothing plays)
    {id: 'volume', media: true, btn: muteBtn, node: volumeBox,
     run: () => toggleMute(), shownIf: () => !TV_DEVICE && currentSource === 'stream' && !allMode},
    {id: 'pip', media: true, btn: pipBtn, run: () => togglePip(), shownIf: () => canPip() && !allMode},
    {id: 'full', label: 'מסך מלא', icon: 'mdi:fullscreen', media: true,
     run: () => toggleFullscreen(), shownIf: () => !TV_APP && !!document.fullscreenEnabled && !allMode},
    {id: 'settings', label: 'הגדרות', icon: 'mdi:cog-outline', media: true,
     run: () => openSheet()},
  ];

  const menuRow = {key: 'menu', items: [], col: 0};
  const mediaGroup = el('div', 'tv-menu-media');
  const menuButtons = MENU.map(m => {
    let btn = m.btn;
    if(!btn){
      btn = el('div', 'tv-btn');
      btn.tabIndex = -1;
      btn.setAttribute('aria-label', m.label);
      btn.append(icon(m.icon), el('span', null, m.label));
    }
    (m.media ? mediaGroup : menuEl).append(m.node || btn);
    return {m, btn, node: m.node || btn};
  });
  menuEl.append(mediaGroup);

  function noFavoritesText(){
    if(inputMode === 'touch') return 'אין עדיין מועדפים - לחיצה ארוכה על ערוץ מוסיפה אותו';
    if(inputMode === 'mouse') return 'אין עדיין מועדפים - הכוכב שבפינת ערוץ מוסיף אותו';
    return 'אין עדיין מועדפים - החזיקו OK על ערוץ כדי להוסיף אותו';
  }

  function refreshMenu(rememberedId){
    menuRow.items = [];
    if(searching){   // the row is the search field
      menuRow.items.push({id: 'search', el: searchInput});
      menuRow.col = 0;
      return;
    }
    menuButtons.forEach(({m, btn, node}) => {
      const shown = !m.shownIf || m.shownIf();
      node.hidden = !shown;
      if(m.on) btn.classList.toggle('on', m.on());
      if(shown) menuRow.items.push({id: m.id, el: btn, run: m.run});
    });
    menuRow.col = Math.max(0, menuRow.items.findIndex(it => it.id === rememberedId));
    // the menu has the focus: keep its place on the same button
    if(browseOpen && pos.r === 0){
      const i = menuRow.items.findIndex(it => it.el === focusedEl);
      if(i !== -1) pos.c = menuRow.col = i;
    }
    fitMenu();
  }

  /* All the buttons just icons (tv.css's tv-menu-tight) where their labels
     don't fit in the row - always in portrait - rather than some with a
     label and some without. Measured with the labels: the group at the
     row's far end is pushed past its edge when they don't fit. */
  function fitMenu(){
    if(searching) return;   // (the buttons are hidden behind the search field)
    menuEl.classList.remove('tv-menu-tight', 'tv-menu-close');
    const edge = menuEl.getBoundingClientRect().left + (parseFloat(getComputedStyle(menuEl).paddingLeft) || 0);
    if(portrait || mediaGroup.getBoundingClientRect().left < edge - 1) menuEl.classList.add('tv-menu-tight');
    // the two groups a button's width apart or less: a thin line between
    // them, so they still read as two (RTL: the first group is on the right)
    const firstGroup = [...menuEl.children].filter(e => e !== mediaGroup && e.offsetParent && e.classList.contains('tv-btn'));
    if(!firstGroup.length) return;
    const gap = Math.min(...firstGroup.map(e => e.getBoundingClientRect().left)) - mediaGroup.getBoundingClientRect().right;
    if(gap <= 40 * unit()) menuEl.classList.add('tv-menu-close');
  }

  /* Search (not on the TV itself): the menu row turns into a search field,
     and the rows show only the channels whose name matches - script.js's
     search, which zapping follows too, so it only lasts while the browser
     is open. On a computer, typing a letter or digit starts it. */
  let searching = false;
  const searchBar = el('div', 'tv-search');
  const searchInput = el('input', 'tv-search-input');
  searchInput.type = 'text';
  searchInput.placeholder = 'חיפוש ערוץ…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.setAttribute('enterkeyhint', 'search');
  searchInput.setAttribute('aria-label', 'חיפוש ערוץ');
  const searchClose = el('div', 'tv-search-close');
  searchClose.append(icon('mdi:close'));
  searchClose.title = 'סגירת החיפוש';
  searchBar.append(icon('mdi:magnify'), searchInput, searchClose);
  menuEl.prepend(searchBar);

  /* rows[0] is the menu; the rest are channel rows:
     {key, kind: 'fav'|'tv'|'radio', el, track, strip, items: [{id, el, ch}], col, shift} */
  let rows = [menuRow];
  let pos = {r: 0, c: 0};          // the focused row / item while the browser is open
  let renderedSignature = null;
  let browseOpen = false;
  let sheetOpen = false;
  let inputMode = 'remote';          // what was used last: 'remote' (or keyboard) | 'mouse' | 'touch'
  let portrait = false;              // the tall layout (body.tv-portrait)
  let pointerOverBrowser = false;
  let pointerOverInfo = false;       // (its volume / action buttons)
  let focusPlayingWhenReady = false; // the browser opened before any channel row existed

  function rowModel(){
    const visible = allChannels().filter(matchesFilters);
    const model = [];
    const favs = visible.filter(c => favorites.has(c.id));
    if(favs.length) model.push({key: 'fav', kind: 'fav', title: 'המועדפים שלי', icon: 'mdi:star', channels: favs});
    const groups = new Map();
    visible.forEach(c => {
      if(!groups.has(c.group)) groups.set(c.group, []);
      groups.get(c.group).push(c);
    });
    groups.forEach((channels, group) => {
      const radio = isRadio(channels[0]);
      model.push({key: 'g:' + group, kind: radio ? 'radio' : 'tv', title: group,
        icon: radio ? 'mdi:radio' : 'mdi:television-classic', channels});
    });
    return model;
  }

  function makeCard(ch){
    const card = el('div', 'tv-card');
    card.tabIndex = -1;
    card.style.background = `linear-gradient(160deg, ${ch.color}40, ${ch.color}0d 70%), #1b2029`;
    const label = el('div', 'tv-card-label');
    setAvatar(label, ch);
    label.style.color = ch.color;
    const playing = el('div', 'tv-card-playing');
    playing.append(icon('mdi:volume-high'), el('span', null, 'מתנגן'));
    const fav = el('span', 'tv-card-fav');   // also a button with a mouse
    fav.append(icon('mdi:star'));
    // top corner: "site" for a channel that only has a broadcaster page, and
    // the status dot
    const tags = el('div', 'tv-card-tags');
    if(!ch.stream){
      const site = el('span', 'tv-card-site');
      site.append(icon('mdi:web'), el('span', null, 'אתר'));
      tags.append(site);
    }
    tags.append(el('span', 'tv-card-dot'));
    card.append(tags, fav, label, el('div', 'tv-card-name', ch.name), playing);
    return card;
  }

  function emptyRowsText(){
    if(searchTerm.trim()) return `לא נמצא ערוץ בשם "${searchTerm.trim()}"`;
    const checking = allChannels().some(c => (c.stream || !TV_DEVICE) && (c.status === 'idle' || c.status === 'testing'));
    return checking ? 'בודק אילו ערוצים זמינים…' : 'אין ערוצים שמתאימים להגדרות התצוגה';
  }

  function rebuildRows(model){
    // (pos can be stale - rows rebuilt while the settings sheet had the focus)
    const curRow = browseOpen ? rows[pos.r] : null;
    const focused = curRow ? {rowKey: curRow.key, id: (curRow.items[pos.c] || {}).id, r: pos.r, c: pos.c} : null;
    const remembered = new Map();   // row key -> the channel its focus was on
    rows.forEach(row => { if(row.items[row.col]) remembered.set(row.key, row.items[row.col].id); });

    rowsStrip.textContent = '';
    rows = [menuRow];
    model.forEach(m => {
      const rowEl = el('div', 'tv-row');
      const title = el('div', 'tv-row-title');
      title.append(icon(m.icon), el('span', null, m.title), el('span', 'tv-row-count', String(m.channels.length)));
      const track = el('div', 'tv-track');
      const strip = el('div', 'tv-strip');
      // mouse arrows at the row's ends (RTL: the row continues to the left)
      const backArrow = el('div', 'tv-row-arrow back');
      backArrow.append(icon('mdi:chevron-right'));
      const onArrow = el('div', 'tv-row-arrow on');
      onArrow.append(icon('mdi:chevron-left'));
      track.append(strip, backArrow, onArrow);
      rowEl.append(title, track);
      rowsStrip.append(rowEl);
      const items = m.channels.map(ch => {
        const card = makeCard(ch);
        strip.append(card);
        return {id: ch.id, el: card, ch};
      });
      const col = Math.max(0, items.findIndex(it => it.id === remembered.get(m.key)));
      rows.push({key: m.key, kind: m.kind, el: rowEl, track, strip, backArrow, onArrow, items, col, shift: 0});
    });
    if(rows.length === 1) rowsStrip.append(el('div', 'tv-empty', emptyRowsText()));
    refreshMenu(remembered.get('menu'));

    withoutAnimation(() => {
      rows.forEach(row => { if(row.strip) scrollRowTo(row, row.items[row.col].el); });
      // the settings sheet keeps the focus; closing it puts it back on the menu
      if(!browseOpen || sheetOpen) return;
      if(!focused || (focusPlayingWhenReady && rows.length > 1)){ focusPlaying(); return; }
      // the focus follows the channel: same row if it's still there, else the
      // row it's in now (e.g. just removed from favorites - so holding OK
      // again undoes it), else the same spot
      let r = rows.findIndex(row => row.key === focused.rowKey);
      let c = r === -1 ? -1 : rows[r].items.findIndex(it => it.id === focused.id);
      if(c === -1){
        const elsewhere = rows.findIndex((row, i) => i > 0 && row.items.some(it => it.id === focused.id));
        if(elsewhere !== -1){
          r = elsewhere;
          c = rows[r].items.findIndex(it => it.id === focused.id);
        } else {
          if(r === -1) r = Math.min(focused.r, rows.length - 1);
          c = focused.c;
        }
      }
      focusAt(r, c);
    });
  }

  function refreshCards(){
    rows.forEach(row => row.items.forEach(it => {
      if(!it.ch) return;
      it.el.classList.toggle('fav', favorites.has(it.id));
      it.el.classList.toggle('playing', it.id === currentId && !!currentSource);
      it.el.dataset.status = it.ch.status;
      // with a mouse, why a card has a dot
      if(it.ch.status === 'timeout' || it.ch.status === 'blocked') it.el.title = statusLabel(it.ch.status, it.ch);
      else it.el.removeAttribute('title');
    }));
  }

  // called by script.js's renderList() on any status, favorite or filter change
  window.tvRender = function(){
    const model = rowModel();
    const signature = model.map(m => m.key + '=' + m.channels.map(c => c.id).join(',')).join('|');
    if(signature !== renderedSignature){
      renderedSignature = signature;
      rebuildRows(model);
    }
    refreshCards();
    refreshInfo();
  };

  function withoutAnimation(fn){
    rowsView.classList.add('tv-no-anim');
    menuEl.classList.add('tv-no-anim');
    fn();
    void rowsView.offsetHeight;   // apply the new positions before transitions return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      rowsView.classList.remove('tv-no-anim');
      menuEl.classList.remove('tv-no-anim');
    }));
  }

  /* Rows scroll by moving their strip (a transform - smooth even on a weak
     TV box). With touch, each row is a real scrolling box instead, so it
     follows the finger with its momentum, and so is the list of rows
     (also in portrait, where it's long). Distances along a row are measured
     from its start, its right edge; `shift` is how far it has moved along. */
  const nativeRows = () => inputMode === 'touch';
  const nativeList = () => inputMode === 'touch' || portrait || allMode;

  function rowView(row){
    const pad = parseFloat(getComputedStyle(row.track).paddingRight) || 0;
    return row.track.clientWidth - pad * 2;
  }

  function setShift(row, shift){
    const max = Math.max(0, row.strip.offsetWidth - rowView(row));
    row.shift = clamp(shift, 0, max);
    if(nativeRows()) row.track.scrollLeft = -row.shift;   // RTL: onward is negative
    else row.strip.style.transform = `translateX(${row.shift}px)`;
    row.backArrow.classList.toggle('can', row.shift > 1);
    row.onArrow.classList.toggle('can', row.shift < max - 1);
  }

  // just far enough to bring the card into view, with some of the next one
  function scrollRowTo(row, card){
    if(nativeRows()) row.shift = -row.track.scrollLeft;   // the finger may have moved it
    const view = rowView(row);
    const peek = PEEK_PX * unit();
    const start = row.strip.offsetWidth - (card.offsetLeft + card.offsetWidth);
    const end = start + card.offsetWidth;
    let shift = row.shift;
    if(start - peek < shift) shift = start - peek;
    if(end + peek > shift + view) shift = end + peek - view;
    setShift(row, shift);
  }

  // a page along the row (mouse arrows): step 1 = onward, -1 = back
  function pageRow(row, step){
    setShift(row, row.shift + step * rowView(row) * 0.8);
  }

  // toTop: a menu shortcut's jump - the row goes to the top of the view
  function focusAt(r, c, toTop){
    r = clamp(r, 0, rows.length - 1);
    const row = rows[r];
    if(!row.items.length) return;
    c = clamp(c, 0, row.items.length - 1);
    pos = {r, c};
    row.col = c;
    const item = row.items[c];
    setFocus(item.el);
    alignRows(toTop);
    if(row.strip) scrollRowTo(row, item.el);
  }

  // the focused channel row lines up at the top of the rows view; on the
  // menu, the first channel row does
  function alignRows(toTop){
    const lineUp = pos.r === 0 ? rows[1] : rows[pos.r];
    if(!nativeList()){
      rowsStrip.style.transform = lineUp ? `translateY(${-lineUp.el.offsetTop}px)` : '';
      return;
    }
    if(!lineUp) return;
    const top = pos.r === 0 ? 0 : lineUp.el.offsetTop;
    const bottom = lineUp.el.offsetTop + lineUp.el.offsetHeight;
    // portrait and the all-channels view show several rows, so moving
    // between them only has to keep the row in view - a jump brings it to
    // the top, where it's easy to spot
    if(toTop) scrollListTo(top);
    else if(!portrait && !allMode) rowsView.scrollTop = top;
    else if(top < rowsView.scrollTop) rowsView.scrollTop = top;
    else if(bottom > rowsView.scrollTop + rowsView.clientHeight) rowsView.scrollTop = bottom - rowsView.clientHeight;
  }

  /* Scrolls the list of rows so this point is at its top - with room added
     under the last rows if needed, so one near the end can come up too
     (until the list is laid out again). */
  function scrollListTo(top){
    const pad = parseFloat(rowsStrip.style.paddingBottom) || 0;
    const content = rowsStrip.offsetHeight - pad;
    rowsStrip.style.paddingBottom = Math.max(0, top + rowsView.clientHeight - content) + 'px';
    rowsView.scrollTo({top, behavior: rowsView.closest('.tv-no-anim') ? 'auto' : 'smooth'});
  }

  // after a resize or rotation, or a switch to / from touch (another way of
  // scrolling): re-place every row
  function relayout(){
    withoutAnimation(() => {
      rowsStrip.style.transform = '';
      rowsStrip.style.paddingBottom = '';
      rows.forEach(row => {
        if(!row.strip) return;
        row.strip.style.transform = '';
        row.track.scrollLeft = 0;
        row.shift = 0;
        scrollRowTo(row, row.items[row.col].el);
      });
      alignRows();
    });
  }

  // the mouse moves the focus without scrolling anything under the pointer
  function hoverFocus(r, c){
    pos = {r, c};
    rows[r].col = c;
    setFocus(rows[r].items[c].el);
  }

  function moveRow(step){
    for(let r = pos.r + step; r >= 0 && r < rows.length; r += step){
      if(rows[r].items.length){ focusAt(r, rows[r].col); return; }
    }
  }

  function jumpTo(test, emptyMessage){
    const r = rows.findIndex((row, i) => i > 0 && test(row));
    if(r === -1){ if(emptyMessage) showToast(emptyMessage); return; }
    focusAt(r, rows[r].col, true);
  }

  function focusPlaying(){
    focusPlayingWhenReady = false;
    const r = rows.findIndex((row, i) => i > 0 && row.items.some(it => it.id === currentId));
    if(r !== -1) focusAt(r, rows[r].items.findIndex(it => it.id === currentId));
    else if(rows.length > 1) focusAt(1, 0);
    else { focusAt(0, 0); focusPlayingWhenReady = true; }
  }

  /* ---------- BROWSER OPEN / CLOSE ---------- */
  const IDLE_MS = {remote: BROWSE_IDLE_MS, mouse: MOUSE_IDLE_MS, touch: TOUCH_IDLE_MS};
  let idleTimer = null;
  function armIdle(){
    clearTimeout(idleTimer);
    if(!browseOpen || portrait || allMode) return;   // in portrait it's part of the page
    idleTimer = setTimeout(() => {
      if(sheetOpen) return;
      // still being used: under the mouse, or typing a search
      if((inputMode === 'mouse' && (pointerOverBrowser || pointerOverInfo)) ||
         document.activeElement === searchInput){ armIdle(); return; }
      closeBrowse();
      if(inputMode === 'mouse' && currentSource !== 'link') body.classList.add('tv-cursor-hidden');
    }, IDLE_MS[inputMode]);
  }

  function openBrowse(){
    if(browseOpen) return;
    browseOpen = true;
    hideInfo();
    refreshInfo();
    body.classList.add('tv-browse-open');
    withoutAnimation(focusPlaying);
    armIdle();
    fitBar();
  }

  function closeBrowse(){
    if(!browseOpen || portrait || allMode) return;
    browseOpen = false;
    focusPlayingWhenReady = false;
    clearTimeout(idleTimer);
    body.classList.remove('tv-browse-open');
    setFocus(null);
    if(document.activeElement && document.activeElement !== body) document.activeElement.blur();
    closeSearch();
    fitBar();
  }

  /* ---------- SEARCH ---------- */
  function openSearch(text){
    if(!browseOpen) openBrowse();
    if(!searching){
      searching = true;
      menuEl.classList.add('searching');
      refreshMenu();
    }
    if(text != null){
      searchInput.value = text;
      onSearch(text);   // script.js - re-renders the rows
    }
    focusAt(0, 0);
    armIdle();
  }

  function closeSearch(){
    if(!searching) return;
    searching = false;
    menuEl.classList.remove('searching');
    if(document.activeElement === searchInput) searchInput.blur();
    searchInput.value = '';
    refreshMenu('search');
    onSearch('');
  }

  function focusMenu(id){
    focusAt(0, Math.max(0, menuRow.items.findIndex(it => it.id === id)));
  }

  searchInput.addEventListener('input', () => {
    onSearch(searchInput.value);
    armIdle();
  });
  // clicked / tapped into: the focus is there now, for the arrow keys too
  searchInput.addEventListener('focus', () => { if(searching && focusedEl !== searchInput) hoverFocus(0, 0); });
  searchClose.addEventListener('click', () => {
    closeSearch();
    focusMenu('search');
  });

  // keys in the field: down goes to the matches, Enter plays the first one
  function onSearchKey(e){
    if(e.key !== 'ArrowDown' && e.key !== 'Enter') return;
    e.preventDefault();
    const r = rows.findIndex((row, i) => i > 0 && row.items.length);
    if(r === -1) return;
    if(e.key === 'Enter') play(rows[r].items[0].ch);
    else focusAt(r, 0);
  }

  /* ---------- PLAYING ---------- */
  function play(ch){
    if(!ch) return;
    if(allMode) closeAll(false);
    closeBrowse();
    if(ch.id === currentId && currentSource){ showInfo(INFO_MS); return; }
    const chMode = isRadio(ch) ? 'radio' : 'tv';
    if(chMode !== mode) setMode(chMode);
    selectChannel(ch.id);   // -> tvOnChannelChange
  }

  // called by script.js's selectChannel(), for zapping too
  window.tvOnChannelChange = function(ch){
    try { localStorage.setItem(LAST_CHANNEL_KEY, ch.id); } catch(e){}
    loadingText.textContent = 'טוען את ' + ch.name + '…';
    if(!browseOpen) showInfo(INFO_MS);
  };

  function toggleFavorite(ch){
    toggleFav(ch.id);   // saves and re-renders, which keeps the focus on this channel
    showToast(favorites.has(ch.id) ? `${ch.name} נוסף למועדפים` : `${ch.name} הוסר מהמועדפים`);
  }

  /* ---------- SETTINGS ---------- */
  /* A few plain switches instead of the desktop's five filter chips: never
     channels the check found blocked (and on the TV itself, only
     direct-stream ones); a switch decides about "unclear" ones, one (not on
     the TV) about broadcaster pages, and one keeps zapping to the
     favorites. Then the picture's brightness (not on the TV, which has its
     own picture settings - and a filter can keep a TV box from playing the
     video in hardware) and a legend of the cards' status dots. Kept between
     launches, unlike the desktop filters. */
  const tvSettings = {workingOnly: true, sitePages: true, favZap: false, brightness: 100};
  try { Object.assign(tvSettings, JSON.parse(localStorage.getItem(TV_SETTINGS_KEY))); } catch(e){}

  function saveTvSettings(){
    try { localStorage.setItem(TV_SETTINGS_KEY, JSON.stringify(tvSettings)); } catch(e){}
  }

  function applyTvSettings(){
    chkOk.checked = true;
    chkTimeout.checked = !tvSettings.workingOnly;
    chkBlocked.checked = false;
    chkStream.checked = true;
    chkSite.checked = !TV_DEVICE && tvSettings.sitePages;
    syncFiltersFromCheckboxes();   // re-renders the rows
    if(!TV_DEVICE) setBrightness(tvSettings.brightness);
    saveTvSettings();
  }

  // the remote's up / down, a swipe and the banner's arrows (not while the
  // all-channels view is up - nothing plays then)
  function tvZap(step){
    if(allMode) return false;
    return zap(step, !!tvSettings.favZap);
  }

  /* ---------- ALL CHANNELS ----------
     The menu's "all channels" button: the browser rises to fill the screen,
     with the logo above it, and the channel stops - nothing plays meanwhile
     (and the player's controls leave the menu). Picking a channel plays it
     and goes back to watching; Back, or the button again, brings the
     browser back down and the channel that was playing back on. */
  let allMode = false;
  let allResume = null;   // the channel that was playing: {id, source}

  /* The browser moves to its new place (the change) and is then slid there
     from where it was - a transform, smooth on a TV box too. */
  let morphTimer = null;
  function morphBrowse(change){
    const before = browse.getBoundingClientRect().top;
    change();
    const delta = before - browse.getBoundingClientRect().top;
    if(Math.abs(delta) < 1) return;
    browse.style.transition = 'none';
    browse.style.transform = `translateY(${delta}px)`;
    void browse.offsetHeight;
    browse.style.transition = 'transform .32s ease';
    browse.style.transform = '';
    clearTimeout(morphTimer);
    morphTimer = setTimeout(() => { browse.style.transition = ''; }, 400);
  }

  function setAllMode(on){
    allMode = on;
    body.classList.toggle('tv-all', on);
    relayout();   // (a scrolling list now / again)
    const cur = menuRow.items[menuRow.col];
    refreshMenu(cur && cur.id);
  }

  function openAll(){
    if(allMode) return;
    if(!browseOpen) openBrowse();
    clearTimeout(idleTimer);
    hideInfo();
    allResume = currentId && currentSource ? {id: currentId, source: currentSource} : null;
    if(allResume){
      stopPlayback();
      renderList();   // (the cards and the menu: nothing plays)
    }
    morphBrowse(() => setAllMode(true));
  }

  // resume: back to the channel that was playing (else a new one is about to)
  function closeAll(resume){
    if(!allMode) return;
    const back = resume ? allResume : null;
    allResume = null;
    if(resume) morphBrowse(() => setAllMode(false));
    else {
      // straight to the new channel - no slide back down under it
      browse.classList.add('tv-no-anim');
      setAllMode(false);
      requestAnimationFrame(() => requestAnimationFrame(() => browse.classList.remove('tv-no-anim')));
    }
    if(back && back.id === currentId) selectChannel(back.id, back.source);
    armIdle();
  }

  const SWITCHES = [
    {key: 'workingOnly', label: 'רק ערוצים שעובדים',
     note: 'כשכבוי, מוצגים גם ערוצים שהבדיקה לא הצליחה לאשר שהם עובדים'},
    {key: 'sitePages', label: 'ערוצים דרך אתר המשדר', shown: !TV_DEVICE,
     note: 'ערוצים בלי שידור ישיר, שמוצגים בעמוד השידור של המשדר עצמו'},
    {key: 'favZap', label: 'מעבר בין ערוצים רק במועדפים',
     note: TV_DEVICE ? 'החיצים ▲▼ עוברים רק בין הערוצים שבמועדפים'
                     : 'הערוץ הבא / הקודם (חיצים, החלקה) נבחר רק מבין המועדפים'},
  ].filter(s => s.shown !== false);
  const sheetActions = new Map();   // focusable element -> what OK does

  // the settings in one column, how to use it in the other (one below the
  // other on a narrow screen), the buttons under both
  const sheetMain = el('div', 'tv-sheet-main');
  const sheetCol = el('div', 'tv-sheet-col');
  sheetMain.append(sheetCol);
  sheetPanel.append(sheetMain);

  function addSheetItem(elm, run){
    elm.tabIndex = -1;
    elm.classList.add('tv-nav');
    sheetActions.set(elm, run);
  }

  const switchEls = SWITCHES.map(s => {
    const row = el('div', 'tv-switch');
    const text = el('div', 'tv-switch-text');
    text.append(el('div', 'tv-switch-label', s.label), el('div', 'tv-switch-note', s.note));
    row.append(text, el('div', 'tv-switch-knob'));
    addSheetItem(row, () => {
      tvSettings[s.key] = !tvSettings[s.key];
      applyTvSettings();
      refreshSheet();
    });
    sheetCol.append(row);
    return {row, key: s.key};
  });

  /* Brightness: a slider (by mouse or touch; with the keys, left / right
     move it the way its thumb goes - the page is RTL, so it grows leftward) */
  const BRIGHTNESS_STEP = 10;
  const brightRange = el('input', 'tv-slider-range');
  const brightValue = el('span', 'tv-slider-value');
  let brightRow = null;
  if(!TV_DEVICE){
    const row = el('div', 'tv-slider-row');
    const top = el('div', 'tv-slider-top');
    top.append(el('span', 'tv-switch-label', 'בהירות התמונה'), brightValue);
    brightRange.type = 'range';
    brightRange.min = 40;
    brightRange.max = 150;
    brightRange.step = 5;
    brightRange.tabIndex = -1;
    brightRange.setAttribute('aria-label', 'בהירות התמונה');
    row.append(top, brightRange);
    addSheetItem(row, () => {});
    brightRange.addEventListener('input', () => setTvBrightness(Number(brightRange.value)));
    sheetCol.append(row);
    brightRow = row;
  }

  function setTvBrightness(value){
    tvSettings.brightness = clamp(value, 40, 150);
    setBrightness(tvSettings.brightness);   // script.js
    saveTvSettings();
    refreshSheet();
  }

  // the status dots on the cards (a green one isn't shown - working is the norm)
  const legend = el('div', 'tv-legend');
  legend.append(el('span', 'tv-legend-title', 'מקרא:'));
  [['timeout', 'לא ברור'], ['blocked', 'חסום']].forEach(([status, label]) => {
    const item = el('span', 'tv-legend-item');
    item.append(el('span', 'tv-legend-dot ' + status), document.createTextNode(label));
    legend.append(item);
  });
  legend.append(el('span', 'tv-legend-note', 'ערוץ בלי נקודה עובד'));
  sheetCol.append(legend);

  /* How to use it - for what's in use when the sheet opens: the remote on
     the TV itself, touch, or else a computer's keyboard and mouse. */
  const HOW_TO = [
    {kind: 'remote', title: 'שלט', list: [
      ['▲▼', 'החלפת ערוץ'], ['OK', 'רשימת הערוצים, צפייה בערוץ'], ['החזקת OK', 'שינוי מועדפים'],
      ['חזור', TV_APP ? 'סגירה (פעמיים: יציאה מהאפליקציה)' : 'סגירה']]},
    {kind: 'keyboard', title: 'מקלדת', list: [
      ['▲▼', 'החלפת ערוץ'], ['Enter', 'רשימת הערוצים, צפייה בערוץ'], ['החזקת Enter', 'שינוי מועדפים'],
      ['Esc', 'סגירה'], ['הקלדה', 'חיפוש ערוץ'], ['F', 'מסך מלא'], ['M', 'השתקה'],
      ['+ / −', 'עוצמת הקול'], ['P', 'תמונה בתוך תמונה']]},
    {kind: 'mouse', title: 'עכבר', list: [
      ['הזזה', 'רשימת הערוצים'], ['★', 'שינוי מועדפים (בפינת ערוץ)'], ['גלגלת', 'מעבר בין שורות'],
      ['לחיצה כפולה', 'מסך מלא']]},
    {kind: 'touch', title: 'מגע', list: [
      ['הקשה על השידור', 'רשימת הערוצים'], ['החלקה ▲▼', 'החלפת ערוץ'],
      ['הקשה על ערוץ', 'צפייה'], ['לחיצה ארוכה', 'שינוי מועדפים']]},
  ];
  const howTo = el('div', 'tv-howto');
  howTo.append(el('div', 'tv-howto-title', 'איך משתמשים'));
  const howToGroups = HOW_TO.map(g => {
    const group = el('div', 'tv-howto-group');
    group.append(el('div', 'tv-howto-group-title', g.title), hints(g.list));
    howTo.append(group);
    return {kind: g.kind, group};
  });
  sheetMain.append(howTo);

  function refreshHowTo(){
    const kinds = TV_DEVICE ? ['remote'] : inputMode === 'touch' ? ['touch'] : ['keyboard', 'mouse'];
    howToGroups.forEach(g => { g.group.hidden = !kinds.includes(g.kind); });
  }

  const sheetButtons = el('div', 'tv-sheet-actions');
  [
    {label: 'בדיקת הערוצים מחדש', short: 'בדיקה מחדש', icon: 'mdi:refresh', run: () => {
      document.getElementById('retestBtn').click();
      showToast('בודק את הערוצים מחדש…');
    }},
    {label: 'אודות', icon: 'mdi:information-outline', run: () => { location.href = 'about.html'; }},
    {label: 'סגירה', icon: 'mdi:close', run: () => closeSheet()},
  ].forEach(b => {
    const btn = el('div', 'tv-btn');
    btn.append(icon(b.icon), el('span', b.short ? 'tv-label-full' : null, b.label));
    if(b.short) btn.append(el('span', 'tv-label-short', b.short));   // (portrait)
    btn.setAttribute('aria-label', b.label);
    addSheetItem(btn, b.run);
    sheetButtons.append(btn);
  });
  sheetPanel.append(sheetButtons);

  function refreshSheet(){
    switchEls.forEach(s => s.row.classList.toggle('on', !!tvSettings[s.key]));
    brightRange.value = tvSettings.brightness;
    brightValue.textContent = tvSettings.brightness + '%';
  }

  function openSheet(){
    sheetOpen = true;
    clearTimeout(idleTimer);
    refreshSheet();
    refreshHowTo();
    body.classList.add('tv-sheet-open');
    sheetPanel.scrollTop = 0;
    setFocus(switchEls[0].row);
  }

  function closeSheet(){
    sheetOpen = false;
    body.classList.remove('tv-sheet-open');
    if(browseOpen){
      focusAt(0, menuRow.items.findIndex(it => it.id === 'settings'));
      armIdle();
    }
  }

  /* Geometric arrow navigation between the sheet's controls: the nearest one
     beyond the current one's edge in that direction. */
  function moveFocusIn(scope, dir){
    const items = [...scope.querySelectorAll('.tv-nav')];
    const cur = focusedEl;
    if(!items.includes(cur)){ setFocus(items[0] || null); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const SLACK = 4;
    let best = null, bestScore = Infinity;
    items.forEach(item => {
      if(item === cur) return;
      const b = item.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      // from a wide control (a switch) down to a row of buttons, aim at the
      // row's start - its right end in RTL - rather than its middle
      const fromX = a.width > b.width * 2 ? a.right - b.width / 2 : ax;
      let main, cross;
      if(dir === 'down'){ if(b.top < a.bottom - SLACK) return; main = b.top - a.bottom; cross = bx - fromX; }
      if(dir === 'up'){ if(b.bottom > a.top + SLACK) return; main = a.top - b.bottom; cross = bx - fromX; }
      if(dir === 'right'){ if(b.left < a.right - SLACK) return; main = b.left - a.right; cross = by - ay; }
      if(dir === 'left'){ if(b.right > a.left + SLACK) return; main = a.left - b.right; cross = by - ay; }
      const score = Math.max(0, main) + Math.abs(cross) * 2;
      if(score < bestScore){ bestScore = score; best = item; }
    });
    if(!best) return;
    setFocus(best);
    best.scrollIntoView({block: 'nearest'});
  }

  /* ---------- STATUS CHECK PROGRESS ----------
     Mirrors script.js's "checking channels... X/Y" line into the browser. */
  function refreshStatusLine(){
    statusLine.hidden = statusProgress.hidden;
    statusText.textContent = statusProgressText.textContent;
  }
  new MutationObserver(refreshStatusLine).observe(statusProgress,
    {attributes: true, childList: true, subtree: true, characterData: true});
  refreshStatusLine();

  /* ---------- REMOTE KEYS ---------- */
  let press = null;        // OK held down on a card: {item, timer, long, since}
  let exitArmedAt = 0;
  let lastZapAt = 0;
  const ARROWS = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'};

  function onWatchingKey(e){
    switch(e.key){
      case 'ArrowUp':
      case 'ArrowDown':
        if(e.repeat && Date.now() - lastZapAt < ZAP_REPEAT_MS) break;
        lastZapAt = Date.now();
        tvZap(e.key === 'ArrowUp' ? 1 : -1);
        break;
      case 'Enter':
      case 'ArrowLeft':
      case 'ArrowRight':
        if(!e.repeat) openBrowse();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  function onBrowseKey(e){
    armIdle();
    switch(e.key){
      case 'ArrowLeft': focusAt(pos.r, pos.c + 1); break;    // RTL: the next card is on the left
      case 'ArrowRight': focusAt(pos.r, pos.c - 1); break;
      case 'ArrowDown': moveRow(1); break;
      case 'ArrowUp': moveRow(-1); break;
      case 'Enter': {
        // a channel plays on release; held down, it becomes a favorite instead.
        // "Held" is the system's own key repeat - another keydown before the
        // keyup, which comes after about half a second (Android TV's WebView
        // doesn't always flag it as a repeat) - with a timer as a fallback for
        // remotes that don't repeat.
        if(press && Date.now() - press.since > 3000) press = null;   // its keyup got lost
        if(e.repeat || press){
          if(press && !press.long) longPress(press);
          break;
        }
        const item = rows[pos.r] && rows[pos.r].items[pos.c];
        if(!item) break;
        if(item.run){ item.run(); break; }
        if(!item.ch) break;
        const p = {item, long: false, since: Date.now()};
        p.timer = setTimeout(() => longPress(p), LONG_PRESS_MS);
        press = p;
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  }

  function longPress(p){
    clearTimeout(p.timer);
    if(p.long) return;
    p.long = true;
    toggleFavorite(p.item.ch);
  }

  function onSheetKey(e){
    const dir = ARROWS[e.key];
    if(brightRow && focusedEl === brightRow && (dir === 'left' || dir === 'right')){
      setTvBrightness(tvSettings.brightness + (dir === 'left' ? 1 : -1) * BRIGHTNESS_STEP);
      e.preventDefault();
      return;
    }
    if(dir) moveFocusIn(sheetPanel, dir);
    else if(e.key === 'Enter'){
      const run = sheetActions.get(focusedEl);
      if(run && !e.repeat) run();
    }
    else return;
    e.preventDefault();
  }

  /* A computer's keyboard: F full screen, M mute, + / - volume, P picture
     in picture, and any other letter or digit starts a search with it
     (going by the character typed, so a Hebrew letter on those keys
     searches). */
  function keyboardShortcut(e){
    if(e.ctrlKey || e.metaKey || e.altKey || sheetOpen) return false;
    const k = e.key;
    if(k === 'f' || k === 'F'){ toggleFullscreen(); return true; }
    if(TV_DEVICE) return false;
    if(k === 'm' || k === 'M'){ toggleMute(); return true; }
    if(k === 'p' || k === 'P'){ togglePip(); return true; }
    if(k === '+' || k === '='){ stepVolume(10); return true; }
    if(k === '-'){ stepVolume(-10); return true; }
    if(k.length === 1 && /[\p{L}\p{N}]/u.test(k)){ openSearch(k); return true; }
    return false;
  }

  document.addEventListener('keydown', (e) => {
    // typing a search (on a phone's keyboard too - so that isn't a switch
    // to the keyboard): the field gets the keys, except Escape
    const typing = e.target === searchInput;
    if(!typing) setInputMode('remote');
    if(e.key === 'Escape' || e.key === 'GoBack'){
      e.preventDefault();
      window.tvBack();
      return;
    }
    if(typing){ onSearchKey(e); return; }
    if(keyboardShortcut(e)){
      e.preventDefault();
      return;
    }
    if(e.key === 'ChannelUp' || e.key === 'ChannelDown'){
      e.preventDefault();
      tvZap(e.key === 'ChannelUp' ? 1 : -1);
      return;
    }
    if(sheetOpen) onSheetKey(e);
    else if(browseOpen) onBrowseKey(e);
    else onWatchingKey(e);
  });

  document.addEventListener('keyup', (e) => {
    if(e.key !== 'Enter' || !press) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    // by id: a status update may have re-rendered the cards meanwhile
    const item = rows[pos.r] && rows[pos.r].items[pos.c];
    if(!p.long && browseOpen && !sheetOpen && item && item.id === p.item.id) play(p.item.ch);
  });

  /* Called by the Android app for Back (the remote's, or a phone's) - and Escape here:
     true when the page handled it, false to let the app exit. */
  window.tvBack = function(){
    if(sheetOpen){ closeSheet(); return true; }
    if(searching){ closeSearch(); focusMenu('search'); return true; }
    if(allMode){ closeAll(true); return true; }
    if(browseOpen && !portrait){ closeBrowse(); return true; }   // (in portrait it stays open)
    if(!TV_APP && !MOBILE_APP) return true;   // a browser has nothing to exit
    if(Date.now() - exitArmedAt < EXIT_CONFIRM_MS) return false;
    exitArmedAt = Date.now();
    showToast('לחצו שוב על "חזור" כדי לצאת');
    return true;
  };

  /* For script.js's automatic rechecks: someone is using the channel rows
     right now (they're open, and touched / pressed in the last few seconds),
     so a channel that came back waits before it appears among them. */
  let lastInputAt = 0;
  ['keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(type => {
    window.addEventListener(type, () => { lastInputAt = Date.now(); }, {capture: true, passive: true});
  });
  window.tvBusy = function(){
    return (browseOpen || allMode || searching) && Date.now() - lastInputAt < 8000;
  };

  // channel up/down keys, for remotes that have them (called by the app)
  window.tvChannel = function(step){ tvZap(step); };

  /* The app calls these when it goes to the background (Home button) and
     comes back, so a channel doesn't keep playing behind other apps. */
  let suspended = null;
  window.tvPause = function(){
    if(!currentId || !currentSource) return;
    suspended = {id: currentId, source: currentSource};
    stopPlayback();
  };
  window.tvResume = function(){
    if(!suspended) return;
    const {id, source} = suspended;
    suspended = null;
    if(id === currentId) selectChannel(id, source);
  };

  /* The app on a phone or tablet keeps a radio station playing in the
     background (with a notification and lock screen controls), so it's told
     what plays whenever that changes. */
  function reportNowPlaying(){
    if(!window.ZapZapAndroid) return;
    const station = RADIO_CHANNELS.find(c => c.id === currentId);
    const radio = !!station && currentSource === 'stream';
    try {
      ZapZapAndroid.nowPlaying(radio, radio && !playerVideo.paused,
                               station ? station.name : '', station ? station.group : '');
    } catch(e){}
  }
  ['playing', 'pause', 'emptied'].forEach(type => playerVideo.addEventListener(type, reportNowPlaying));

  /* ---------- MOUSE AND TOUCH ---------- */
  /* What was used last decides the hints (tv.css: body.tv-pointer hides
     them, body.tv-touch shows the touch ones), how long the browser stays,
     and how the rows scroll - so switching to / from touch re-places them. */
  function setInputMode(m){
    if(m === inputMode) return;
    const wasNative = nativeRows();
    inputMode = m;
    body.classList.toggle('tv-pointer', m === 'mouse');
    body.classList.toggle('tv-touch', m === 'touch');
    if(nativeRows() !== wasNative) relayout();
    fitBar();   // (the bar's channels button is for touch)
  }

  document.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'mouse') setInputMode('mouse');
    else setInputMode('touch');   // a finger or a pen
  }, true);

  // which row / item an element belongs to
  function itemAt(target){
    for(let r = 0; r < rows.length; r++){
      const c = rows[r].items.findIndex(it => it.el.contains(target));
      if(c !== -1) return {r, c, item: rows[r].items[c]};
    }
    return null;
  }

  let lastMouse = null;
  document.addEventListener('pointermove', (e) => {
    if(e.pointerType !== 'mouse') return;
    // ignore the tiny / synthetic moves a layout change under a resting pointer causes
    if(lastMouse && Math.abs(e.clientX - lastMouse.x) + Math.abs(e.clientY - lastMouse.y) < 4) return;
    lastMouse = {x: e.clientX, y: e.clientY};
    setInputMode('mouse');
    body.classList.remove('tv-cursor-hidden');
    if(sheetOpen) return;
    if(!browseOpen) openBrowse();
    armIdle();
  });

  /* Over a broadcaster's page the browser only tells the page itself where
     the mouse is, so there the browser opens from the parts that are ours:
     the bar at the top, and the screen's bottom edge (tv.css: a strip with a
     handle, like an auto-hiding taskbar). Touch has the bar's button. */
  const edge = el('div', 'tv-edge');
  ui.append(edge);
  edge.addEventListener('pointerenter', (e) => {
    if(e.pointerType !== 'mouse') return;
    setInputMode('mouse');
    openBrowse();
    armIdle();
  });

  browse.addEventListener('pointerenter', () => { pointerOverBrowser = true; });
  browse.addEventListener('pointerleave', () => { pointerOverBrowser = false; });
  info.addEventListener('pointerenter', () => { pointerOverInfo = true; });
  info.addEventListener('pointerleave', () => { pointerOverInfo = false; });
  // touching or scrolling the browser keeps it up (scroll doesn't bubble - capture)
  browse.addEventListener('pointerdown', () => armIdle());
  browse.addEventListener('scroll', () => { if(inputMode === 'touch') armIdle(); }, {capture: true, passive: true});

  [browse, sheetPanel].forEach(area => area.addEventListener('mouseover', (e) => {
    if(inputMode !== 'mouse') return;
    if(area === sheetPanel){
      const control = [...sheetActions.keys()].find(k => k.contains(e.target));
      if(control) setFocus(control);
      return;
    }
    if(document.activeElement === searchInput) return;   // typing - keep the field focused
    const hit = itemAt(e.target);
    if(hit) hoverFocus(hit.r, hit.c);
  }));

  /* A finger held on a card toggles it as a favorite - the touch version of
     holding OK. Moving it (scrolling the row) or lifting it early cancels;
     the click that may follow the hold doesn't also play the channel. */
  let touchHold = null;
  let noClickUntil = 0;
  function cancelHold(){
    if(touchHold) clearTimeout(touchHold.timer);
    touchHold = null;
  }
  browse.addEventListener('pointerdown', (e) => {
    cancelHold();
    if(e.pointerType === 'mouse') return;
    const hit = itemAt(e.target);
    if(!hit || !hit.item.ch) return;
    const hold = {x: e.clientX, y: e.clientY};
    hold.timer = setTimeout(() => {
      touchHold = null;
      noClickUntil = Date.now() + 800;
      if(navigator.vibrate) navigator.vibrate(20);
      toggleFavorite(hit.item.ch);
    }, LONG_TOUCH_MS);
    touchHold = hold;
  });
  browse.addEventListener('pointermove', (e) => {
    if(touchHold && Math.abs(e.clientX - touchHold.x) + Math.abs(e.clientY - touchHold.y) > 10) cancelHold();
  });
  ['pointerup', 'pointercancel'].forEach(type => browse.addEventListener(type, cancelHold));
  // no text selection / system menu for a held card
  browse.addEventListener('contextmenu', (e) => { if(inputMode === 'touch') e.preventDefault(); });

  browse.addEventListener('click', (e) => {
    if(Date.now() < noClickUntil) return;
    const arrow = e.target.closest('.tv-row-arrow');
    if(arrow){
      const row = rows.find(r => r.track && r.track.contains(arrow));
      if(row) pageRow(row, arrow === row.onArrow ? 1 : -1);
      return;
    }
    const hit = itemAt(e.target);
    if(!hit || (!hit.item.run && !hit.item.ch)) return;   // (the search field)
    if(hit.item.run) hit.item.run();
    else if(e.target.closest('.tv-card-fav')) toggleFavorite(hit.item.ch);
    else play(hit.item.ch);
  });

  sheet.addEventListener('click', (e) => {
    const control = [...sheetActions.keys()].find(k => k.contains(e.target));
    if(control){ setFocus(control); sheetActions.get(control)(); }
    else if(!sheetPanel.contains(e.target)) closeSheet();   // the backdrop
  });

  /* On the picture itself: a click / tap shows or hides the browser, a
     double click toggles full screen, and a vertical swipe changes channel
     like the remote's up / down (up = the next one). tv.css turns off the
     browser's own touch gestures there (touch-action), so the swipe arrives
     whole and doesn't pull the page to reload. */
  let swipe = null;
  playerShell.addEventListener('pointerdown', (e) => {
    swipe = e.pointerType === 'mouse' ? null : {x: e.clientX, y: e.clientY};
  });
  playerShell.addEventListener('pointercancel', () => { swipe = null; });
  playerShell.addEventListener('pointerup', (e) => {
    if(!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if(Math.abs(dy) < SWIPE_PX || Math.abs(dy) < Math.abs(dx) * 1.5) return;
    noClickUntil = Date.now() + 500;
    tvZap(dy < 0 ? 1 : -1);
  });

  playerShell.addEventListener('click', () => {
    if(sheetOpen || Date.now() < noClickUntil) return;
    if(browseOpen) closeBrowse();
    else openBrowse();
  });
  playerShell.addEventListener('dblclick', toggleFullscreen);

  /* Full screen (double click, F, or the menu's button - the only way on a
     phone). A phone held upright also turns to landscape for it, where the
     browser supports that (Android); leaving full screen lets it turn back. */
  function toggleFullscreen(){
    if(TV_APP || !document.fullscreenEnabled) return;   // the app is full screen already
    if(document.fullscreenElement){ document.exitFullscreen().catch(() => {}); return; }
    document.documentElement.requestFullscreen().then(() => {
      if(portrait && inputMode === 'touch' && screen.orientation && screen.orientation.lock){
        screen.orientation.lock('landscape').catch(() => {});
      }
    }).catch(() => {});
  }

  const fullButton = menuButtons.find(b => b.m.id === 'full').btn;
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    const label = on ? 'יציאה ממסך מלא' : 'מסך מלא';
    fullButton.replaceChildren(icon(on ? 'mdi:fullscreen-exit' : 'mdi:fullscreen'), el('span', null, label));
    fullButton.setAttribute('aria-label', label);
    fitMenu();
  });

  /* The wheel moves between rows - in portrait it just scrolls the list -
     and sideways (a trackpad, or Shift) along a row. */
  let wheelSum = 0, wheelQuietUntil = 0;
  rowsView.addEventListener('wheel', (e) => {
    armIdle();
    const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if(sideways){
      e.preventDefault();
      const row = rows.find(r => r.track && r.track.contains(e.target));
      // a positive deltaX moves the view right - back toward a RTL row's start
      if(row) setShift(row, row.shift + (e.shiftKey ? e.deltaY : -e.deltaX));
      return;
    }
    if(nativeList()) return;
    e.preventDefault();
    // a mouse wheel's notch is one row; a trackpad's stream of small deltas
    // adds up to one, with a pause so a single swipe doesn't fly past rows
    // (a fast spin can arrive as one event carrying several notches)
    const notch = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50;
    if(Date.now() < wheelQuietUntil) return;
    wheelSum += e.deltaY;
    if(!notch && Math.abs(wheelSum) < 80) return;
    const steps = notch && e.deltaMode === 0 ? clamp(Math.round(Math.abs(wheelSum) / 100), 1, 3) : 1;
    for(let i = 0; i < steps; i++) moveRow(wheelSum > 0 ? 1 : -1);
    wheelSum = 0;
    wheelQuietUntil = Date.now() + (notch ? 60 : 300);
  }, {passive: false});

  /* A browser that blocked autoplay with sound started the channel muted
     (script.js's playVideo and autoMuted - the mute button shows it); the
     first click, tap or key brings the sound back - a user gesture is all
     the browser asks for. A touch counts as one only once the finger lifts
     (unmuting before that would pause it). The volume controls and M are
     left to do it themselves, and a mute the viewer chose stays. */
  function isActivation(e){
    if(e.type === 'keydown') return e.key !== 'm' && e.key !== 'M';
    if(volumeBox.contains(e.target)) return false;
    return e.pointerType === 'mouse' ? e.type === 'pointerdown' : e.type === 'pointerup';
  }
  ['pointerdown', 'pointerup', 'keydown'].forEach(type => document.addEventListener(type, (e) => {
    if(!autoMuted || !playerVideo.muted || currentSource !== 'stream' || !isActivation(e)) return;
    autoMuted = false;
    playerVideo.muted = false;
    if(playerVideo.paused) playerVideo.play().catch(() => {});
  }, true));

  /* ---------- LAYOUT ----------
     Sizes follow the window (tv.css's --u). A tall window (a phone held
     upright) gets the portrait layout, where the browser is always open;
     turning to landscape goes back to watching full screen. */
  function applyOrientation(){
    // (a phone's on-screen keyboard shrinks the window - not a rotation)
    if(document.activeElement === searchInput) return;
    const tall = !TV_APP && innerHeight > innerWidth;
    if(tall === portrait) return;
    portrait = tall;
    body.classList.toggle('tv-portrait', portrait);
    refreshMenu(menuRow.items[menuRow.col] && menuRow.items[menuRow.col].id);
    if(portrait) openBrowse();
    else closeBrowse();
  }

  window.addEventListener('resize', () => {
    applyOrientation();
    relayout();
    fitBar();
    fitMenu();
  });

  /* ---------- START ----------
     Like a TV: straight to the last channel watched (or the first favorite
     TV channel, or the first one) - on the TV itself, one with a direct
     stream. A first-time viewer also gets the channel browser, to see
     what's there. */
  applyTvSettings();
  if(!TV_APP && matchMedia('(pointer: coarse)').matches) setInputMode('touch');   // a phone / tablet
  document.documentElement.style.overscrollBehavior = 'none';   // no pull-to-reload on a phone
  let lastId = null;
  try { lastId = localStorage.getItem(LAST_CHANNEL_KEY); } catch(e){}
  const startChannel = [findAny(lastId), ...TV_CHANNELS.filter(c => favorites.has(c.id)), ...TV_CHANNELS]
    .find(c => c && (c.stream || !TV_DEVICE));
  play(startChannel);
  applyOrientation();
  if(!lastId) setTimeout(openBrowse, 1500);
})();
