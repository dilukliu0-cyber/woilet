import { writeFileSync } from 'node:fs';

const W = 1370;
const H = 2020;
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>Woilet — mobile design</title><rect width="${W}" height="${H}" fill="#fff"/>`];
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const rect = (x, y, w, h, radius = 0, fill = '#fff', stroke = '#000', sw = 1) =>
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
const line = (x1, y1, x2, y2, sw = 1) =>
  parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${sw}"/>`);
const text = (x, y, value, size = 16, weight = 400, anchor = 'start', fill = '#000') =>
  parts.push(`<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${escape(value)}</text>`);
const circle = (cx, cy, radius, fill = '#fff', sw = 1) =>
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="#000" stroke-width="${sw}"/>`);
const group = (x, y) => parts.push(`<g transform="translate(${x} ${y})">`);
const end = () => parts.push('</g>');

text(50, 68, 'WOILET', 42, 800);
text(50, 98, 'Мобильная дизайн-система · чёрный / белый · демонстрационные данные', 16, 400);
line(50, 119, 1320, 119, 2);

function phone(x, y, caption, header = 'Expenses') {
  text(x, y - 18, caption, 17, 700);
  group(x, y);
  rect(0, 0, 390, 844, 34, '#fff', '#000', 2);
  text(27, 33, '9:41', 12, 700);
  line(320, 26, 330, 26, 2);
  line(336, 23, 336, 29, 2);
  rect(345, 21, 22, 10, 3, '#fff', '#000', 1);
  text(24, 91, header, 27, 800);
  circle(344, 78, 21, '#fff', 2);
  text(344, 84, 'W', 18, 800, 'middle');
}

function card(y = 124, h = 485) {
  rect(20, y, 350, h, 24, '#fff', '#000', 2);
}

function nav(top, active = 'month') {
  rect(40, top, 34, 34, 10, active === 'wallet' ? '#000' : '#fff', '#000', 1.5);
  text(57, top + 24, '▣', 21, 700, 'middle', active === 'wallet' ? '#fff' : '#000');
  rect(316, top, 34, 34, 10, active === 'calendar' ? '#000' : '#fff', '#000', 1.5);
  text(333, top + 24, '▦', 21, 700, 'middle', active === 'calendar' ? '#fff' : '#000');
}

function barRow(y, label, amount, width) {
  text(45, y, label, 16, 400);
  text(345, y, amount, 16, 600, 'end');
  rect(45, y + 9, width, 4, 0, '#000', '#000', 0);
}

function plus() {
  circle(339, 779, 28, '#000', 0);
  text(339, 790, '+', 31, 300, 'middle', '#fff');
}

phone(50, 175, '01  /  Обзор расходов');
card();
nav(143);
text(195, 202, '3 450 CZK', 33, 800, 'middle');
text(195, 225, 'Всего за месяц', 13, 400, 'middle');
barRow(272, 'Одежда', '1 239 CZK', 292);
barRow(326, 'Продукты', '1 210 CZK', 286);
barRow(380, 'Дом', '280 CZK', 70);
barRow(434, 'Гигиена', '280 CZK', 70);
barRow(488, 'Напитки', '265 CZK', 67);
line(43, 552, 347, 552, 1);
text(47, 582, '◈   Лимиты и бюджет', 16, 600);
text(345, 582, '›', 25, 400, 'end');
text(24, 654, 'Чеки', 20, 700);
rect(22, 675, 346, 58, 18, '#fff', '#000', 2);
text(42, 710, 'Сентябрь 2026', 15, 700);
text(346, 710, '3 259 CZK', 14, 600, 'end');
text(26, 764, '24 сентября', 14, 700);
text(350, 764, '209 CZK', 12, 400, 'end');
plus();
end();

phone(490, 175, '02  /  Неделя');
card();
nav(143);
text(45, 216, 'Расходы за неделю', 17, 700);
text(343, 216, '21–27 сен', 11, 400, 'end');
text(45, 274, '2 490 CZK', 38, 800);
const axisTop = 310, axisHeight = 180;
for (let i = 0; i <= 4; i++) {
  const gy = axisTop + i * axisHeight / 4;
  line(46, gy, 325, gy, 1);
  text(337, gy + 4, String(1000 - i * 250), 10, 400);
}
const heights = [76, 0, 140, 47, 25, 0, 160];
const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
for (let i = 0; i < 7; i++) {
  const bx = 58 + i * 39;
  if (heights[i]) rect(bx, axisTop + axisHeight - heights[i], 23, heights[i], 9, '#000', '#000', 0);
  text(bx + 12, 513, labels[i], 12, 400, 'middle');
}
line(43, 548, 347, 548);
text(47, 581, '◈   Лимиты и бюджет', 16, 600);
text(345, 581, '›', 25, 400, 'end');
text(24, 654, 'Чеки', 20, 700);
rect(22, 675, 346, 58, 18, '#fff', '#000', 2);
text(42, 710, 'Сентябрь 2026', 15, 700);
text(346, 710, '3 259 CZK', 14, 600, 'end');
plus();
end();

phone(930, 175, '03  /  Календарь');
card();
nav(143, 'calendar');
text(195, 170, 'Сентябрь 2026', 18, 700, 'middle');
text(195, 225, 'Всего', 13, 400, 'middle');
text(195, 264, '3 259 CZK', 31, 800, 'middle');
for (let i = 0; i < 7; i++) text(55 + i * 47, 311, labels[i], 12, 400, 'middle');
line(42, 326, 348, 326);
const highlighted = new Map([[5,'1920'],[10,'218'],[11,'64'],[18,'97'],[19,'346'],[20,'87'],[21,'102'],[22,'110'],[23,'105'],[24,'209']]);
for (let day = 1; day <= 30; day++) {
  const position = day;
  const col = position % 7, row = Math.floor(position / 7);
  const dx = 31 + col * 47, dy = 341 + row * 48;
  if (highlighted.has(day)) {
    rect(dx, dy, 43, 43, 8, '#000', '#000', 0);
    text(dx + 21, dy + 18, day, 13, 700, 'middle', '#fff');
    text(dx + 21, dy + 33, highlighted.get(day), 8, 600, 'middle', '#fff');
  } else {
    text(dx + 21, dy + 27, day, 13, 400, 'middle');
  }
}
text(24, 654, 'Чеки', 20, 700);
rect(22, 675, 346, 58, 18, '#fff', '#000', 2);
text(42, 710, 'Сентябрь 2026', 15, 700);
text(346, 710, '3 259 CZK', 14, 600, 'end');
plus();
end();

phone(50, 1120, '04  /  Кошелёк');
card();
nav(143, 'wallet');
text(195, 170, 'Кошелёк', 18, 700, 'middle');
text(195, 318, 'Баланс кошелька', 14, 400, 'middle');
text(195, 364, '7 823 CZK', 36, 800, 'middle');
line(42, 421, 348, 421);
text(45, 448, 'Пополнения', 14, 400);
text(346, 448, '+17 162 CZK', 15, 700, 'end');
text(24, 654, 'Пополнения', 20, 700);
rect(22, 675, 346, 56, 17, '#fff', '#000', 2);
text(41, 710, 'Сентябрь 2026', 15, 700);
text(346, 710, '12 000 CZK', 14, 600, 'end');
text(44, 768, '⊕', 22, 500);
text(79, 759, 'Пополнение', 15, 700);
text(79, 777, '24 сентября', 12, 400);
text(346, 768, '+2 000 CZK', 15, 700, 'end');
plus();
end();

phone(490, 1120, '05  /  Добавление расхода', 'Добавить расход');
rect(24, 129, 342, 137, 22, '#fff', '#000', 2);
text(47, 161, 'Сумма', 14, 600);
text(47, 223, '280', 52, 800);
text(338, 221, 'CZK', 18, 700, 'end');
text(25, 316, 'Название', 15, 600);
rect(24, 333, 342, 58, 16, '#fff', '#000', 2);
text(43, 369, 'Покупка для дома', 17, 400);
rect(24, 415, 342, 75, 16, '#fff', '#000', 2);
text(46, 443, 'Когда', 12, 400);
text(46, 469, 'Сегодня, 28 сентября', 17, 700);
text(345, 465, '›', 28, 400, 'end');
rect(24, 507, 342, 75, 16, '#fff', '#000', 2);
text(46, 535, 'Категория', 12, 400);
text(46, 561, 'Дом', 17, 700);
text(345, 557, '›', 28, 400, 'end');
rect(24, 614, 342, 56, 16, '#000', '#000', 0);
text(195, 649, 'Сохранить', 17, 700, 'middle', '#fff');
end();

phone(930, 1120, '06  /  Настройки', 'Настройки');
text(25, 144, 'Аккаунт', 13, 700);
rect(22, 162, 346, 90, 18, '#fff', '#000', 2);
circle(62, 206, 24, '#fff', 2);
text(62, 212, 'W', 18, 700, 'middle');
text(101, 204, 'Мой профиль', 18, 700);
text(101, 225, 'Персональные данные', 12, 400);
text(25, 292, 'Предпочтения', 13, 700);
rect(22, 309, 346, 220, 18, '#fff', '#000', 2);
text(43, 349, 'Язык', 16, 600);
text(345, 349, 'Русский  ›', 15, 400, 'end');
line(43, 372, 347, 372);
text(43, 410, 'Валюта', 16, 600);
text(345, 410, 'CZK  ›', 15, 400, 'end');
line(43, 433, 347, 433);
text(43, 471, 'Тема', 16, 600);
text(345, 471, 'Светлая  ›', 15, 400, 'end');
text(25, 571, 'Управление', 13, 700);
rect(22, 588, 346, 112, 18, '#fff', '#000', 2);
text(43, 631, 'Категории', 16, 600);
text(345, 631, '›', 24, 400, 'end');
line(43, 647, 347, 647);
text(43, 681, 'Семейный аккаунт', 16, 600);
text(345, 681, '›', 24, 400, 'end');
end();

text(50, 1998, 'WOILET  /  UI CONCEPT  ·  390 × 844  ·  SVG layers', 13, 600);
parts.push('</svg>');
writeFileSync(new URL('./woilet-figma-board.svg', import.meta.url), parts.join('\n'), 'utf8');
