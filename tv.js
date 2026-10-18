/* TV TIME - the TV (remote control) interface.
   Only active in TV mode (TV_MODE in script.js: the Android TV app, or ?tv in
   the address). The desktop / mobile layout is hidden and the player fills
   the screen; everything else is drawn over it and driven by the remote:
   - Watching: up/down change channel, OK / left / right open the channel
     browser, Back twice exits. A channel change shows an info banner.
   - Browser: a menu row and rows of channel cards at the bottom (favorites,
     then each category); OK plays, holding OK toggles a favorite, Back
     closes. It also closes by itself after a while without a key press.
   - Settings: a sheet with a simple display switch (kept between launches),
     a status re-check and About.
   Only channels with a direct stream are offered: a broadcaster's page can't
   be operated with a remote. (A radio station without one doesn't appear;
   the radio rows and menu shortcut show the ones that have it.)
   It builds on script.js's state and functions (selectChannel, zap,
   matchesFilters, favorites...), which are shared globals. */
(function(){
  if(!TV_MODE) return;

  const LAST_CHANNEL_KEY = 'tvtime:lastChannel';
  const TV_SETTINGS_KEY = 'tvtime:tvSettings';
  const BROWSE_IDLE_MS = 15000;   // the browser closes after this long without a key
  const INFO_MS = 4500;           // how long the info banner stays after a channel change
  const EXIT_CONFIRM_MS = 2500;   // a second Back within this exits the app
  const LONG_PRESS_MS = 650;      // holding OK this long on a card toggles a favorite
  const ZAP_REPEAT_MS = 350;      // a held up/down zaps at most this often
  const PEEK_PX = 60;             // a row keeps this much of the next card in view

  const body = document.body;
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

  // a line of remote-key hints: [['▲▼', 'החלפת ערוץ'], ...]
  function hints(list, cls){
    const wrap = el('div', 'tv-hints' + (cls ? ' ' + cls : ''));
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
  const infoText = el('div', 'tv-info-text');
  infoText.append(infoName, infoSub, hints([['▲▼', 'החלפת ערוץ'], ['OK', 'רשימת הערוצים']], 'tv-info-hint'));
  const clock = el('div', 'tv-clock');
  const liveLabel = el('span');
  const liveBadge = el('div', 'tv-live');
  liveBadge.append(el('span', 'tv-live-dot'), liveLabel);
  const infoSide = el('div', 'tv-info-side');
  infoSide.append(clock, liveBadge);
  info.append(infoAvatar, infoText, infoSide);

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
  foot.append(statusLine, hints([['OK', 'צפייה'], ['החזקת OK', 'הוספה / הסרה ממועדפים'], ['חזור', 'סגירה']]));
  browse.append(menuEl, rowsView, foot);

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
  playerEmpty.append(hints([['▲▼', 'ערוץ אחר'], ['OK', 'רשימת הערוצים']]));

  /* ---------- INFO BANNER ---------- */
  function timeNow(){
    return new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'});
  }

  function refreshInfo(){
    clock.textContent = timeNow();
    const ch = currentId ? findAny(currentId) : null;
    if(!ch){
      infoAvatar.textContent = 'TV';
      infoAvatar.classList.remove('avatar-long');
      infoAvatar.style.background = '';
      infoAvatar.style.color = '';
      infoName.textContent = 'TV TIME';
      infoSub.textContent = 'בחרו ערוץ מהרשימה';
      liveLabel.textContent = 'שידור חי';
      return;
    }
    setAvatar(infoAvatar, ch);
    infoAvatar.style.background = ch.color + '33';
    infoAvatar.style.color = ch.color;
    infoName.textContent = ch.name;
    const source = currentSource === 'stream' ? 'נגן ישיר' : currentSource === 'link' ? 'אתר המשדר' : '';
    infoSub.textContent = [ch.group, source].filter(Boolean).join(' · ');
    liveLabel.textContent = isRadio(ch) ? 'רדיו חי' : 'שידור חי';
  }
  setInterval(() => { clock.textContent = timeNow(); }, 15000);

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
  /* `shownIf`: a shortcut appears only while there's a row to jump to */
  const MENU = [
    {id: 'fav', label: 'מועדפים', icon: 'mdi:star',
     run: () => jumpTo(row => row.key === 'fav', 'אין עדיין מועדפים - החזיקו OK על ערוץ כדי להוסיף אותו')},
    {id: 'tv', label: 'טלוויזיה', icon: 'mdi:television-classic',
     run: () => jumpTo(row => row.kind === 'tv'), shownIf: () => rows.some(row => row.kind === 'tv')},
    {id: 'radio', label: 'רדיו', icon: 'mdi:radio',
     run: () => jumpTo(row => row.kind === 'radio'), shownIf: () => rows.some(row => row.kind === 'radio')},
    {id: 'settings', label: 'הגדרות', icon: 'mdi:cog-outline', run: () => openSheet()},
    {id: 'about', label: 'אודות', icon: 'mdi:information-outline', run: () => { location.href = 'about.html'; }},
  ];

  const menuRow = {key: 'menu', items: [], col: 0};
  const menuButtons = MENU.map(m => {
    const btn = el('div', 'tv-btn');
    btn.tabIndex = -1;
    btn.append(icon(m.icon), el('span', null, m.label));
    menuEl.append(btn);
    return {m, btn};
  });

  function refreshMenu(rememberedId){
    menuRow.items = [];
    menuButtons.forEach(({m, btn}) => {
      const shown = !m.shownIf || m.shownIf();
      btn.hidden = !shown;
      if(shown) menuRow.items.push({id: m.id, el: btn, run: m.run});
    });
    menuRow.col = Math.max(0, menuRow.items.findIndex(it => it.id === rememberedId));
  }
  const brand = el('div', 'tv-brand');
  brand.append(document.createTextNode('TV '), el('span', null, 'TIME'));
  menuEl.append(brand);

  /* rows[0] is the menu; the rest are channel rows:
     {key, kind: 'fav'|'tv'|'radio', el, track, strip, items: [{id, el, ch}], col, shift} */
  let rows = [menuRow];
  let pos = {r: 0, c: 0};          // the focused row / item while the browser is open
  let renderedSignature = null;
  let browseOpen = false;
  let sheetOpen = false;
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
    const fav = icon('mdi:star');
    fav.classList.add('tv-card-fav');
    card.append(el('span', 'tv-card-dot'), fav, label, el('div', 'tv-card-name', ch.name), playing);
    return card;
  }

  function emptyRowsText(){
    const checking = allChannels().some(c => c.stream && (c.status === 'idle' || c.status === 'testing'));
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
      track.append(strip);
      rowEl.append(title, track);
      rowsStrip.append(rowEl);
      const items = m.channels.map(ch => {
        const card = makeCard(ch);
        strip.append(card);
        return {id: ch.id, el: card, ch};
      });
      const col = Math.max(0, items.findIndex(it => it.id === remembered.get(m.key)));
      rows.push({key: m.key, kind: m.kind, el: rowEl, track, strip, items, col, shift: 0});
    });
    if(rows.length === 1) rowsStrip.append(el('div', 'tv-empty', emptyRowsText()));
    refreshMenu(remembered.get('menu'));

    withoutAnimation(() => {
      rows.forEach(row => { if(row.strip && row.col) scrollRowTo(row, row.items[row.col].el); });
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
     TV box). Distances are measured from the row's start, its right edge. */
  function scrollRowTo(row, card){
    const pad = parseFloat(getComputedStyle(row.track).paddingRight) || 0;
    const view = row.track.clientWidth - pad * 2;
    const total = row.strip.offsetWidth;
    const start = total - (card.offsetLeft + card.offsetWidth);
    const end = start + card.offsetWidth;
    let shift = row.shift;
    if(start - PEEK_PX < shift) shift = start - PEEK_PX;
    if(end + PEEK_PX > shift + view) shift = end + PEEK_PX - view;
    row.shift = clamp(shift, 0, Math.max(0, total - view));
    row.strip.style.transform = `translateX(${row.shift}px)`;
  }

  function focusAt(r, c){
    r = clamp(r, 0, rows.length - 1);
    const row = rows[r];
    if(!row.items.length) return;
    c = clamp(c, 0, row.items.length - 1);
    pos = {r, c};
    row.col = c;
    const item = row.items[c];
    setFocus(item.el);
    // the focused channel row lines up at the top of the rows view; on the
    // menu, the first channel row does
    const lineUp = r === 0 ? rows[1] : row;
    rowsStrip.style.transform = lineUp ? `translateY(${-lineUp.el.offsetTop}px)` : '';
    if(row.strip) scrollRowTo(row, item.el);
  }

  function moveRow(step){
    for(let r = pos.r + step; r >= 0 && r < rows.length; r += step){
      if(rows[r].items.length){ focusAt(r, rows[r].col); return; }
    }
  }

  function jumpTo(test, emptyMessage){
    const r = rows.findIndex((row, i) => i > 0 && test(row));
    if(r === -1){ if(emptyMessage) showToast(emptyMessage); return; }
    focusAt(r, rows[r].col);
  }

  function focusPlaying(){
    focusPlayingWhenReady = false;
    const r = rows.findIndex((row, i) => i > 0 && row.items.some(it => it.id === currentId));
    if(r !== -1) focusAt(r, rows[r].items.findIndex(it => it.id === currentId));
    else if(rows.length > 1) focusAt(1, 0);
    else { focusAt(0, 0); focusPlayingWhenReady = true; }
  }

  /* ---------- BROWSER OPEN / CLOSE ---------- */
  let idleTimer = null;
  function armIdle(){
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if(!sheetOpen) closeBrowse(); }, BROWSE_IDLE_MS);
  }

  function openBrowse(){
    if(browseOpen) return;
    browseOpen = true;
    hideInfo();
    refreshInfo();
    body.classList.add('tv-browse-open');
    withoutAnimation(focusPlaying);
    armIdle();
  }

  function closeBrowse(){
    if(!browseOpen) return;
    browseOpen = false;
    focusPlayingWhenReady = false;
    clearTimeout(idleTimer);
    body.classList.remove('tv-browse-open');
    setFocus(null);
    if(document.activeElement && document.activeElement !== body) document.activeElement.blur();
  }

  /* ---------- PLAYING ---------- */
  function play(ch){
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
  /* One plain switch instead of the desktop's five filter chips: the TV only
     offers direct-stream channels, never ones the check found blocked, and
     the switch decides about "unclear" ones. Kept between launches, unlike
     the desktop filters. */
  const tvSettings = {workingOnly: true};
  try { Object.assign(tvSettings, JSON.parse(localStorage.getItem(TV_SETTINGS_KEY))); } catch(e){}

  function applyTvSettings(){
    chkOk.checked = true;
    chkTimeout.checked = !tvSettings.workingOnly;
    chkBlocked.checked = false;
    chkStream.checked = true;
    chkSite.checked = false;
    syncFiltersFromCheckboxes();   // re-renders the rows
    try { localStorage.setItem(TV_SETTINGS_KEY, JSON.stringify(tvSettings)); } catch(e){}
  }

  const SWITCHES = [
    {key: 'workingOnly', label: 'רק ערוצים שעובדים',
     note: 'כשכבוי, מוצגים גם ערוצים שהבדיקה לא הצליחה לאשר שהם עובדים'},
  ];
  const sheetActions = new Map();   // focusable element -> what OK does

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
    sheetPanel.append(row);
    return {row, key: s.key};
  });

  const sheetButtons = el('div', 'tv-sheet-actions');
  [
    {label: 'בדיקת הערוצים מחדש', icon: 'mdi:refresh', run: () => {
      document.getElementById('retestBtn').click();
      showToast('בודק את הערוצים מחדש…');
    }},
    {label: 'אודות', icon: 'mdi:information-outline', run: () => { location.href = 'about.html'; }},
    {label: 'סגירה', icon: 'mdi:close', run: () => closeSheet()},
  ].forEach(b => {
    const btn = el('div', 'tv-btn');
    btn.append(icon(b.icon), el('span', null, b.label));
    addSheetItem(btn, b.run);
    sheetButtons.append(btn);
  });
  sheetPanel.append(sheetButtons);

  function refreshSheet(){
    switchEls.forEach(s => s.row.classList.toggle('on', !!tvSettings[s.key]));
  }

  function openSheet(){
    sheetOpen = true;
    clearTimeout(idleTimer);
    refreshSheet();
    body.classList.add('tv-sheet-open');
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
    if(best) setFocus(best);
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
        zap(e.key === 'ArrowUp' ? 1 : -1);
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
    if(dir) moveFocusIn(sheetPanel, dir);
    else if(e.key === 'Enter'){
      const run = sheetActions.get(focusedEl);
      if(run && !e.repeat) run();
    }
    else return;
    e.preventDefault();
  }

  document.addEventListener('keydown', (e) => {
    if(e.key === 'ChannelUp' || e.key === 'ChannelDown'){
      e.preventDefault();
      zap(e.key === 'ChannelUp' ? 1 : -1);
      return;
    }
    if(e.key === 'Escape' || e.key === 'GoBack'){
      e.preventDefault();
      window.tvBack();
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

  /* Called by the Android app for the remote's Back button: true when the
     page handled it, false to let the app exit. */
  window.tvBack = function(){
    if(sheetOpen){ closeSheet(); return true; }
    if(browseOpen){ closeBrowse(); return true; }
    if(Date.now() - exitArmedAt < EXIT_CONFIRM_MS) return false;
    exitArmedAt = Date.now();
    showToast('לחצו שוב על "חזור" כדי לצאת');
    return true;
  };

  // channel up/down keys, for remotes that have them (called by the app)
  window.tvChannel = function(step){ zap(step); };

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

  /* ---------- START ----------
     Like a TV: straight to the last channel watched (or the first favorite
     TV channel, or the first one) - one with a direct stream. A first-time
     viewer also gets the channel browser, to see what's there. */
  applyTvSettings();
  let lastId = null;
  try { lastId = localStorage.getItem(LAST_CHANNEL_KEY); } catch(e){}
  const startChannel = [findAny(lastId), ...TV_CHANNELS.filter(c => favorites.has(c.id)), ...TV_CHANNELS]
    .find(c => c && c.stream);
  play(startChannel);
  if(!lastId) setTimeout(openBrowse, 1500);
})();
