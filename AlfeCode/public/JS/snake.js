(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('start');
  const pauseBtn = document.getElementById('pause');
  const scoreEl = document.getElementById('score');

  const CELL = 20;
  const COLS = canvas.width / CELL;
  const ROWS = canvas.height / CELL;

  let snake, dir, food, running, score, tick;

  function reset() {
    snake = [{x: Math.floor(COLS/2), y: Math.floor(ROWS/2)}];
    dir = {x:1,y:0};
    placeFood();
    running = false;
    score = 0;
    scoreEl.textContent = 'Score: 0';
    tick = null;
    draw();
  }

  function placeFood(){
    while(true){
      const pos = {x: Math.floor(Math.random()*COLS), y: Math.floor(Math.random()*ROWS)};
      if(!snake.some(s=>s.x===pos.x && s.y===pos.y)){ food = pos; break }
    }
  }

  function step(){
    const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
    // wrap
    head.x = (head.x + COLS) % COLS;
    head.y = (head.y + ROWS) % ROWS;

    // collision with body
    if(snake.some(s=>s.x===head.x && s.y===head.y)){
      stop();
      return;
    }

    snake.unshift(head);
    if(head.x===food.x && head.y===food.y){
      score += 1; scoreEl.textContent = 'Score: '+score; placeFood();
    } else {
      snake.pop();
    }
    draw();
  }

  function draw(){
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // food
    ctx.fillStyle = '#e63946'; ctx.fillRect(food.x*CELL+1, food.y*CELL+1, CELL-2, CELL-2);
    // snake
    ctx.fillStyle = '#2ec4b6';
    for(let i=0;i<snake.length;i++){
      const s = snake[i];
      ctx.fillRect(s.x*CELL+1, s.y*CELL+1, CELL-2, CELL-2);
    }
  }

  function start(){ if(running) return; running=true; tick = setInterval(step, 120); }
  function stop(){ running=false; if(tick) clearInterval(tick); alert('Game over — score: '+score); }
  function pause(){ if(!running) return; running=false; if(tick) clearInterval(tick); }

  window.addEventListener('keydown', e=>{
    const key = e.key;
    if(key==='ArrowUp' && dir.y!==1) dir={x:0,y:-1};
    if(key==='ArrowDown' && dir.y!==-1) dir={x:0,y:1};
    if(key==='ArrowLeft' && dir.x!==1) dir={x:-1,y:0};
    if(key==='ArrowRight' && dir.x!==-1) dir={x:1,y:0};
    if(key===' '){ if(running) pause(); else start(); }
  });

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);

  reset();
})();

