// Theme scripts
function toggleMenu() {
  const menu = document.querySelector('.nav-links');
  if (menu) {
    menu.classList.toggle('active');
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
});
