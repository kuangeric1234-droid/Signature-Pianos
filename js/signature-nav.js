/* Signature Pianos · mobile menu
   Builds the phone menu from the desktop header that is already on the page,
   so the two can never drift apart. The burger button opens it; Escape, a link
   tap or the burger again closes it. */
(function () {
  var nav = document.getElementById('nav');
  var burger = nav && nav.querySelector('.nav-burger');
  if (!nav || !burger) return;

  var menu = document.createElement('div');
  menu.className = 'sp-menu';
  menu.id = 'sp-menu';
  menu.setAttribute('aria-label', 'Site menu');

  function link(href, title, note) {
    var a = document.createElement('a');
    a.className = 'sp-menu-link';
    a.href = href;
    a.textContent = title;
    if (note) {
      var small = document.createElement('small');
      small.textContent = note;
      a.appendChild(small);
    }
    return a;
  }

  function group(label) {
    var section = document.createElement('section');
    section.className = 'sp-menu-group';
    if (label) {
      var h = document.createElement('h2');
      h.textContent = label;
      section.appendChild(h);
    }
    menu.appendChild(section);
    return section;
  }

  // One group per dropdown, in header order
  nav.querySelectorAll('.nav-links .nav-item--dropdown').forEach(function (item) {
    var trigger = item.querySelector('.nav-link-trigger');
    var section = group(trigger ? trigger.textContent.trim() : '');
    item.querySelectorAll('.nav-dd-item').forEach(function (dd) {
      var title = dd.querySelector('h4');
      var note = dd.querySelector('p');
      section.appendChild(link(dd.getAttribute('href') || '#',
        title ? title.textContent.trim() : dd.textContent.trim(),
        note ? note.textContent.trim() : ''));
    });
  });

  // Plain links (Blog, About) and the account links
  var more = group('');
  nav.querySelectorAll('.nav-links .nav-link-plain').forEach(function (a) {
    more.appendChild(link(a.getAttribute('href') || '#', a.textContent.trim()));
  });
  nav.querySelectorAll('.nav-dropdown--account .nav-dd-item').forEach(function (dd) {
    var title = dd.querySelector('h4');
    more.appendChild(link(dd.getAttribute('href') || '#', title ? title.textContent.trim() : ''));
  });

  // Contact, copied from the top bar
  var topbar = document.querySelector('.sp-topbar');
  if (topbar) {
    var contact = document.createElement('div');
    contact.className = 'sp-menu-contact';
    topbar.querySelectorAll('span, a').forEach(function (node) {
      contact.appendChild(node.cloneNode(true));
    });
    menu.appendChild(contact);
  }

  document.body.appendChild(menu);
  burger.setAttribute('aria-controls', 'sp-menu');
  burger.setAttribute('aria-expanded', 'false');
  var icon = burger.querySelector('i');

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('sp-menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    if (icon) icon.className = open ? 'ti ti-x' : 'ti ti-menu-2';
  }

  burger.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!menu.classList.contains('is-open'));
  });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      burger.focus();
    }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 960 && menu.classList.contains('is-open')) setOpen(false);
  });
})();
