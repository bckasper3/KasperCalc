// Wrapped in an initializer (rather than running at top level) because on
// pages that inject the navbar asynchronously (e.g. 404.html fetches it
// from index.html), this script's `defer` load fires before that injected
// markup exists. Re-invoking window.initNavSearch() after injection binds
// the listeners to the now-present elements. Guarded so repeat calls on
// the same elements don't double-bind.
function initNavSearch() {
  const toggleBtn1 = document.getElementById('toggleSearch1');
  const searchBox1 = document.getElementById('searchBox1');
  const var_nav_svg_1 = document.getElementById('nav-svg-1');

  if (toggleBtn1 && searchBox1 && var_nav_svg_1 && !toggleBtn1.dataset.navsearchBound) {
    toggleBtn1.dataset.navsearchBound = 'true';
    toggleBtn1.addEventListener('click', () => {
      searchBox1.classList.toggle('show');
      var_nav_svg_1.classList.toggle('icon-active'); // toggle color
    });
  }

  const toggleBtn2 = document.getElementById('toggleSearch2');
  const searchBox2 = document.getElementById('searchBox2');
  const searchInput2 = document.getElementById('searchInput2');
  const var_nav_svg_2 = document.getElementById('nav-svg-2');

  function showSearch() {
    searchBox2.classList.add('show');
    var_nav_svg_2.classList.add('icon-active'); // make icon active;
    setTimeout(() => searchInput2.focus(), 150); // Allow animation to begin
  }

  function hideSearch() {
    searchBox2.classList.remove('show');
    var_nav_svg_2.classList.remove('icon-active'); // remove active color
  }

  if (toggleBtn2 && searchBox2 && var_nav_svg_2 && !toggleBtn2.dataset.navsearchBound) {
    toggleBtn2.dataset.navsearchBound = 'true';
    toggleBtn2.addEventListener('click', () => {
      if (searchBox2.classList.contains('show')) {
        hideSearch();
      } else {
        showSearch();
        var_nav_svg_2.classList.add('icon-active');
      }
    });
  }

  // This should be collapsing the navbar when the screen size gets too small
  if (!window._navsearchResizeBound) {
    window._navsearchResizeBound = true;
    window.addEventListener('resize', function () {
      const navbarCollapse = document.querySelector('.navbar-collapse');
      const bsCollapse = navbarCollapse && bootstrap.Collapse.getInstance(navbarCollapse);
      const box2 = document.getElementById('searchBox2');

      if (window.innerWidth >= 768) { // Bootstrap's sm breakpoint (≥768px)
        if (bsCollapse && navbarCollapse.classList.contains('show')) {
          bsCollapse.hide(); // Collapse the navbar
        }
      }

      if (!box2) return;
      if (window.innerWidth <= 768) { // Bootstrap's sm breakpoint (≥768px)
        box2.classList.add('d-none');
      }
      if (window.innerWidth > 768) { // Bootstrap's sm breakpoint (≥768px)
        box2.classList.remove('d-none');
      }
    });
  }

  if (!window._navsearchLoadBound) {
    window._navsearchLoadBound = true;
    window.addEventListener('load', () => {
      const searchBox = document.querySelector('.search-container2');
      if (searchBox && searchBox.classList.contains('no-animate')) {
        searchBox.classList.remove('no-animate');
      }
    });
  }
}

window.initNavSearch = initNavSearch;
initNavSearch();
