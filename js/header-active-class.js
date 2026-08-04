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
        // Auto-expand the nested submenu (if any) so the active item is visible.
        const submenu = item.closest('.dropdown-submenu');
        if (submenu) {
          submenu.classList.add('open');
          const toggle = submenu.querySelector('.dropdown-submenu-toggle');
          if (toggle) toggle.setAttribute('aria-expanded', 'true');
        }
      } else {
        item.classList.remove('active');
      }
    });

    // --- Nested submenu expand/collapse (Chapter 2/3/4 sections) ---
    document.querySelectorAll('.dropdown-submenu-toggle').forEach(function (toggle) {
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const submenu = toggle.closest('.dropdown-submenu');
        const isOpen = submenu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
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

  // Inject desktop logoblock and hide mobile brand elements on large screens
  const brandImg = document.querySelector('nav a.navbar-brand img');
  const brandImgLink = brandImg ? brandImg.closest('a.navbar-brand') : null;
  const brandTextLink = brandImgLink ? brandImgLink.nextElementSibling : null;

  if (brandImgLink) {
    // Hide existing brand elements on md+ screens
    brandImgLink.classList.add('d-md-none');
    if (brandTextLink && brandTextLink.classList.contains('navbar-brand')) {
      brandTextLink.classList.add('d-md-none');
    }

    // Determine href for the logo link
    const logoHref = brandImgLink.getAttribute('href') || 'index.html';

    // Inject desktop logoblock before the existing brand elements
    const desktopLogo = document.createElement('a');
    desktopLogo.href = logoHref;
    desktopLogo.className = 'navbar-brand d-none d-md-inline-block';
    desktopLogo.style.textDecoration = 'none';
    desktopLogo.innerHTML =
      '<div class="logoblock">' +
        '<img class="logo logo-nav" src="img/blueK.webp" alt="KasperCalcLogo" />' +
        '<h4 class="footerlogo">KasperCalc</h4>' +
      '</div>';
    brandImgLink.parentNode.insertBefore(desktopLogo, brandImgLink);
  }
})();
