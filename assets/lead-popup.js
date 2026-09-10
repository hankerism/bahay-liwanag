/* ===========================================================================
   BAHAY LIWANAG — LEAD SIGNUP POPUP
   Static, dependency-free. Embeds the public GHL form in a branded modal.
   - Shows after ~5s OR ~40% scroll (whichever first), never on load.
   - Warms up the GHL form ~3s after load (or at open, if scroll comes first)
     so the modal is rarely empty; a branded loading state covers any gap.
   - Shows once per browser; suppression persisted in localStorage with
     graceful fallback to sessionStorage, then an in-memory flag.
   - Never inspects or manipulates the cross-origin GHL iframe. It only
     listens for a same-origin-safe postMessage from the GHL widget origin
     to mark the popup completed after a successful submission.
   =========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'bl_lead_popup_v1';
  var GHL_ORIGIN = 'https://lets.controlyouraudience.com';
  var GHL_FORM_SRC = 'https://lets.controlyouraudience.com/widget/form/TW8JUghhGUgCGlNAFbwc';
  var SHOW_DELAY_MS = 5000;
  var PRELOAD_DELAY_MS = 3000;
  var SCROLL_TRIGGER_PCT = 40;

  /* ---- suppression storage (localStorage -> sessionStorage -> memory) ---- */
  var memFlag = false;
  function store(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); return; } catch (e) {}
    try { window.sessionStorage.setItem(STORAGE_KEY, value); return; } catch (e) {}
    memFlag = true;
  }
  function isSuppressed() {
    if (memFlag) return true;
    try { if (window.localStorage.getItem(STORAGE_KEY)) return true; } catch (e) {}
    try { if (window.sessionStorage.getItem(STORAGE_KEY)) return true; } catch (e) {}
    return false;
  }

  /* ---- do not interfere with the booking / payment flow ---- */
  function onBookingFlow() {
    if (document.getElementById('paymentForm')) return true;
    // an existing GHL booking iframe on this page (book-now.html)
    return !!document.querySelector(
      'iframe[src*="leadconnectorhq.com/widget/form"],' +
      'iframe[src*="msgsndr"],' +
      'iframe[id^="inline-7x9H9qxsWG9HkRmGMdHv"]'
    );
  }

  if (isSuppressed() || onBookingFlow()) return;

  var overlay, dialog, closeBtn, lastFocus, loadingEl;
  var scriptLoaded = false, opened = false, prepared = false;

  function buildMarkup() {
    overlay = document.createElement('div');
    overlay.className = 'bl-lp-overlay';
    overlay.innerHTML = [
      '<div class="bl-lp-dialog" role="dialog" aria-modal="true"',
      '     aria-labelledby="bl-lp-title" aria-describedby="bl-lp-desc">',
      '  <button type="button" class="bl-lp-close" aria-label="Close">&times;</button>',
      '  <p class="bl-lp-eyebrow">',
      '    <span class="bl-lp-capiz" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>',
      '    A little something for your next getaway',
      '  </p>',
      '  <h2 class="bl-lp-title" id="bl-lp-title">Enjoy <em>10% OFF</em> your first stay.</h2>',
      '  <p class="bl-lp-desc" id="bl-lp-desc">Join the Bahay Liwanag list and receive an exclusive 10% discount on your first stay. We&rsquo;ll send your discount code straight to your inbox.</p>',
      '  <div class="bl-lp-form">',
      '    <div class="bl-lp-loading" role="status">Preparing your offer&hellip;</div>',
      '    <iframe',
      '      src="' + GHL_FORM_SRC + '"',
      '      id="inline-TW8JUghhGUgCGlNAFbwc"',
      '      data-layout="{\'id\':\'INLINE\'}"',
      '      data-trigger-type="alwaysShow"',
      '      data-trigger-value=""',
      '      data-activation-type="alwaysActivated"',
      '      data-activation-value=""',
      '      data-deactivation-type="neverDeactivate"',
      '      data-deactivation-value=""',
      '      data-height="435"',
      '      data-layout-iframe-id="inline-TW8JUghhGUgCGlNAFbwc"',
      '      data-form-id="TW8JUghhGUgCGlNAFbwc"',
      '      data-cookie-consent="true"',
      '      data-cookie-consent-provider="auto"',
      '      title="Bahay Liwanag - 10% Off Lead Signup"></iframe>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(overlay);
    dialog = overlay.querySelector('.bl-lp-dialog');
    closeBtn = overlay.querySelector('.bl-lp-close');
    loadingEl = overlay.querySelector('.bl-lp-loading');

    // drop the branded loading state as soon as the iframe document loads
    // (a cross-origin `load` event — no content access), with a safety timeout
    var frame = overlay.querySelector('#inline-TW8JUghhGUgCGlNAFbwc');
    if (frame) frame.addEventListener('load', removeLoading);
    window.setTimeout(removeLoading, 15000);

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('mousedown', function (e) {
      // close only when the click starts on the overlay backdrop itself
      if (e.target === overlay) closePopup();
    });
  }

  function removeLoading() {
    if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
    loadingEl = null;
  }

  /* ---- warm up the form shortly before the popup is expected to open ---- */
  function prepare() {
    if (prepared || opened || isSuppressed()) return;
    prepared = true;
    if (!overlay) buildMarkup();   // hidden overlay; iframe starts fetching now
    loadGhlScript();
  }

  function loadGhlScript() {
    if (scriptLoaded) return;
    scriptLoaded = true;
    var s = document.createElement('script');
    s.src = GHL_ORIGIN + '/js/form_embed.js';
    s.async = true;
    document.body.appendChild(s);
  }

  var prevBodyOverflow = '';
  function lockScroll() {
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.body.style.overflow = prevBodyOverflow;
  }

  function onKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.stopPropagation();
      closePopup();
    }
  }

  function openPopup() {
    if (opened || isSuppressed()) return;
    clearTriggers();
    prepare();   // builds markup + loads the form if the preload has not run yet
    opened = true;

    lastFocus = document.activeElement;
    lockScroll();
    // force reflow so the transition runs
    overlay.getBoundingClientRect();
    overlay.classList.add('is-open');
    document.addEventListener('keydown', onKeydown, true);

    // move focus to the dialog without stealing it from the iframe later
    if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();

    // seen once — do not show again on subsequent pages/loads
    store('seen');
  }

  function closePopup() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown, true);
    unlockScroll();
    store('closed');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  /* ---- triggers: 8s timer OR 40% scroll, whichever first ---- */
  var timerId = null, preloadId = null;
  function scrollHandler() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    var pct = (window.scrollY || doc.scrollTop) / scrollable * 100;
    if (pct >= SCROLL_TRIGGER_PCT) openPopup();
  }
  function clearTriggers() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (preloadId) { clearTimeout(preloadId); preloadId = null; }
    window.removeEventListener('scroll', scrollHandler);
  }
  function armTriggers() {
    preloadId = window.setTimeout(prepare, PRELOAD_DELAY_MS);
    timerId = window.setTimeout(openPopup, SHOW_DELAY_MS);
    window.addEventListener('scroll', scrollHandler, { passive: true });
  }

  /* ---- detect a successful GHL submission (cross-origin safe) ---- */
  window.addEventListener('message', function (e) {
    if (e.origin !== GHL_ORIGIN) return;
    var data = e.data;
    try { if (typeof data === 'string') data = JSON.parse(data); } catch (err) {}
    var blob;
    try { blob = JSON.stringify(data || '').toLowerCase(); } catch (err) { blob = ''; }
    if (blob.indexOf('submit') !== -1 || blob.indexOf('success') !== -1) {
      store('submitted');
      // give the user a moment to see the GHL success state, then close
      window.setTimeout(closePopup, 2500);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armTriggers);
  } else {
    armTriggers();
  }
})();
