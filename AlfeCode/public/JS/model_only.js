(function(){
  // ... [existing code up to createUsageBadge function] ...

  function createUsageBadge(usage) {
    const badge = resolveUsageBadge(usage);
    if (!badge) return null;
    const normalizedUsage = (usage || '').toString().trim().toLowerCase();
    const label = normalizedUsage === 'free' ? 'Free usage' : badge.label
      .split(' ')
      .filter(Boolean)
      .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(' ');
    const badgeEl = document.createElement('span');
    badgeEl.className = `usage-badge ${badge.className}`;
    badgeEl.textContent = `${label} usage`;
    return badgeEl;
  }

  // ... [rest of the code remains unchanged] ...
})();