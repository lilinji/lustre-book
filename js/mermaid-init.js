/*
 * mermaid-init.js — render ```mermaid fenced blocks in the mdBook output.
 *
 * mdBook emits an unknown-language fence as:
 *     <pre><code class="language-mermaid">graph TD ...</code></pre>
 * Mermaid expects <div class="mermaid">. This shim bridges the two.
 *
 * It also re-renders on a theme switch so the diagrams stay legible when the
 * reader toggles between the light (rust) and dark (coal/navy/ayu) themes.
 */
(function () {
  'use strict';

  /** mdBook's dark themes; anything else means the light Mermaid theme. */
  var DARK_BOOK_THEMES = ['navy', 'coal', 'ayu'];

  /** @type {{el: HTMLElement, src: string}[]} */
  var sources = [];
  var rendered = false;

  function isDarkBookTheme() {
    var cls = document.documentElement.className || '';
    return DARK_BOOK_THEMES.some(function (t) {
      return new RegExp('(^|\\s)' + t + '(\\s|$)').test(cls);
    });
  }

  /**
   * Swap every language-mermaid code block for a .mermaid div, remembering the
   * original text so a later theme switch can rebuild it from scratch.
   */
  function collectSources() {
    var codes = document.querySelectorAll('code.language-mermaid');
    Array.prototype.forEach.call(codes, function (code) {
      var isWrappedInPre = code.parentNode && code.parentNode.tagName === 'PRE';
      var host = isWrappedInPre ? code.parentNode : code;
      var source = code.textContent;
      var div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = source;
      host.parentNode.replaceChild(div, host);
      sources.push({ el: div, src: source });
    });
  }

  function draw() {
    if (!sources.length) return;
    var mermaid = window.mermaid;
    if (typeof mermaid === 'undefined') return;

    // Mermaid refuses to re-process a node that already holds an <svg>, so
    // reset each block back to its plain-text source before every draw.
    sources.forEach(function (s) {
      s.el.textContent = s.src;
      s.el.removeAttribute('data-processed');
    });

    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkBookTheme() ? 'dark' : 'default',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true }
    });

    // suppressErrors keeps one malformed diagram from blanking the whole page
    // (or, in print.html, the whole book).
    mermaid
      .run({ nodes: sources.map(function (s) { return s.el; }), suppressErrors: true })
      .catch(function (err) {
        if (window.console) console.error('[mermaid] render failed:', err);
      });
  }

  function boot() {
    if (typeof window.mermaid === 'undefined') {
      if (window.console) console.error('[mermaid] bundle not loaded; diagrams stay as text');
      return;
    }
    collectSources();
    draw();
    rendered = true;

    // mdBook toggles themes by swapping a class on <html>; follow it.
    var lastDark = isDarkBookTheme();
    new MutationObserver(function () {
      var nowDark = isDarkBookTheme();
      if (nowDark !== lastDark) {
        lastDark = nowDark;
        draw();
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  if (!rendered) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})();
