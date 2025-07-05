(function(){
  document.addEventListener('click', function(e){
    var target = e.target.closest('[data-quick-view]');
    if(!target) return;
    e.preventDefault();
    alert('Quick view: ' + target.getAttribute('data-quick-view'));
  });
})();
