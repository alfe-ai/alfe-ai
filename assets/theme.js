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
    // Fix line break "sust\nainable" or with HTML tags -> "sustainable"
    desc.innerHTML = desc.innerHTML.replace(/sust(?:\s|<[^>]*>)*ainable/gi, '<span class="no-break">sustainable</span>');
  }
});

function positionFloatingCart() {
  const cart = document.querySelector('.floating-cart');
  const bluesky = document.querySelector(
    'a[href="https://bsky.app/profile/confused-art.bsky.social"]'
  );
  if (!cart) return;
  if (window.matchMedia('(min-width: 769px)').matches) {
    cart.style.position = 'sticky';
    cart.style.top = '1rem';
    if (bluesky) {
      const rect = bluesky.getBoundingClientRect();
      const offsetRight = rect.right;
      if (offsetRight > 0) {
        cart.style.left = offsetRight + window.pageXOffset + 8 + 'px';
        cart.style.right = 'auto';
      } else {
        cart.style.left = 'auto';
        cart.style.right = '1rem';
      }
    } else {
      cart.style.left = 'auto';
      cart.style.right = '1rem';
    }
  } else {
    cart.style.position = 'fixed';
    cart.style.top = '1rem';
    cart.style.right = '1rem';
    cart.style.left = 'auto';
  }
}

document.addEventListener('DOMContentLoaded', positionFloatingCart);
window.addEventListener('load', positionFloatingCart);
window.addEventListener('resize', positionFloatingCart);
window.addEventListener('scroll', positionFloatingCart);

function openAboutModal(event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function openReturnsModal(event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('returns-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeReturnsModal() {
  const modal = document.getElementById('returns-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function openTosModal(event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('tos-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeTosModal() {
  const modal = document.getElementById('tos-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}
