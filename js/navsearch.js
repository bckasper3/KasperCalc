    const toggleBtn1 = document.getElementById('toggleSearch1');
    const searchBox1 = document.getElementById('searchBox1');
    const var_nav_svg_1 = document.getElementById('nav-svg-1');

    toggleBtn1.addEventListener('click', () => {
      searchBox1.classList.toggle('show');
      var_nav_svg_1.classList.toggle('icon-active'); // toggle color
     });

  const toggleBtn2 = document.getElementById('toggleSearch2');
  const searchBox2 = document.getElementById('searchBox2');
  const searchInput2 = document.getElementById('searchInput2');
  const var_nav_svg_2 = document.getElementById('nav-svg-2');



    toggleBtn2.addEventListener('click', () => {
        if (searchBox2.classList.contains('show')) {
        hideSearch();
        } else {
        showSearch();
        var_nav_svg_2.classList.add('icon-active');
    }});

  function showSearch() {
    searchBox2.classList.add('show')
    var_nav_svg_2.classList.add('icon-active'); // make icon active;
    setTimeout(() => searchInput2.focus(), 150); // Allow animation to begin
}

  function hideSearch() {
    searchBox2.classList.remove('show');
    var_nav_svg_2.classList.remove('icon-active'); // remove active color
  }

  // This should be collapsing the navbar when the screen size gets too small
  window.addEventListener('resize', function () {
    const navbarCollapse = document.querySelector('.navbar-collapse');
    const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);

    if (window.innerWidth >= 768) { // Bootstrap's sm breakpoint (≥768px)
      if (navbarCollapse.classList.contains('show')) {
        bsCollapse.hide(); // Collapse the navbar
      }
    }

    if (window.innerWidth <= 768) { // Bootstrap's sm breakpoint (≥768px)
    searchBox2.classList.add('d-none');
    }
    if (window.innerWidth > 768) { // Bootstrap's sm breakpoint (≥768px)
    searchBox2.classList.remove('d-none');
    }
  });


  window.addEventListener('load', () => {
    const searchBox = document.querySelector('.search-container2');
    if (searchBox.classList.contains('no-animate')) {
      searchBox.classList.remove('no-animate');
    }
  });