/*
 * Classbuster public "Why Classbuster" page: consent-gated testimonials.
 *
 * Approved quotes come ONLY from /assets/testimonials/testimonials.json
 * (see TESTIMONIALS-GUIDE-20261102.md). Every entry must pass the publication
 * gate below before it is shown; anything else is silently dropped, so with no
 * approvals the page shows product benefits and the beta feedback invitation
 * and never a placeholder or invented card.
 *
 * Security: quotes are rendered with textContent only (no HTML parsing sink),
 * so markup in the data file is displayed as plain text. No third-party requests:
 * the data file is fetched from this origin (CSP connect-src 'self').
 * Privacy: the public file may hold only display fields plus an OPAQUE consent
 * reference. Signed consent records stay private and outside this repository;
 * fields that would carry them (email, signature, notes...) fail the gate.
 */
(function(root){
  'use strict';

  var DATA_URL = '/assets/testimonials/testimonials.json';
  var SCHEMA_VERSION = 1;
  var MAX_CARDS = 12;
  var CONSENT_REF = /^CB-CONSENT-\d{8}-[A-Z0-9]{4,12}$/;
  var ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,39}$/;
  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var ENTRY_KEYS = ['id', 'quote', 'attribution', 'consent'];
  var ATTRIBUTION_KEYS = ['name', 'role', 'context'];
  var CONSENT_KEYS = ['status', 'reference', 'approvedOn', 'expiresOn', 'channels', 'anonymous'];
  // Personal data that must never appear in a published quote or attribution.
  var EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  var URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|app|edu|rs|co)\b/i;
  var PHONE_LIKE = /(?:\+?\d[\s().-]?){7,}/;
  var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

  function isPlainObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
  function onlyKeys(obj, allowed){
    return Object.keys(obj).every(function(k){ return allowed.indexOf(k) !== -1; });
  }
  function parseDate(value){
    if(typeof value !== 'string') return null;
    var m = ISO_DATE.exec(value);
    if(!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if(d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function utcDay(now){
    var d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  function cleanText(value, min, max){
    if(typeof value !== 'string') return null;
    var text = value.replace(/\s+/g, ' ').trim();
    if(text.length < min || text.length > max || CONTROL.test(value)) return null;
    return text;
  }
  function leaksPersonalData(text){
    return EMAIL.test(text) || URL_LIKE.test(text) || PHONE_LIKE.test(text);
  }

  /** Returns {ok, reasons[], item?}. item contains display fields only. */
  function validateTestimonial(entry, now){
    var reasons = [];
    var today = utcDay(now);
    if(!isPlainObject(entry)) return {ok: false, reasons: ['entry is not an object']};
    if(!onlyKeys(entry, ENTRY_KEYS)) reasons.push('unexpected top-level field');
    if(typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) reasons.push('invalid id');

    var quote = cleanText(entry.quote, 20, 600);
    if(!quote) reasons.push('quote missing, too short/long or contains control characters');
    else if(leaksPersonalData(quote)) reasons.push('quote contains an email, link or phone number');

    var a = entry.attribution;
    var name = null, role = null, context = null;
    if(!isPlainObject(a)) reasons.push('attribution missing');
    else {
      if(!onlyKeys(a, ATTRIBUTION_KEYS)) reasons.push('unexpected attribution field');
      role = cleanText(a.role, 2, 80);
      if(!role) reasons.push('attribution.role required (2-80 characters)');
      if(a.name != null){ name = cleanText(a.name, 1, 60); if(!name) reasons.push('attribution.name invalid'); }
      if(a.context != null){ context = cleanText(a.context, 2, 80); if(!context) reasons.push('attribution.context invalid'); }
      [name, role, context].forEach(function(t){ if(t && leaksPersonalData(t)) reasons.push('attribution contains an email, link or phone number'); });
    }

    var c = entry.consent;
    if(!isPlainObject(c)) reasons.push('consent missing');
    else {
      if(!onlyKeys(c, CONSENT_KEYS)) reasons.push('consent has a non-public field (keep consent records private)');
      if(c.status !== 'approved') reasons.push('consent status is not approved');
      if(typeof c.reference !== 'string' || !CONSENT_REF.test(c.reference)) reasons.push('consent.reference must be an opaque CB-CONSENT-YYYYMMDD-XXXX id');
      var approved = parseDate(c.approvedOn);
      if(!approved) reasons.push('consent.approvedOn must be a real YYYY-MM-DD date');
      else if(approved > today) reasons.push('consent.approvedOn is in the future');
      if(c.expiresOn != null){
        var expires = parseDate(c.expiresOn);
        if(!expires) reasons.push('consent.expiresOn invalid');
        else if(expires <= today) reasons.push('consent expired');
      }
      if(!Array.isArray(c.channels) || c.channels.indexOf('website') === -1) reasons.push('consent does not cover the website');
      if(c.anonymous != null && typeof c.anonymous !== 'boolean') reasons.push('consent.anonymous must be true or false');
      if(c.anonymous === true) name = null;
    }

    if(reasons.length) return {ok: false, reasons: reasons};
    return {ok: true, reasons: [], item: {
      id: entry.id, quote: quote,
      name: name || 'Classbuster beta teacher', role: role, context: context
    }};
  }

  /** Filters a parsed data file down to publishable display items. Never throws. */
  function selectPublishable(data, now){
    if(!isPlainObject(data) || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.testimonials)) return [];
    var seen = {};
    var out = [];
    for(var i = 0; i < data.testimonials.length && out.length < MAX_CARDS; i++){
      var result = validateTestimonial(data.testimonials[i], now);
      if(!result.ok || seen[result.item.id]) continue;
      seen[result.item.id] = true;
      out.push(result.item);
    }
    return out;
  }

  /** Renders cards with textContent only. Returns number of cards shown. */
  function renderTestimonials(doc, section, list, items){
    if(!section || !list) return 0;
    while(list.firstChild) list.removeChild(list.firstChild);
    if(!items || !items.length){ section.hidden = true; return 0; }
    items.forEach(function(item){
      var li = doc.createElement('li');
      li.className = 'quote-card';
      var figure = doc.createElement('figure');
      var block = doc.createElement('blockquote');
      var p = doc.createElement('p');
      p.textContent = item.quote;
      block.appendChild(p);
      var cap = doc.createElement('figcaption');
      var who = doc.createElement('span');
      who.className = 'quote-name';
      who.textContent = item.name;
      var role = doc.createElement('span');
      role.className = 'quote-role';
      role.textContent = item.context ? item.role + ' · ' + item.context : item.role;
      cap.appendChild(who);
      cap.appendChild(role);
      figure.appendChild(block);
      figure.appendChild(cap);
      li.appendChild(figure);
      list.appendChild(li);
    });
    section.hidden = false;
    return items.length;
  }

  function boot(doc, fetchImpl){
    var section = doc.getElementById('testimonials');
    var list = doc.getElementById('testimonialList');
    if(!section || !list || typeof fetchImpl !== 'function') return Promise.resolve(0);
    return fetchImpl(DATA_URL, {credentials: 'omit', cache: 'no-cache'})
      .then(function(res){ return res && res.ok ? res.json() : null; })
      .then(function(data){ return renderTestimonials(doc, section, list, selectPublishable(data, Date.now())); })
      .catch(function(){ section.hidden = true; return 0; });
  }

  var api = {
    DATA_URL: DATA_URL, SCHEMA_VERSION: SCHEMA_VERSION, MAX_CARDS: MAX_CARDS,
    validateTestimonial: validateTestimonial, selectPublishable: selectPublishable,
    renderTestimonials: renderTestimonials, boot: boot
  };
  if(typeof module === 'object' && module.exports){ module.exports = api; return; }
  root.ClassbusterTestimonials = api;
  var start = function(){ boot(root.document, root.fetch ? root.fetch.bind(root) : null); };
  if(root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : this);
