function getCookie(name){
  const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}
function setCookie(name, value, days=365){
  const expires = new Date(Date.now() + days*864e5).toUTCString();
  let cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  if(location.hostname.endsWith('.alfe.sh')){
    cookie += '; domain=.alfe.sh';
  }
  document.cookie = cookie;
}
function generateUUID(){
  if(window.crypto && typeof window.crypto.randomUUID === 'function'){
    return window.crypto.randomUUID();
  }
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, c => {
    const r = Math.random()*16|0;
    const v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
function getSessionId(){
  let id = getCookie('sessionId') || sessionStorage.getItem('sessionId');
  if(!id) id = generateUUID();
  sessionStorage.setItem('sessionId', id);
  setCookie('sessionId', id);
  return id;
}
const sessionId = getSessionId();
