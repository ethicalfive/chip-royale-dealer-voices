// Card face renderer shared by the game and deck.html. Corner index lives in its own column; centre art is inset so it never overlaps the index.
const FACE_ART = { J: '🗡', Q: '👑', K: '♚' };
function cardHTML(c, k = '') {
  if (c.r === '?') return `<div class="card back" data-k="${k}"></div>`;
  const red = '♥♦'.includes(c.s), face = 'JQK'.includes(c.r), ten = c.r === '10';
  const centre = face ? `<span class="art"><b>${c.r}</b><i>${FACE_ART[c.r]}</i></span>` : c.r === 'A' ? `<span class="pip ace">${c.s}</span>` : `<span class="pip">${c.s}</span>`;
  return `<div class="card ${red ? 'red' : ''} ${face ? 'face' : ''}" data-k="${k}"><span class="ix ${ten ? 'ten' : ''}"><b>${c.r}</b><small>${c.s}</small></span>${centre}<span class="ix br ${ten ? 'ten' : ''}"><b>${c.r}</b><small>${c.s}</small></span></div>`;
}
