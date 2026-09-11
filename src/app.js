/* ==========================================================================
   40 Love — app.js
   A tennis club for players forty and over. No frameworks, no build step.

   Structure
   1. Hygiene: escaping, sanitizing, freezing, guarded storage
   2. Data (frozen)
   3. State + persistence (storage treated as untrusted input)
   4. View builders (return HTML strings; every dynamic value is escaped)
   5. Render / targeted updates
   6. Actions
   7. Event delegation (one click/input/change/keydown listener each)
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 1. hygiene */
  var MAX_MSG_LEN = 280, MAX_HISTORY = 200, SEND_COOLDOWN_MS = 600;
  var MAX_NOTE_LEN = 140, MAX_NAME_LEN = 60, MAX_QUERY_LEN = 40, MAX_CREATED = 20;
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
  function clean(s, max) {
    if (typeof s !== 'string') return '';
    // eslint-disable-next-line no-control-regex -- intentionally strips control characters
    return s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s{3,}/g, '  ').trim().slice(0, max || MAX_MSG_LEN);
  }
  function deepFreeze(o) {
    Object.getOwnPropertyNames(o).forEach(function (k) { var v = o[k]; if (v && typeof v === 'object') deepFreeze(v); });
    return Object.freeze(o);
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function timeNow() {
    try { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return 'now'; }
  }
  /* localStorage may be unavailable (private mode, sandboxed viewers). Every call is guarded. */
  var store = {
    get: function (k) { try { var v = window.localStorage.getItem('40love:' + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem('40love:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    clear: function () {
      try {
        var ks = [], i;
        for (i = 0; i < window.localStorage.length; i++) { var key = window.localStorage.key(i); if (key && key.indexOf('40love:') === 0) ks.push(key); }
        ks.forEach(function (key) { window.localStorage.removeItem(key); });
      } catch (e) { /* ignore */ }
    }
  };

  /* ---------------------------------------------------------------- 2. data */
  var STORY = deepFreeze({
    lines: [
      'My mom and I built 40 Love for the love of connecting with others on the court.',
      'Tennis gave us new friends, new courts, and a reason to get outside and play. We wanted that for everyone who is forty and over: no swiping, no pressure. Just good people, good tennis, and the occasional glass of something after.'
    ],
    signature: 'Joyce, co-founder, with her son'
  });
  var ME = deepFreeze({ name: 'You', initials: 'ME', ntrp: 3.5 });
  var COURTS = deepFreeze([
    { id: 1, name: 'Laurelhurst Park Courts', short: 'Laurelhurst', x: 30, y: 38, surface: 'Hard', lights: true, fav: true, dist: '0.8 mi' },
    { id: 2, name: 'Grant Park Tennis', short: 'Grant Park', x: 63, y: 24, surface: 'Hard', lights: true, fav: false, dist: '1.4 mi' },
    { id: 3, name: 'Mt. Tabor Courts', short: 'Mt. Tabor', x: 76, y: 60, surface: 'Hard', lights: false, fav: false, dist: '2.1 mi' },
    { id: 4, name: 'Sellwood Riverside', short: 'Sellwood', x: 42, y: 78, surface: 'Clay', lights: false, fav: true, dist: '2.9 mi' },
    { id: 5, name: 'Irving Park', short: 'Irving Park', x: 16, y: 62, surface: 'Hard', lights: true, fav: false, dist: '1.1 mi' }
  ]);
  var PEOPLE = deepFreeze([
    { name: 'Maggie R.', age: 52, ntrp: 3.5, ranked: false, initials: 'MR' },
    { name: 'Dev P.', age: 47, ntrp: 4.0, ranked: true, rank: 'USTA 4.0, No. 212', initials: 'DP' },
    { name: 'Hana K.', age: 44, ntrp: 3.0, ranked: false, initials: 'HK' },
    { name: 'Tomás L.', age: 61, ntrp: 4.5, ranked: true, rank: 'Senior circuit, No. 88', initials: 'TL' }
  ]);
  var REQUESTS = deepFreeze([
    { id: 1, host: 0, courtId: 1, when: 'Today, 5:30 PM', type: 'Doubles', spots: 2, level: '3.0–3.5', note: 'Casual hit, all welcome. Coffee after.' },
    { id: 2, host: 1, courtId: 2, when: 'Tomorrow, 7:00 AM', type: 'Singles', spots: 1, level: '3.5–4.0', note: 'Early-bird singles before work.' },
    { id: 3, host: 2, courtId: 5, when: 'Saturday, 10:00 AM', type: 'Social', spots: 4, level: 'All levels', note: 'New to the area and hoping to meet people.' },
    { id: 4, host: 3, courtId: 3, when: 'Sunday, 4:00 PM', type: 'Doubles', spots: 2, level: '4.0+', note: 'Looking for a steady doubles crew.' }
  ]);
  var EVENTS = deepFreeze([
    { id: 1, kind: 'social', venue: 'Loyal Legion Beer Hall', when: 'Friday, September 11 at 6:30 PM', going: 18, cap: 30, blurb: 'Our monthly gathering: drinks, small plates, and good company. Rackets optional. Every second Friday, at a pub Joyce and her son pick themselves.' },
    { id: 2, kind: 'social', venue: "Bailey's Taproom", when: 'Friday, October 9 at 6:30 PM', going: 6, cap: 30, blurb: "October's venue. New faces always welcome." },
    { id: 3, kind: 'trip', venue: 'Indian Wells, California', when: 'March 2027, four days', going: 11, cap: 20, blurb: 'A club trip to the BNP Paribas Open. Shared lodging, carpools, and sessions together.' }
  ]);
  var COACHES = deepFreeze([
    { id: 1, name: 'Carla Mendez', initials: 'CM', partner: true, rate: 65, cert: 'USPTA Elite', yrs: 18, focus: 'Doubles strategy and net play', area: 'NE Portland, travels', rating: 4.9, reviews: 47, blurb: 'Former college coach. Helps 40+ players sharpen doubles instincts and footwork.' },
    { id: 2, name: 'James Whitfield', initials: 'JW', partner: true, rate: 75, cert: 'PTR Professional', yrs: 22, focus: 'Singles fundamentals and serve', area: 'SE Portland', rating: 4.8, reviews: 31, blurb: 'Patient, technical coach. Ideal for rebuilding strokes and returning to competitive form.' },
    { id: 3, name: 'Aiko Tanaka', initials: 'AT', partner: false, rate: 50, cert: 'USPTA Certified', yrs: 9, focus: 'Beginners and return to sport', area: 'Laurelhurst area', rating: 5.0, reviews: 12, blurb: 'Encouraging lessons for those beginning, or returning after years away.' }
  ]);
  var SEED_CHAT = deepFreeze([
    { who: 'Joyce', init: 'JC', t: 'Welcome to the Clubhouse. Say hello, find a hit, and come to Second Friday. My son and I will be there.', at: '7:50 AM', me: false },
    { who: 'Dev P.', init: 'DP', t: 'Anyone up for an early hit at Grant tomorrow, 7 AM?', at: '8:14 AM', me: false },
    { who: 'Maggie R.', init: 'MR', t: 'I might. Bringing a new racket to break in.', at: '8:20 AM', me: false },
    { who: 'Hana K.', init: 'HK', t: 'Reminder: the Second Friday social is at Loyal Legion this month.', at: '9:01 AM', me: false }
  ]);
  var NAV = deepFreeze([
    { id: 'map', label: 'Map', icon: '📍' }, { id: 'hits', label: 'Hits', icon: '🎾' },
    { id: 'social', label: 'Socials', icon: '🥂' }, { id: 'lessons', label: 'Lessons', icon: '🎓' },
    { id: 'chat', label: 'Chat', icon: '💬' }
  ]);
  var SNAPS = ['peek', 'mid', 'full'];
  var TYPES = ['Doubles', 'Singles', 'Social', 'Drills'];
  var LEVELS = ['All levels', '2.5–3.0', '3.0–3.5', '3.5–4.0', '4.0+'];
  var WHENS = ['Today, 5:30 PM', 'Tomorrow, 9:00 AM', 'Saturday, 10:00 AM', 'Sunday, 4:00 PM'];
  var SLOTS = ['Sat 9:00 AM', 'Sun 11:00 AM', 'Tue 5:30 PM'];
  var CERTS = ['USPTA', 'PTR', 'ITF', 'Other'];
  var PLANS = ['Partner', 'Pro Subscription'];

  /* ---------------------------------------------------------------- 3. state */
  var state = {
    screen: 'launch', tab: 'map', zoom: 1, courtId: null, snap: 'mid', room: 'city', query: '',
    modal: null, form: null, lastSend: 0, nextId: 100,
    joined: {}, rsvp: {}, msgs: { city: SEED_CHAT.slice() }, created: [], reserved: {}, applied: false
  };
  var app = document.getElementById('app');
  var lastFocus = null;

  function $(sel) { return app.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }
  function isMapMode() { return state.tab === 'map' || state.tab === 'hits'; }
  function courtById(id) { for (var i = 0; i < COURTS.length; i++) if (COURTS[i].id === id) return COURTS[i]; return null; }
  function requests() { return REQUESTS.concat(state.created); }
  function requestById(id) { var all = requests(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function hostOf(r) { return r.host === -1 ? ME : PEOPLE[r.host]; }
  function openAt(courtId) { return requests().filter(function (r) { return r.courtId === courtId; }).length; }
  function matchReq(r) {
    if (!state.query) return true;
    var c = courtById(r.courtId), h = hostOf(r);
    return (c.name + ' ' + r.type + ' ' + h.name + ' ' + r.note + ' ' + r.level).toLowerCase().indexOf(state.query) > -1;
  }
  function matchCourt(c) {
    if (!state.query) return true;
    if (c.name.toLowerCase().indexOf(state.query) > -1) return true;
    return requests().some(function (r) { return r.courtId === c.id && matchReq(r); });
  }

  /* Storage is treated as untrusted: every field is type-checked, whitelisted, and re-cleaned. */
  function load() {
    var s = store.get('state'); if (!isObj(s)) return;
    var k;
    if (isObj(s.joined)) for (k in s.joined) if (s.joined[k] === true && /^\d+$/.test(k)) state.joined[k] = true;
    if (isObj(s.rsvp)) for (k in s.rsvp) if (s.rsvp[k] === true && /^\d+$/.test(k)) state.rsvp[k] = true;
    if (isObj(s.reserved)) for (k in s.reserved) if (/^\d+$/.test(k) && SLOTS.indexOf(s.reserved[k]) > -1) state.reserved[k] = s.reserved[k];
    state.applied = s.applied === true;
    if (Array.isArray(s.created)) s.created.slice(0, MAX_CREATED).forEach(function (r) {
      if (!isObj(r) || !courtById(Number(r.courtId))) return;
      if (TYPES.indexOf(r.type) < 0 || LEVELS.indexOf(r.level) < 0 || WHENS.indexOf(r.when) < 0) return;
      state.created.push({ id: state.nextId++, host: -1, courtId: Number(r.courtId), when: r.when, type: r.type, spots: 2, level: r.level, note: clean(String(r.note || ''), MAX_NOTE_LEN) });
    });
    if (isObj(s.msgs)) for (k in s.msgs) {
      if (!/^(city|hit:\d+|ev:\d+|dm:\d+)$/.test(k) || !Array.isArray(s.msgs[k])) continue;
      var arr = s.msgs[k].slice(-MAX_HISTORY).map(function (m) {
        if (!isObj(m)) return null;
        return { who: clean(String(m.who || ''), MAX_NAME_LEN) || 'Member', init: clean(String(m.init || ''), 3) || '?', t: clean(String(m.t || '')), at: clean(String(m.at || ''), 20), me: m.me === true };
      }).filter(function (m) { return m && m.t; });
      if (arr.length) state.msgs[k] = arr;
    }
  }
  function persist() {
    store.set('state', {
      joined: state.joined, rsvp: state.rsvp, msgs: state.msgs, reserved: state.reserved, applied: state.applied,
      created: state.created.map(function (r) { return { courtId: r.courtId, when: r.when, type: r.type, level: r.level, note: r.note }; })
    });
  }

  /* ---------------------------------------------------------------- 4. views */
  var logoN = 0;
  function racket(color, id) {
    return '<g><ellipse cx="32" cy="22" rx="12.5" ry="15.5" fill="none" stroke="' + color + '" stroke-width="4.4"/>' +
      '<path d="M27 35 L23 56 a4 4 0 0 0 8 1 M37 35 L41 56 a4 4 0 0 1 -8 1" fill="none" stroke="' + color + '" stroke-width="4.4" stroke-linecap="round"/>' +
      '<g stroke="' + color + '" stroke-width="1" opacity=".45" clip-path="url(#' + id + ')">' +
      '<line x1="24" y1="11" x2="24" y2="33"/><line x1="32" y1="8" x2="32" y2="36"/><line x1="40" y1="11" x2="40" y2="33"/>' +
      '<line x1="21" y1="16" x2="43" y2="16"/><line x1="20" y1="22" x2="44" y2="22"/><line x1="21" y1="28" x2="43" y2="28"/></g>' +
      '<clipPath id="' + id + '"><ellipse cx="32" cy="22" rx="12.5" ry="15.5"/></clipPath></g>';
  }
  function logo(size) {
    var n = ++logoN;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-label="40 Love">' +
      '<g transform="rotate(-30 32 32)">' + racket('#8B6F5C', 'cl' + n) + '</g>' +
      '<g transform="rotate(30 32 32)">' + racket('#7FAE78', 'cr' + n) + '</g>' +
      '<circle cx="32" cy="34" r="6.2" fill="#A9D3A2" stroke="#7FAE78" stroke-width="1.4"/>' +
      '<path d="M27 31 q5 3 0 6 M37 31 q-5 3 0 6" fill="none" stroke="#fff" stroke-width="1.2"/></svg>';
  }
  function chip(t, tone) { return '<span class="chip ' + (tone || '') + '">' + esc(t) + '</span>'; }
  function avatar(ini, size, tone) {
    size = size || 40;
    return '<span class="avatar ' + (tone || '') + '" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * .34) + 'px" aria-hidden="true">' + esc(ini) + '</span>';
  }
  function rating(n) {
    var f = Math.max(0, Math.min(5, Math.round((n - 2) / 3 * 5))), bars = '', i;
    for (i = 0; i < 5; i++) bars += '<i class="' + (i < f ? 'on' : '') + '"></i>';
    return '<span class="rating" aria-label="Skill rating NTRP ' + n.toFixed(1) + '">' + bars + '<span>NTRP ' + n.toFixed(1) + '</span></span>';
  }
  function seg(field, options, current) {
    return '<div class="seg" role="radiogroup">' + options.map(function (o) {
      return '<button type="button" role="radio" aria-checked="' + (o === current) + '" class="' + (o === current ? 'on' : '') + '" data-act="seg" data-field="' + field + '" data-val="' + esc(o) + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
  }
  function storyHTML() {
    return '<div class="story">' + STORY.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '<div class="sig">' + esc(STORY.signature) + '</div></div>';
  }

  /* map */
  function pin(c) {
    var x = c.x / 100 * 390, y = c.y / 100 * 736, open = openAt(c.id), active = open > 0;
    var cls = 'pin' + (c.id === state.courtId ? ' sel' : '') + (matchCourt(c) ? '' : ' dim');
    return '<g class="' + cls + '" data-act="court" data-id="' + c.id + '" role="button" tabindex="0" aria-label="' + esc(c.name) + ', ' + open + ' open hits" transform="translate(' + (x - 15).toFixed(1) + ' ' + (y - 35).toFixed(1) + ')">' +
      '<g class="pin-inner"><ellipse cx="15" cy="36" rx="5" ry="2" fill="rgba(0,0,0,.15)"/>' +
      '<path d="M15 35 C7 24 2 19 2 13 A13 13 0 1 1 28 13 C28 19 23 24 15 35 Z" fill="' + (active ? '#7FAE78' : '#B39A88') + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="15" cy="13" r="5.5" fill="#fff"/>' +
      (active ? '<circle cx="26" cy="4" r="7" fill="#5C4A3D" stroke="#fff" stroke-width="1.5"/><text x="26" y="7.2" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="Inter,system-ui,sans-serif">' + open + '</text>' : '') +
      '</g></g>';
  }
  function mapSVG() {
    var blocks = '', r, c, roads = '';
    for (r = 0; r < 10; r++) for (c = 0; c < 7; c++) blocks += '<rect x="' + (-40 + c * 80) + '" y="' + (-40 + r * 90) + '" width="60" height="66" rx="4" fill="var(--block)"/>';
    [60, 240, 420, 600].forEach(function (y) { roads += '<rect x="-300" y="' + y + '" width="1000" height="10" fill="var(--map-road)"/>'; });
    [150, 330, 510, 690].forEach(function (y) { roads += '<rect x="-300" y="' + y + '" width="1000" height="5" fill="var(--map-road2)"/>'; });
    [50, 230, 410].forEach(function (x) { roads += '<rect x="' + x + '" y="-300" width="10" height="1400" fill="var(--map-road)"/>'; });
    [140, 320].forEach(function (x) { roads += '<rect x="' + x + '" y="-300" width="5" height="1400" fill="var(--map-road2)"/>'; });
    return '<svg class="map" viewBox="0 0 390 736" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of nearby tennis courts">' +
      '<g id="world" class="world" style="transform:scale(' + state.zoom + ')">' +
      '<rect x="-300" y="-300" width="1000" height="1400" fill="var(--map-land)"/>' + blocks +
      '<ellipse cx="40" cy="660" rx="210" ry="150" transform="rotate(-12 40 660)" fill="var(--map-water)"/>' +
      '<rect x="195" y="294" width="160" height="130" rx="18" fill="var(--map-park)"/>' +
      '<rect x="31" y="405" width="90" height="100" rx="16" fill="var(--map-park)"/>' + roads +
      '<text x="135" y="233" font-size="9" fill="#A79E90" font-family="Inter,system-ui,sans-serif">NE Glisan St</text>' +
      '<text x="236" y="150" font-size="9" fill="#A79E90" font-family="Inter,system-ui,sans-serif" transform="rotate(90 236 150)">NE 39th Ave</text>' +
      '<g transform="translate(180 368)"><circle r="30" fill="rgba(127,174,120,.22)"/><circle r="8" fill="#7FAE78" stroke="#fff" stroke-width="3"/></g>' +
      '<g id="pins">' + COURTS.map(pin).join('') + '</g></g></svg>';
  }
  function mapControls() {
    return '<div class="mapctl"><button class="rc" data-act="recenter" aria-label="Recenter map">➤</button>' +
      '<div class="grp"><button data-act="zoom-in" aria-label="Zoom in">+</button><button data-act="zoom-out" aria-label="Zoom out">−</button></div></div>';
  }
  function topbar() {
    return '<div class="topbar"><div class="search"><i aria-hidden="true">⌕</i><input id="q" type="search" maxlength="' + MAX_QUERY_LEN + '" autocomplete="off" placeholder="Search courts, members, hits" aria-label="Search courts, members, and hits" value="' + esc(state.query) + '"></div>' +
      '<button class="logo-btn" data-act="story" aria-label="Our story" title="Our story">' + logo(30) + '</button></div>';
  }

  /* hits */
  function hitCard(r) {
    var p = hostOf(r), mine = r.host === -1, j = mine || !!state.joined[r.id], c = courtById(r.courtId);
    var who = mine
      ? '<span class="ghost">' + avatar(p.initials, 40, 'me') + '</span>'
      : '<button class="ghost" data-act="person" data-id="' + r.host + '" aria-label="View ' + esc(p.name) + '\'s profile">' + avatar(p.initials) + '</button>';
    return '<article class="hit"><div class="row">' + who +
      '<div class="grow"><div class="name">' + esc(mine ? 'You are hosting' : p.name) + (p.ranked ? chip('Ranked', 'mocha') : '') + '</div><div style="margin-top:4px">' + rating(p.ntrp) + '</div></div>' +
      '<div class="meta"><b>' + esc(r.type) + '</b><small>' + esc(c.dist) + '</small></div></div>' +
      (r.note ? '<div class="note">' + esc(r.note) + '</div>' : '') +
      '<div class="chips" style="margin-top:10px">' + chip(c.name) + chip(r.when) + chip('Level ' + r.level, 'green') + chip(r.spots + ' spot' + (r.spots > 1 ? 's' : '') + ' open') + '</div>' +
      (mine ? '<button class="btn secondary block" style="margin-top:12px" data-act="room" data-id="hit:' + r.id + '" data-goto="chat">Open group chat</button>'
        : '<button class="btn primary block" style="margin-top:12px" data-act="join" data-id="' + r.id + '"' + (j ? ' disabled' : '') + '>' + (j ? '✓ Joined, see you on court' : 'Request to join') + '</button>') +
      '</article>';
  }
  function hitsList() {
    var list = requests().filter(matchReq);
    var body = list.length ? '<div class="divided">' + list.map(hitCard).join('') + '</div>'
      : '<div class="empty-note">No hits match “' + esc(state.query) + '”.<br><button class="linkbtn" data-act="clear-search">Clear search</button></div>';
    return '<div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="h2">Open hits nearby</h2><span class="small">' + list.length + ' of ' + requests().length + '</span></div>' +
      '<p class="sub">Browse and join at your leisure, no swiping. Tap a member to view their profile.</p>' +
      '<button class="btn secondary block" data-act="create" style="margin-bottom:6px">Start a hit</button>' + body;
  }
  function courtDetail() {
    var ct = courtById(state.courtId); if (!ct) return hitsList();
    var hits = requests().filter(function (r) { return r.courtId === ct.id; });
    var list = hits.length ? '<div class="divided">' + hits.map(function (r) {
      var p = hostOf(r);
      return '<div class="court-hit">' + avatar(p.initials, 36, r.host === -1 ? 'me' : '') + '<div class="grow"><div class="t">' + esc(p.name) + ', ' + esc(r.type) + '</div><div class="s">' + esc(r.when) + ', level ' + esc(r.level) + '</div></div></div>';
    }).join('') + '</div>' : '<p class="sub">Be the first to start one here.</p>';
    return '<button class="btn secondary sm" data-act="back" style="margin-bottom:14px">← Back</button>' +
      '<h2 class="h2">' + esc(ct.name) + '</h2>' +
      '<div class="chips" style="margin:10px 0 16px">' + chip(ct.surface + ' court') + chip(ct.lights ? 'Lights' : 'Daytime only') + chip(ct.dist + ' away') + (ct.fav ? chip('Saved', 'mocha') : '') + '</div>' +
      '<div class="label">' + (hits.length ? hits.length + ' open hit' + (hits.length > 1 ? 's' : '') + ' here' : 'No open hits yet') + '</div>' + list +
      '<button class="btn primary block" data-act="create" data-id="' + ct.id + '" style="margin-top:16px">Start a hit here</button>';
  }

  /* socials */
  function eventRow(e) {
    var on = !!state.rsvp[e.id];
    return '<div class="evrow"><div class="ic ' + (e.kind === 'trip' ? 'trip' : '') + '" aria-hidden="true">' + (e.kind === 'trip' ? '✈' : '🥂') + '</div>' +
      '<div class="grow"><div class="t">' + esc(e.venue) + '</div><div class="s">' + esc(e.when) + ', ' + (e.going + (on ? 1 : 0)) + ' attending</div></div>' +
      '<button class="btn secondary sm ' + (on ? 'on' : '') + '" data-act="rsvp" data-id="' + e.id + '" aria-pressed="' + on + '">' + (on ? 'Attending' : 'Reserve') + '</button></div>';
  }
  function socials() {
    var soc = EVENTS.filter(function (e) { return e.kind === 'social'; }), trips = EVENTS.filter(function (e) { return e.kind === 'trip'; });
    var next = soc[0], going = !!state.rsvp[next.id];
    var faces = PEOPLE.slice(0, 3).map(function (p, i) { return avatar(p.initials, 28, i === 1 ? 'green' : ''); }).join('');
    return '<h2 class="h2">Social gatherings</h2><p class="sub">Meet off the court as well. Our Second Friday social convenes monthly at a hand-picked pub.</p>' +
      '<div class="hero"><div class="top"><div class="kicker">Next gathering, second Friday</div><div class="title">' + esc(next.venue) + '</div><div class="when">' + esc(next.when) + '</div></div>' +
      '<div class="bottom"><p>' + esc(next.blurb) + '</p><div class="row"><div class="stack">' + faces + '</div><span class="small" style="font-weight:500">' + (next.going + (going ? 1 : 0)) + ' attending, ' + (next.cap - next.going - (going ? 1 : 0)) + ' seats remain</span></div>' +
      '<button class="btn primary block" style="margin-top:14px" data-act="rsvp" data-id="' + next.id + '" aria-pressed="' + going + '"' + (going ? ' disabled' : '') + '>' + (going ? "✓ You're attending" : 'Reserve my seat') + '</button>' +
      (going ? '<button class="btn secondary block" style="margin-top:8px" data-act="rsvp" data-id="' + next.id + '">Change my mind</button>' : '') + '</div></div>' +
      '<div class="label">Upcoming gatherings</div><div class="divided">' + soc.slice(1).map(eventRow).join('') + '</div>' +
      '<div class="label">Club trips</div><div class="divided">' + trips.map(eventRow).join('') + '</div>' +
      '<p class="sub" style="font-style:italic;margin-top:8px">Further professional-tournament trips will open as the club grows.</p>';
  }

  /* lessons */
  function coachCard(co) {
    var res = state.reserved[co.id];
    return '<article class="coach"><div class="row" style="align-items:flex-start">' + avatar(co.initials, 48, co.partner ? 'green' : '') +
      '<div class="grow"><div class="row" style="gap:7px;flex-wrap:wrap"><span class="name">' + esc(co.name) + '</span>' + (co.partner ? chip('★ Pro Partner', 'green') : '') + '</div>' +
      '<div class="cred">' + esc(co.cert) + ', ' + co.yrs + ' years, ' + esc(co.area) + '</div><div class="focus">' + esc(co.focus) + '</div></div>' +
      '<div class="price"><b>$' + co.rate + '</b><small>per hour</small></div></div>' +
      '<div class="bio">' + esc(co.blurb) + '</div>' +
      '<div class="row" style="margin-top:10px">' + chip('★ ' + co.rating.toFixed(1), 'mocha') + '<span class="small" style="font-weight:500">' + co.reviews + ' reviews</span>' +
      (res ? '<button class="btn secondary sm" style="margin-left:auto;color:var(--ok)" data-act="lesson" data-id="' + co.id + '">✓ Reserved, ' + esc(res) + '</button>'
        : '<button class="btn primary sm" style="margin-left:auto" data-act="lesson" data-id="' + co.id + '">Reserve a lesson</button>') + '</div></article>';
  }
  function lessons() {
    return '<h2 class="h2">Lessons and coaching</h2><p class="sub">Vetted local professionals who enjoy working with players forty and over.</p>' +
      '<div class="label">Coaches near you</div><div class="divided">' + COACHES.map(coachCard).join('') + '</div>' +
      '<div class="hero" style="margin-top:22px"><div class="top mocha"><div class="kicker">For coaches and instructors</div><div class="title">Grow your roster with 40 Love</div></div>' +
      '<div class="bottom"><p>Reach an engaged community of 40+ players who are actively investing in their game. Partner with us, or subscribe for featured placement and the <b>Pro Partner</b> mark.</p>' +
      '<div class="plans"><div class="plan"><div class="n">Partner</div><div class="d">Revenue share, no monthly fee</div><div class="p">15%<small> per booking</small></div></div>' +
      '<div class="plan pref"><span class="tag">Preferred</span><div class="n">Pro Subscription</div><div class="d">Featured and badged, keep 100%</div><div class="p">$29<small> monthly</small></div></div></div>' +
      (state.applied ? '<button class="btn secondary block" style="margin-top:14px;color:var(--ok)" disabled>✓ Application received</button>'
        : '<button class="btn primary block" data-act="apply" style="margin-top:14px">Apply to coach with us</button>') + '</div></div>';
  }

  /* chat */
  function rooms() {
    var list = [{ id: 'city', label: 'Portland Clubhouse' }];
    requests().forEach(function (r) { if (r.host === -1 || state.joined[r.id]) list.push({ id: 'hit:' + r.id, label: r.type + ' at ' + courtById(r.courtId).short }); });
    EVENTS.forEach(function (e) { if (state.rsvp[e.id]) list.push({ id: 'ev:' + e.id, label: e.kind === 'trip' ? 'Indian Wells trip' : 'Second Friday' }); });
    Object.keys(state.msgs).forEach(function (k) { if (k.indexOf('dm:') === 0) { var p = PEOPLE[Number(k.slice(3))]; if (p) list.push({ id: k, label: p.name.split(' ')[0] }); } });
    return list;
  }
  function roomLabel(id) { var rs = rooms(); for (var i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i].label; return 'Chat'; }
  function ensureRoom(id) {
    if (state.msgs[id]) return;
    var seed = [], m;
    if (id.indexOf('hit:') === 0) {
      var r = requestById(Number(id.slice(4)));
      if (r && r.host !== -1) { var h = hostOf(r); seed.push({ who: h.name, init: h.initials, t: 'Welcome to the group. See you ' + r.when.toLowerCase() + '.', at: timeNow(), me: false }); }
    } else if (id.indexOf('ev:') === 0) {
      m = Number(id.slice(3)) === 3 ? "So glad you're in for Indian Wells. Lodging and carpool details will land here." : "So glad you're coming. Details go here closer to the date. My son is in charge of the snacks.";
      seed.push({ who: 'Joyce', init: 'JC', t: m, at: timeNow(), me: false });
    }
    state.msgs[id] = seed;
  }
  function msgHTML(m) {
    return '<div class="msg' + (m.me ? ' me' : '') + '">' + (m.me ? '' : avatar(m.init, 30)) +
      '<div class="bw">' + (m.me ? '' : '<div class="who">' + esc(m.who) + '</div>') + '<div class="b">' + esc(m.t) + '</div><div class="at">' + esc(m.at) + '</div></div></div>';
  }
  function chat() {
    var rs = rooms();
    if (!rs.some(function (r) { return r.id === state.room; })) state.room = 'city';
    ensureRoom(state.room);
    var tabs = '<div class="rooms" role="tablist">' + rs.map(function (r) {
      var on = state.room === r.id;
      return '<button role="tab" aria-selected="' + on + '" class="' + (on ? 'on' : '') + '" data-act="room" data-id="' + esc(r.id) + '">' + esc(r.label) + '</button>';
    }).join('') + '</div>';
    var list = state.msgs[state.room], hint;
    if (state.room === 'city') hint = 'The Clubhouse, citywide. Courtesy expected.';
    else if (state.room.indexOf('dm:') === 0) hint = list.length ? 'Direct message' : 'Say hello to ' + esc(roomLabel(state.room)) + '.';
    else hint = 'Group chat for ' + esc(roomLabel(state.room)) + '.';
    return '<div class="chat">' + tabs + '<div class="msgs scroll" id="msgs"><div class="hint">' + hint + '</div>' + list.map(msgHTML).join('') + '</div>' +
      '<div class="composer"><input id="chatInput" type="text" maxlength="' + MAX_MSG_LEN + '" autocomplete="off" placeholder="Message ' + esc(roomLabel(state.room)) + '…" aria-label="Chat message"><button class="btn primary" data-act="send">Send</button></div></div>';
  }

  /* modals */
  function modalWrap(inner, closeAct) {
    return '<div class="overlay" data-act="' + (closeAct || 'close') + '"><div class="modal" role="dialog" aria-modal="true" data-act="noop"><div class="grab" aria-hidden="true"></div>' + inner + '</div></div>';
  }
  function doneBlock(title, text, btnLabel) {
    return '<div class="done"><div class="mark" aria-hidden="true">✓</div><h2 class="h2">' + esc(title) + '</h2><p class="sub">' + esc(text) + '</p>' +
      '<button class="btn primary block" id="modalClose" data-act="close" style="margin-top:6px">' + esc(btnLabel || 'Done') + '</button></div>';
  }
  function modalHTML() {
    var m = state.modal; if (!m) return '';
    if (m.type === 'person') {
      var p = PEOPLE[m.idx]; if (!p) return '';
      return modalWrap('<div class="row" style="gap:14px">' + avatar(p.initials, 58) + '<div><div class="pn">' + esc(p.name) + '</div><div class="pa">Age ' + p.age + '</div></div></div>' +
        '<div class="row" style="gap:8px;margin:16px 0">' + rating(p.ntrp) + (p.ranked ? chip(p.rank, 'mocha') : '') + '</div>' +
        '<button class="btn primary block" data-act="dm" data-id="' + m.idx + '">Send a message</button>' +
        '<button class="btn secondary block" id="modalClose" data-act="close" style="margin-top:10px">Close</button>');
    }
    if (m.type === 'story') {
      return modalWrap('<h2 class="h2" style="margin-bottom:12px">Our story</h2>' + storyHTML() +
        '<button class="btn primary block" id="modalClose" data-act="close" style="margin-top:16px">Back to the club</button>' +
        '<button class="linkbtn" data-act="reset" style="display:block;margin:10px auto 0">Reset demo data</button>');
    }
    if (m.type === 'create') {
      var f = state.form;
      return modalWrap('<h2 class="h2">Start a hit</h2><p class="sub">Post an open invite and let nearby players come to you.</p>' +
        '<div class="field"><div class="flabel">Type of play</div>' + seg('type', TYPES, f.type) + '</div>' +
        '<div class="field"><label for="f-court">Court</label><select class="input" id="f-court">' + COURTS.map(function (c) { return '<option value="' + c.id + '"' + (c.id === f.courtId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="f-when">When</label><select class="input" id="f-when">' + WHENS.map(function (w) { return '<option' + (w === f.when ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><div class="flabel">Preferred level</div>' + seg('level', LEVELS, f.level) + '</div>' +
        '<div class="field"><label for="f-note">Note (optional)</label><textarea class="input" id="f-note" maxlength="' + MAX_NOTE_LEN + '" placeholder="e.g. Casual hit, coffee after.">' + esc(f.note) + '</textarea></div>' +
        '<button class="btn primary block" data-act="post">Post hit</button>' +
        '<button class="btn secondary block" id="modalClose" data-act="close" style="margin-top:10px">Cancel</button>');
    }
    if (m.type === 'created') return modalWrap(doneBlock('Your hit is posted', 'Players nearby can see it now, and a group chat has opened for it. You will be notified when someone requests to join.', 'Back to the map'));
    if (m.type === 'lesson') {
      var co = null; COACHES.forEach(function (x) { if (x.id === m.id) co = x; }); if (!co) return '';
      return modalWrap('<div class="row" style="gap:14px">' + avatar(co.initials, 58, co.partner ? 'green' : '') + '<div><div class="pn">' + esc(co.name) + '</div><div class="pa">' + esc(co.cert) + ', $' + co.rate + ' per hour</div></div></div>' +
        '<div class="field" style="margin-top:18px"><div class="flabel">Choose a time</div>' + seg('slot', SLOTS, m.slot) + '<div class="hintline">Sixty-minute private lesson at ' + esc(co.area.split(',')[0]) + '.</div></div>' +
        '<button class="btn primary block" data-act="reserve" data-id="' + co.id + '"' + (m.slot ? '' : ' disabled') + '>Confirm reservation</button>' +
        '<button class="btn secondary block" id="modalClose" data-act="close" style="margin-top:10px">Cancel</button>');
    }
    if (m.type === 'reserved') return modalWrap(doneBlock('Lesson reserved', 'Your coach will confirm shortly. Payment is collected after the lesson, through the app.'));
    if (m.type === 'apply') {
      var a = state.form;
      return modalWrap('<h2 class="h2">Coach with 40 Love</h2><p class="sub">Tell us about yourself. We reply to every application within two business days.</p>' +
        '<div class="field"><label for="f-name">Your name</label><input class="input" id="f-name" maxlength="' + MAX_NAME_LEN + '" autocomplete="off" value="' + esc(a.name) + '"></div>' +
        '<div class="field"><label for="f-cert">Certification</label><select class="input" id="f-cert">' + CERTS.map(function (c) { return '<option' + (c === a.cert ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><div class="flabel">Preferred plan</div>' + seg('plan', PLANS, a.plan) + '</div>' +
        '<button class="btn primary block" data-act="send-apply">Send application</button>' +
        '<button class="btn secondary block" id="modalClose" data-act="close" style="margin-top:10px">Cancel</button>');
    }
    if (m.type === 'applied') return modalWrap(doneBlock('Application received', 'Thank you. Joyce reads every application herself, and will be in touch within two business days.'));
    return '';
  }

  /* screens */
  function launch() {
    return '<section class="launch"><div class="brand">' + logo(54) + '<div><div class="wordmark">40 Love</div><div class="est">EST. 2026, PORTLAND</div></div></div>' +
      '<div class="founder">' + STORY.lines.map(function (l, i) { return i === 0 ? '<p>' + esc(l) + '</p>' : '<p style="font-size:14.5px;color:var(--mocha-soft);margin-top:10px">' + esc(l) + '</p>'; }).join('') + '<span class="sig">' + esc(STORY.signature) + '</span></div>' +
      '<button class="btn primary block" data-act="to-gate">Come on in</button></section>';
  }
  function gate() {
    return '<section class="gate"><div class="brand">' + logo(44) + '<div class="wordmark" style="font-size:28px">40 Love</div></div>' +
      '<p class="lede">A tennis community for players forty and over. Courts, open hits, coaching, monthly gatherings, and good company nearby.</p>' +
      '<p class="note">Membership is reserved for the 40+ community. Kindly confirm to continue.</p>' +
      '<button class="btn primary block" data-act="enter">I\'m forty or older, enter</button>' +
      '<button class="linkbtn" data-act="story" style="margin:12px auto 0;display:block">Read our story</button>' +
      '<p class="foot">Friendships first. Should something more grow from it, all the better.</p></section>';
  }
  function nav() {
    return '<nav class="nav" aria-label="Main navigation">' + NAV.map(function (n) {
      var on = state.tab === n.id;
      return '<button data-act="tab" data-id="' + n.id + '" class="' + (on ? 'active' : '') + '"' + (on ? ' aria-current="page"' : '') + '><i aria-hidden="true">' + n.icon + '</i>' + n.label + '</button>';
    }).join('') + '</nav>';
  }

  /* ---------------------------------------------------------------- 5. render */
  function render() {
    try {
      var html;
      if (state.screen === 'launch') html = launch();
      else if (state.screen === 'gate') html = gate();
      else html = (isMapMode()
        ? mapSVG() + mapControls() + topbar() + '<div class="sheet ' + state.snap + '" id="sheet"><button class="handle" id="handle" aria-label="Resize panel"><span></span></button><div class="body scroll" id="content"></div></div>'
        : '<div class="panel scroll" id="content"></div>') + nav();
      app.innerHTML = html + '<div id="modal"></div>';
      if (state.screen === 'app') { renderContent(); if (isMapMode()) bindSheet(); }
      renderModal();
    } catch (err) { fail(err); }
  }
  function renderContent() {
    var el = $('#content'); if (!el) return;
    if (isMapMode()) el.innerHTML = state.courtId ? courtDetail() : hitsList();
    else if (state.tab === 'social') el.innerHTML = socials();
    else if (state.tab === 'lessons') el.innerHTML = lessons();
    else { el.innerHTML = chat(); scrollChat(false); }
  }
  function renderModal() {
    var m = $('#modal'); if (!m) return;
    m.innerHTML = modalHTML();
    var c = $('#modalClose') || $('.modal .btn'); if (c) c.focus();
  }
  function updateNav() {
    $all('.nav button').forEach(function (b) {
      var on = b.getAttribute('data-id') === state.tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  function updatePins() {
    var g = $('#pins'); if (g) g.innerHTML = COURTS.map(pin).join('');
  }
  function updateSheet() { var s = $('#sheet'); if (s) s.className = 'sheet ' + state.snap; }
  function scrollChat(smooth) {
    var l = $('#msgs'); if (!l) return;
    if (typeof l.scrollTo === 'function') l.scrollTo({ top: l.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    else l.scrollTop = l.scrollHeight;
  }
  function fail(err) {
    if (window.console) console.error('40 Love:', err);
    app.innerHTML = '<div class="fallback"><div>' + logo(54) + '<div class="h2" style="margin-top:12px">A brief interruption of play</div>' +
      '<p class="sub">Something went wrong. Refresh to resume.</p><button class="btn secondary" data-act="reload">Refresh</button></div></div>';
  }

  /* ---------------------------------------------------------------- 6. actions */
  function setTab(id) {
    var wasMap = isMapMode();
    state.tab = id;
    if (id === 'hits' || id === 'map') { state.courtId = null; state.snap = 'mid'; }
    if (wasMap && isMapMode()) { updateNav(); updatePins(); updateSheet(); renderContent(); }
    else render();
  }
  function selectCourt(id) {
    if (!courtById(id)) return;
    state.courtId = id; state.snap = 'mid';
    if (state.tab !== 'hits') { state.tab = 'hits'; updateNav(); }
    updatePins(); updateSheet(); renderContent();
  }
  function setZoom(delta, reset) {
    state.zoom = reset ? 1 : Math.max(0.8, Math.min(2, +(state.zoom + delta).toFixed(2)));
    var w = $('#world'); if (w) w.style.transform = 'scale(' + state.zoom + ')';
  }
  function openModal(m) { lastFocus = document.activeElement; state.modal = m; renderModal(); }
  function closeModal() {
    var was = state.modal; state.modal = null; state.form = null; renderModal();
    if (was && (was.type === 'reserved' || was.type === 'applied' || was.type === 'created')) renderContent();
    if (was && was.type === 'created' && isMapMode()) updatePins();
    if (lastFocus && lastFocus.focus && app.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }
  function setQuery(v) {
    state.query = clean(v, MAX_QUERY_LEN).toLowerCase();
    updatePins();
    if (isMapMode() && !state.courtId) renderContent();
  }
  function createHit() {
    var f = state.form; if (!f) return;
    if (TYPES.indexOf(f.type) < 0 || LEVELS.indexOf(f.level) < 0 || WHENS.indexOf(f.when) < 0 || !courtById(f.courtId)) return;
    if (state.created.length >= MAX_CREATED) state.created.shift();
    var r = { id: state.nextId++, host: -1, courtId: f.courtId, when: f.when, type: f.type, spots: 2, level: f.level, note: clean(f.note, MAX_NOTE_LEN) };
    state.created.push(r); ensureRoom('hit:' + r.id); persist();
    state.form = null; state.modal = { type: 'created' }; renderModal();
  }
  function goToRoom(id) {
    ensureRoom(id); state.room = id; persist();
    if (state.tab !== 'chat') { state.tab = 'chat'; render(); } else renderContent();
  }
  function send() {
    var input = $('#chatInput'), list = $('#msgs'); if (!input || !list) return;
    var text = clean(input.value), now = Date.now();
    if (!text || now - state.lastSend < SEND_COOLDOWN_MS) return;
    state.lastSend = now;
    ensureRoom(state.room);
    var m = { who: 'You', init: 'ME', t: text, at: timeNow(), me: true }, arr = state.msgs[state.room];
    arr.push(m);
    if (arr.length > MAX_HISTORY) { arr.shift(); var first = list.querySelector('.msg'); if (first) first.remove(); }
    list.insertAdjacentHTML('beforeend', msgHTML(m));
    input.value = ''; input.focus(); scrollChat(true); persist();
  }

  /* ---------------------------------------------------------------- 7. events */
  app.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t || !app.contains(t)) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id'), n = Number(id);
    switch (act) {
      case 'to-gate': state.screen = 'gate'; render(); break;
      case 'enter': state.screen = 'app'; render(); break;
      case 'tab': setTab(id); break;
      case 'court': selectCourt(n); break;
      case 'back': state.courtId = null; updatePins(); renderContent(); break;
      case 'join': if (requestById(n)) { state.joined[n] = true; ensureRoom('hit:' + n); persist(); renderContent(); } break;
      case 'person': openModal({ type: 'person', idx: n }); break;
      case 'dm': state.modal = null; goToRoom('dm:' + n); break;
      case 'rsvp': if (state.rsvp[n]) delete state.rsvp[n]; else { state.rsvp[n] = true; ensureRoom('ev:' + n); } persist(); renderContent(); break;
      case 'zoom-in': setZoom(0.25); break;
      case 'zoom-out': setZoom(-0.25); break;
      case 'recenter': setZoom(0, true); break;
      case 'room': goToRoom(id); break;
      case 'send': send(); break;
      case 'story': openModal({ type: 'story' }); break;
      case 'create': state.form = { type: 'Doubles', courtId: courtById(n) ? n : (state.courtId || COURTS[0].id), when: WHENS[0], level: 'All levels', note: '' }; openModal({ type: 'create' }); break;
      case 'post': createHit(); break;
      case 'lesson': openModal({ type: 'lesson', id: n, slot: state.reserved[n] || null }); break;
      case 'reserve': if (state.modal && state.modal.slot && SLOTS.indexOf(state.modal.slot) > -1) { state.reserved[n] = state.modal.slot; persist(); state.modal = { type: 'reserved' }; renderModal(); } break;
      case 'apply': state.form = { name: '', cert: CERTS[0], plan: PLANS[1] }; openModal({ type: 'apply' }); break;
      case 'send-apply': if (state.form && clean(state.form.name, MAX_NAME_LEN)) { state.applied = true; persist(); state.form = null; state.modal = { type: 'applied' }; renderModal(); } else { var nm = $('#f-name'); if (nm) nm.focus(); } break;
      case 'seg': {
        var field = t.getAttribute('data-field'), val = t.getAttribute('data-val');
        if (field === 'slot') { if (state.modal) { state.modal.slot = val; var cb = $('[data-act=reserve]'); if (cb) cb.disabled = false; } }
        else if (state.form) state.form[field] = val;
        $all('[data-act=seg][data-field="' + field + '"]').forEach(function (b) { var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
        break;
      }
      case 'clear-search': state.query = ''; var q = $('#q'); if (q) q.value = ''; updatePins(); renderContent(); break;
      case 'close': closeModal(); break;
      case 'reset': store.clear(); window.location.reload(); break;
      case 'reload': window.location.reload(); break;
      default: break;
    }
  });
  app.addEventListener('input', function (e) {
    var t = e.target; if (!t) return;
    if (t.id === 'q') setQuery(t.value);
    else if (t.id === 'f-note' && state.form) state.form.note = t.value;
    else if (t.id === 'f-name' && state.form) state.form.name = t.value;
  });
  app.addEventListener('change', function (e) {
    var t = e.target; if (!t || !state.form) return;
    if (t.id === 'f-court') state.form.courtId = Number(t.value);
    else if (t.id === 'f-when' && WHENS.indexOf(t.value) > -1) state.form.when = t.value;
    else if (t.id === 'f-cert' && CERTS.indexOf(t.value) > -1) state.form.cert = t.value;
  });
  app.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.modal) { closeModal(); return; }
    var t = e.target;
    if (t && t.id === 'chatInput' && e.key === 'Enter') { e.preventDefault(); send(); return; }
    if (t && t.getAttribute && t.getAttribute('role') === 'button' && t.getAttribute('data-act') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  function bindSheet() {
    var h = $('#handle'); if (!h) return;
    var y0 = null;
    function snapBy(step) { var i = SNAPS.indexOf(state.snap), n = Math.max(0, Math.min(2, i + step)); if (n !== i) { state.snap = SNAPS[n]; updateSheet(); } }
    h.addEventListener('pointerdown', function (e) { y0 = e.clientY; if (h.setPointerCapture) { try { h.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } } });
    h.addEventListener('pointerup', function (e) {
      if (y0 == null) return;
      var dy = e.clientY - y0; y0 = null;
      if (dy < -36) snapBy(1); else if (dy > 36) snapBy(-1);
      else if (Math.abs(dy) < 8) { state.snap = state.snap === 'full' ? 'mid' : 'full'; updateSheet(); }
    });
    h.addEventListener('pointercancel', function () { y0 = null; });
    h.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); snapBy(1); } else if (e.key === 'ArrowDown') { e.preventDefault(); snapBy(-1); }
    });
  }
  window.addEventListener('error', function (e) { fail(e.error || e.message); });

  load();
  render();
})();
