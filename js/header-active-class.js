(function () {
  const path = window.location.pathname;
  const currentFile = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  // A page can legitimately be listed under more than one dropdown —
  // MaterialPropertyLookup.html sits under both Stress and MIL-HDBK-5. Lighting
  // up both toggles reads as two current pages, so exactly one menu owns the
  // highlight: the first whose label matches this list, else the first in
  // document order.
  const PREFERRED_MENUS = ['stress'];

  function menuLabel(navItem) {
    const t = navItem.querySelector('.nav-link.dropdown-toggle');
    return t ? t.textContent.replace(/\s+/g, ' ').trim().toLowerCase() : '';
  }

  function applyActiveClasses() {
    const currentHash = window.location.hash;

    // Clear what a previous pass set so re-running on hashchange is idempotent
    // rather than accumulating highlights.
    document.querySelectorAll('nav .nav-link.active, nav .dropdown-item.active')
      .forEach(function (el) { el.classList.remove('active'); });

    // --- Dropdown items ---
    const matches = [];
    document.querySelectorAll('nav .dropdown-item').forEach(function (item) {
      const href = item.getAttribute('href') || '';
      const hashIdx = href.indexOf('#');
      const hrefFile = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
      if (hrefFile !== currentFile) return;
      matches.push({ item: item, hash: hashIdx >= 0 ? href.substring(hashIdx) : '' });
    });

    if (matches.length) {
      // the distinct dropdowns this page appears in, in document order
      const owners = [];
      matches.forEach(function (m) {
        const nav = m.item.closest('.nav-item');
        if (nav && owners.indexOf(nav) === -1) owners.push(nav);
      });

      let owner = null;
      for (let i = 0; i < PREFERRED_MENUS.length && !owner; i++) {
        owner = owners.filter(function (n) {
          return menuLabel(n).indexOf(PREFERRED_MENUS[i]) !== -1;
        })[0] || null;
      }
      if (!owner) owner = owners[0];

      const toggle = owner.querySelector('.nav-link.dropdown-toggle');
      if (toggle) toggle.classList.add('active');

      // Highlight the specific item only within the owning menu, and only when
      // the hashes agree. A link with no hash matches any page with that
      // filename; a link with one has to match the current hash exactly.
      matches.forEach(function (m) {
        if (m.item.closest('.nav-item') !== owner) return;
        if (m.hash && m.hash !== currentHash) return;
        m.item.classList.add('active');
        // Auto-expand the nested submenu (if any) so the active item is visible.
        const submenu = m.item.closest('.dropdown-submenu');
        if (submenu) {
          submenu.classList.add('open');
          const subToggle = submenu.querySelector('.dropdown-submenu-toggle');
          if (subToggle) subToggle.setAttribute('aria-expanded', 'true');
        }
      });
    }

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
