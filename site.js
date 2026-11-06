// Sections: show one at a time, chosen by the URL hash. Without JS every section shows.
(function () {
  var panes = document.querySelectorAll('.pane');
  var links = document.querySelectorAll('nav a');
  function show() {
    var id = (location.hash || '#home').slice(1);
    if (!document.getElementById(id)) id = 'home';
    panes.forEach(function (p) { p.hidden = p.id !== id; });
    document.body.classList.toggle('open', id !== 'home');
    links.forEach(function (a) { a.classList.toggle('here', a.getAttribute('href') === '#' + id); });
  }
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {     // clicking the open section again goes back home
      if (a.classList.contains('here')) { e.preventDefault(); location.hash = ''; }
    });
  });
  window.addEventListener('hashchange', show);
  show();
})();

// Works gallery: built from works.json, which make_works.ps1 writes from the photos in works-src\.
(function () {
  var grids = document.querySelectorAll('.grid[data-group]');
  if (!grids.length) return;
  fetch('works.json').then(function (r) { return r.json(); }).then(function (items) {
    if (!items.length) items = [1, 2, 3, 4, 5, 6].map(function () { return { title: '[Title]', date: '[year]', thumb: '', full: '#works' }; });
    var byGroup = {};
    grids.forEach(function (g) { byGroup[g.dataset.group] = g; });
    items.forEach(function (w) {
      var grid = byGroup[w.group] || grids[0];        // an unknown or missing group goes to the first grid
      var fig = document.createElement('figure');
      var a = document.createElement('a'); a.href = w.full;
      var img;
      if (w.video) {                    // still preview; plays (and grows to its own shape) only while pointed at
        img = document.createElement('video');
        if (w.thumb) { img.poster = w.thumb; img.src = w.video; img.preload = 'none'; }
        else { img.src = w.video + '#t=0.1'; img.preload = 'metadata'; }   // first frame stands in for a still
        img.muted = true; img.loop = true; img.playsInline = true; img.setAttribute('aria-label', w.title);
        a.className = 'vid';
        a.addEventListener('mouseenter', function () {
          if (img.videoHeight > img.videoWidth) img.style.height = (100 * img.videoHeight / img.videoWidth) + '%';
          img.play().catch(function () {});
        });
        a.addEventListener('mouseleave', function () { img.pause(); img.currentTime = 0.1; img.style.height = ''; });
      } else {
        img = document.createElement('img'); if (w.thumb) img.src = w.thumb; img.alt = w.thumb ? w.title : ''; img.loading = 'lazy';
      }
      if (w.pos) img.style.objectPosition = w.pos;   // framing from works-pos.txt
      a.appendChild(img); fig.appendChild(a);
      var cap = document.createElement('figcaption');
      cap.textContent = w.title;
      if (w.date) { var d = document.createElement('span'); d.textContent = w.date; cap.appendChild(d); }
      fig.appendChild(cap); grid.appendChild(fig);
    });
    grids.forEach(function (g) { if (!g.children.length) g.parentNode.hidden = true; });   // hide an empty group
  }).catch(function () {});
})();
