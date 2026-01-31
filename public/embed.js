/**
 * Mood Embed Widget
 * Drop-in JavaScript for embedding mood feed on external sites
 *
 * Usage:
 * <script src="https://buxx.me/embed.js" data-mood-embed data-theme="auto" data-count="5"></script>
 */
(function() {
  'use strict';

  function initMoodEmbed() {
    var scripts = document.querySelectorAll('script[data-mood-embed]');

    scripts.forEach(function(script) {
      // Prevent double initialization
      if (script.dataset.initialized === 'true') return;
      script.dataset.initialized = 'true';

      // Parse options from data attributes
      var theme = script.dataset.theme || 'auto';
      var count = parseInt(script.dataset.count, 10) || 5;
      var refresh = script.dataset.refresh ? parseInt(script.dataset.refresh, 10) : null;
      var link = script.dataset.link !== 'false';
      var width = script.dataset.width || '100%';
      var height = script.dataset.height || '400';
      var lazy = script.dataset.lazy !== 'false';

      // Build embed URL
      var embedBase = '/mood/embed';
      if (script.src) {
        try {
          embedBase = new URL(script.src, window.location.href).origin + '/mood/embed';
        } catch (error) {
          embedBase = '/mood/embed';
        }
      }
      var params = new URLSearchParams();
      params.set('theme', theme);
      params.set('count', String(Math.min(10, Math.max(1, count))));
      if (refresh) params.set('refresh', String(refresh));
      if (!link) params.set('link', 'false');

      var embedUrl = embedBase + '?' + params.toString();

      // Create container
      var container = document.createElement('div');
      container.className = 'mood-embed-container';
      container.style.cssText = 'width:' + width + ';max-width:100%;';

      // Create iframe
      var iframe = document.createElement('iframe');
      iframe.src = embedUrl;
      iframe.style.cssText = 'width:100%;border:none;overflow:hidden;display:block;';
      iframe.style.height = height + 'px';
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowtransparency', 'true');
      iframe.setAttribute('title', 'Mood Feed');

      if (lazy) {
        iframe.setAttribute('loading', 'lazy');
      }

      container.appendChild(iframe);

      // Insert after the script tag
      script.parentNode.insertBefore(container, script.nextSibling);

      // Listen for resize messages from iframe
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'mood-embed-resize') {
          // Verify the message is from our iframe
          if (event.source === iframe.contentWindow) {
            iframe.style.height = event.data.height + 'px';
          }
        }
      });

      // Theme sync: detect parent theme changes
      if (theme === 'auto' && window.MutationObserver) {
        var syncTheme = function() {
          var isDark = document.documentElement.classList.contains('dark') ||
                       document.body.classList.contains('dark') ||
                       window.matchMedia('(prefers-color-scheme: dark)').matches;
          iframe.contentWindow.postMessage({
            type: 'mood-embed-theme',
            theme: isDark ? 'dark' : 'light'
          }, '*');
        };

        // Observe class changes on html/body
        var observer = new MutationObserver(syncTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Also listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);

        // Initial sync after iframe loads
        iframe.addEventListener('load', function() {
          setTimeout(syncTheme, 100);
        });
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMoodEmbed);
  } else {
    initMoodEmbed();
  }

  // Expose for manual initialization
  window.MoodEmbed = {
    init: initMoodEmbed
  };
})();
