// Theme scripts
function toggleMenu() {
  const menu = document.querySelector('.nav-links');
  const cart = document.querySelector('.floating-cart');
  const toggle = document.querySelector('.mobile-menu-toggle');
  if (menu) {
    menu.classList.toggle('active');
    if (toggle) {
      if (menu.classList.contains('active')) {
        toggle.classList.add('open');
      } else {
        toggle.classList.remove('open');
      }
    }
    if (cart) {
      if (menu.classList.contains('active')) {
        cart.classList.add('hidden');
      } else {
        cart.classList.remove('hidden');
      }
    }
  }
}

// Strip inline styles from product descriptions that were pasted with rich text
document.addEventListener('DOMContentLoaded', function() {
  const desc = document.querySelector('.product-description');
  if (desc) {
    desc.querySelectorAll('[style]').forEach(function(el) {
      el.removeAttribute('style');
    });
    desc.querySelectorAll('font').forEach(function(el) {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    });
    // Fix line break "sust\nainable" -> "sustainable"
    desc.innerHTML = desc.innerHTML.replace(/sust\s*ainable/gi, 'sustainable');
  }

  const returnLink = document.getElementById('return-policy-link');
  const returnModal = document.getElementById('return-modal');
  const returnClose = document.getElementById('return-modal-close');
  if (returnLink && returnModal && returnClose) {
    returnLink.addEventListener('click', function(e) {
      e.preventDefault();
      returnModal.classList.remove('hidden');
    });
    returnClose.addEventListener('click', function() {
      returnModal.classList.add('hidden');
    });
    returnModal.addEventListener('click', function(e) {
      if (e.target === returnModal) {
        returnModal.classList.add('hidden');
      }
    });
  }
});
