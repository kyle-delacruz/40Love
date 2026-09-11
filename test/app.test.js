/* Behavioral tests: loads dist/40Love.html in jsdom and clicks through every feature.
   Run: npm test   (builds first, then tests) */
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, '..', 'dist', '40Love.html');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } }
function section(t) { console.log('\n[' + t + ']'); }

function boot(storage) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => errors.push(String(e.message || e)));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  return JSDOM.fromFile(FILE, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(window) {
    // jsdom's localStorage needs an origin; give it an in-memory shim so persistence can be tested.
    const mem = storage || {};
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; },
      key: i => Object.keys(mem)[i] || null, get length() { return Object.keys(mem).length; }
    } });
    window.__mem = mem;
  } }).then(dom => ({ dom, window: dom.window, document: dom.window.document, errors }));
}

(async () => {
  const { window, document, errors } = await boot();
  const app = document.getElementById('app');
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const change = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const q = s => app.querySelector(s), qa = s => app.querySelectorAll(s), text = () => app.textContent;

  section('Launch pad');
  ok(q('.launch'), 'launch pad renders first');
  ok(text().includes('My mom and I built 40 Love'), 'founder note from Joyce and her mom is shown');
  ok(text().includes('Joyce, co-founder'), 'signature present');
  ok(q('[data-act=to-gate]'), '"Come on in" button present');
  click(q('[data-act=to-gate]'));

  section('Age gate');
  ok(q('.gate'), 'gate screen renders');
  click(q('[data-act=story]'));
  ok(q('.modal') && q('.modal').textContent.includes('Our story'), '"Read our story" opens the story');
  key(app, 'Escape');
  ok(!q('.modal'), 'Escape closes story');
  click(q('[data-act=enter]'));

  section('Map');
  ok(qa('.nav button').length === 5 && q('svg.map'), '5 tabs + map');
  ok(qa('.pin').length === 5, '5 court pins');
  ok(q('#q'), 'search input present');
  click(q('[data-act=zoom-in]')); ok(q('#world').style.transform === 'scale(1.25)', 'zoom in');
  click(q('[data-act=recenter]')); ok(q('#world').style.transform === 'scale(1)', 'recenter');

  section('Search');
  type(q('#q'), 'grant');
  ok(qa('.hit').length === 1 && text().includes('Grant Park'), 'filters hits to Grant Park');
  ok(qa('.pin.dim').length === 4, 'non-matching pins dimmed');
  type(q('#q'), 'zzzz');
  ok(text().includes('No hits match'), 'empty state for no matches');
  click(q('[data-act=clear-search]'));
  ok(qa('.hit').length === 4 && qa('.pin.dim').length === 0, 'clear search restores everything');
  type(q('#q'), '<img src=x onerror=alert(1)>');
  ok(!q('#content img') && text().includes('No hits match'), 'search query is escaped in the UI');
  click(q('[data-act=clear-search]'));

  section('Court detail → create a hit');
  click(qa('.pin')[3]); // Sellwood, no hits
  ok(text().includes('Sellwood Riverside') && text().includes('No open hits yet'), 'Sellwood has no hits');
  click(q('[data-act=create]'));
  ok(q('.modal') && q('#f-court').value === '4', 'create modal opens with Sellwood preselected');
  click(q('[data-act=seg][data-field=type][data-val=Singles]'));
  click(q('[data-act=seg][data-field=level][data-val="3.5–4.0"]'));
  change(q('#f-when'), 'Saturday, 10:00 AM');
  type(q('#f-note'), 'Clay court singles, then brunch.');
  click(q('[data-act=post]'));
  ok(q('.modal') && q('.modal').textContent.includes('Your hit is posted'), 'confirmation shown');
  click(q('#modalClose'));
  ok(text().includes('1 open hit here') && text().includes('You, Singles') && text().includes('Saturday, 10:00 AM'), 'new hit appears on the court');
  ok(qa('.pin')[3].querySelector('text') && qa('.pin')[3].querySelector('text').textContent === '1', 'pin badge updates to 1');
  click(q('[data-act=back]'));
  ok(qa('.hit').length === 5 && text().includes('You are hosting') && text().includes('Clay court singles, then brunch.'), 'hosted hit in the list with note');

  section('Join a hit → group chat opens');
  click(q('[data-act=join]'));
  ok(q('[data-act=join]').disabled, 'joined');
  click(q('[data-act=tab][data-id=chat]'));
  ok(text().includes('Doubles at Laurelhurst'), 'group chat room for the joined hit exists');
  ok(text().includes('Singles at Sellwood'), 'group chat room for the hosted hit exists');
  click(q('[data-act=room][data-id="hit:1"]'));
  ok(q('#msgs').textContent.includes('Welcome to the group'), 'host greets you in the group');

  section('Chat, security');
  click(q('[data-act=room][data-id=city]'));
  ok(q('#msgs').textContent.includes('Joyce'), 'Joyce welcomes the clubhouse');
  const before = qa('.msg').length;
  q('#chatInput').value = '<b>hi</b><script>x</script>';
  click(q('[data-act=send]'));
  const last = [...qa('.msg')].pop();
  ok(qa('.msg').length === before + 1 && !last.querySelector('b') && !last.querySelector('script') && last.textContent.includes('<b>hi</b>'), 'XSS payload rendered as inert text');
  q('#chatInput').value = 'spam'; click(q('[data-act=send]'));
  ok(qa('.msg').length === before + 1, 'send cooldown blocks rapid second send');
  q('#chatInput').value = '   '; click(q('[data-act=send]'));
  ok(qa('.msg').length === before + 1, 'blank message rejected');

  section('Direct message');
  click(q('[data-act=tab][data-id=hits]'));
  click(q('[data-act=person]'));
  ok(q('.modal') && q('.modal').textContent.includes('Maggie R.'), 'profile opens');
  click(q('[data-act=dm]'));
  ok(q('.rooms button.on') && q('.rooms button.on').textContent === 'Maggie', 'DM room with Maggie opened and selected');
  ok(q('#msgs').textContent.includes('Say hello to Maggie'), 'empty DM prompt');

  section('Socials');
  click(q('[data-act=tab][data-id=social]'));
  ok(text().includes('Social gatherings') && text().includes('Joyce and her mom pick'), 'socials + personal touch');
  click(q('[data-act=rsvp][data-id="1"]'));
  ok(text().includes("You're attending") && text().includes('19 attending'), 'RSVP reflects in count');
  click(q('[data-act=rsvp][data-id="3"]'));
  click(q('[data-act=tab][data-id=chat]'));
  ok(text().includes('Second Friday') && text().includes('Indian Wells trip'), 'event group chats appear after RSVP');
  click(q('[data-act=room][data-id="ev:1"]'));
  ok(q('#msgs').textContent.includes('My mom is in charge of the snacks'), 'Joyce greets in the social group');

  section('Lessons');
  click(q('[data-act=tab][data-id=lessons]'));
  ok(qa('.coach').length === 3, '3 coaches');
  click(q('[data-act=lesson][data-id="1"]'));
  ok(q('.modal') && q('[data-act=reserve]').disabled, 'reserve disabled until a time is chosen');
  click(q('[data-act=seg][data-field=slot][data-val="Sun 11:00 AM"]'));
  ok(!q('[data-act=reserve]').disabled, 'choosing a slot enables confirm');
  click(q('[data-act=reserve]'));
  ok(q('.modal').textContent.includes('Lesson reserved'), 'reservation confirmed');
  click(q('#modalClose'));
  ok(text().includes('Reserved, Sun 11:00 AM'), 'coach card shows the reservation');

  section('Coach application');
  click(q('[data-act=apply]'));
  click(q('[data-act=send-apply]'));
  ok(q('.modal') && q('#f-name'), 'empty name does not submit');
  type(q('#f-name'), 'Sam Ortiz');
  click(q('[data-act=seg][data-field=plan][data-val=Partner]'));
  click(q('[data-act=send-apply]'));
  ok(q('.modal').textContent.includes('Application received'), 'application confirmed');
  click(q('#modalClose'));
  ok(text().includes('Application received'), 'pitch card reflects applied state');

  section('Story from inside the app');
  click(q('[data-act=tab][data-id=map]'));
  click(q('[data-act=story]'));
  ok(q('.modal') && q('.modal').textContent.includes('for the love of connecting'), 'logo opens Our story');
  ok(q('[data-act=reset]'), 'reset demo control present');
  click(q('#modalClose'));

  section('Persistence (reload)');
  const saved = JSON.parse(window.__mem['40love:state']);
  ok(saved.created.length === 1 && saved.joined['1'] === true && saved.reserved['1'] === 'Sun 11:00 AM' && saved.applied === true, 'state written to storage');
  const second = await boot(window.__mem);
  const app2 = second.document.getElementById('app');
  const click2 = el => el.dispatchEvent(new second.window.MouseEvent('click', { bubbles: true }));
  click2(app2.querySelector('[data-act=to-gate]')); click2(app2.querySelector('[data-act=enter]'));
  ok(app2.textContent.includes('You are hosting') && app2.querySelector('[data-act=join]').disabled, 'hosted hit and join survive reload');
  click2(app2.querySelector('[data-act=tab][data-id=lessons]'));
  ok(app2.textContent.includes('Reserved, Sun 11:00 AM') && app2.textContent.includes('Application received'), 'lesson + application survive reload');

  section('Tampered storage is rejected');
  const evil = { '40love:state': JSON.stringify({ created: [{ courtId: 999, type: 'Doubles', level: 'All levels', when: 'Today, 5:30 PM' }, { courtId: 1, type: '<script>', level: 'All levels', when: 'Today, 5:30 PM' }], msgs: { city: [{ who: '<b>x</b>', t: '<img src=x>', me: 'yes' }], 'evil:1': [{ t: 'nope' }] }, joined: { abc: true }, reserved: { '1': 'never' }, applied: 'true' }) };
  const third = await boot(evil);
  const app3 = third.document.getElementById('app');
  const click3 = el => el.dispatchEvent(new third.window.MouseEvent('click', { bubbles: true }));
  click3(app3.querySelector('[data-act=to-gate]')); click3(app3.querySelector('[data-act=enter]'));
  ok(app3.querySelectorAll('.hit').length === 4, 'invalid created hits dropped');
  click3(app3.querySelector('[data-act=tab][data-id=chat]'));
  ok(!app3.querySelector('#msgs img') && !app3.querySelector('#msgs b') && !app3.textContent.includes('nope'), 'malicious stored messages neutralized, unknown rooms ignored');
  click3(app3.querySelector('[data-act=tab][data-id=lessons]'));
  ok(!app3.textContent.includes('never') && app3.querySelector('[data-act=apply]'), 'invalid reservation + non-boolean applied rejected');

  section('Runtime');
  ok(errors.length === 0 && second.errors.length === 0 && third.errors.length === 0, 'no JS errors across three sessions' + (errors.length ? ' → ' + errors.join(' | ') : ''));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
