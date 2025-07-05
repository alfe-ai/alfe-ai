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
    // Fix line break "sust\nainable" or "sust<br>ainable" -> "sustainable"
    // Match any whitespace or HTML tags between "sust" and "ainable"
    desc.innerHTML = desc.innerHTML.replace(/sust(?:\s|<[^>]+>)*ainable/gi, 'sustainable');
  }
});

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
