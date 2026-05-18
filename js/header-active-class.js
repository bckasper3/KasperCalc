(function () {
  const path = window.location.pathname;
  const currentFile = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  function applyActiveClasses() {
    const currentHash = window.location.hash;

    // --- Dropdown items ---
    document.querySelectorAll('nav .dropdown-item').forEach(function (item) {
      const href = item.getAttribute('href') || '';
      const hashIdx = href.indexOf('#');
      const hrefFile = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
      const hrefHash = hashIdx >= 0 ? href.substring(hashIdx) : '';

      if (hrefFile !== currentFile) return;

      // File matches — always highlight the parent dropdown toggle
      const toggle = item.closest('.nav-item').querySelector('.nav-link.dropdown-toggle');
      if (toggle) toggle.classList.add('active');

      // Highlight the specific item only when hashes also agree.
      // If the link has no hash, it matches any page with that filename.
      // If the link has a hash, require the current URL hash to match exactly.
      if (!hrefHash || hrefHash === currentHash) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // --- Top-level nav links (Home, About) ---
    document.querySelectorAll('nav .nav-link:not(.dropdown-toggle)').forEach(function (link) {
      const href = (link.getAttribute('href') || '').split('#')[0];
      if (href && href === currentFile) {
        link.classList.add('active');
      }
    });
  }

  applyActiveClasses();
  window.addEventListener('hashchange', applyActiveClasses);
})();
