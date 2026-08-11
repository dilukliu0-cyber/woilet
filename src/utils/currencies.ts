// Мировые валюты (ISO 4217): код, символ, название на русском.
// Название используется только как запасное — см. currencyName() внизу файла.
// Курсы для любой из них отдаёт open.er-api.com, поэтому список ограничен
// только здравым смыслом, а не бэкендом.

export type Currency = { code: string; symbol: string; name: string };

export const CURRENCIES: Currency[] = [
  { code: 'CZK', symbol: 'Kč', name: 'Чешская крона' },
  { code: 'EUR', symbol: '€', name: 'Евро' },
  { code: 'USD', symbol: '$', name: 'Доллар США' },
  { code: 'GBP', symbol: '£', name: 'Фунт стерлингов' },
  { code: 'UAH', symbol: '₴', name: 'Украинская гривна' },
  { code: 'BYN', symbol: 'Br', name: 'Белорусский рубль' },
  { code: 'RUB', symbol: '₽', name: 'Российский рубль' },
  { code: 'PLN', symbol: 'zł', name: 'Польский злотый' },
  { code: 'JPY', symbol: '¥', name: 'Японская иена' },
  { code: 'CNY', symbol: '¥', name: 'Китайский юань' },
  { code: 'KRW', symbol: '₩', name: 'Южнокорейская вона' },
  { code: 'INR', symbol: '₹', name: 'Индийская рупия' },
  { code: 'TRY', symbol: '₺', name: 'Турецкая лира' },
  { code: 'KZT', symbol: '₸', name: 'Казахстанский тенге' },
  { code: 'GEL', symbol: '₾', name: 'Грузинский лари' },
  { code: 'AMD', symbol: '֏', name: 'Армянский драм' },
  { code: 'AZN', symbol: '₼', name: 'Азербайджанский манат' },
  { code: 'MDL', symbol: 'L', name: 'Молдавский лей' },
  { code: 'RON', symbol: 'lei', name: 'Румынский лей' },
  { code: 'BGN', symbol: 'лв', name: 'Болгарский лев' },
  { code: 'HUF', symbol: 'Ft', name: 'Венгерский форинт' },
  { code: 'SEK', symbol: 'kr', name: 'Шведская крона' },
  { code: 'NOK', symbol: 'kr', name: 'Норвежская крона' },
  { code: 'DKK', symbol: 'kr', name: 'Датская крона' },
  { code: 'ISK', symbol: 'kr', name: 'Исландская крона' },
  { code: 'CHF', symbol: 'Fr', name: 'Швейцарский франк' },
  { code: 'CAD', symbol: 'C$', name: 'Канадский доллар' },
  { code: 'AUD', symbol: 'A$', name: 'Австралийский доллар' },
  { code: 'NZD', symbol: 'NZ$', name: 'Новозеландский доллар' },
  { code: 'BRL', symbol: 'R$', name: 'Бразильский реал' },
  { code: 'MXN', symbol: 'MX$', name: 'Мексиканское песо' },
  { code: 'ARS', symbol: 'AR$', name: 'Аргентинское песо' },
  { code: 'CLP', symbol: 'CL$', name: 'Чилийское песо' },
  { code: 'COP', symbol: 'CO$', name: 'Колумбийское песо' },
  { code: 'PEN', symbol: 'S/', name: 'Перуанский соль' },
  { code: 'ZAR', symbol: 'R', name: 'Южноафриканский рэнд' },
  { code: 'EGP', symbol: 'E£', name: 'Египетский фунт' },
  { code: 'AED', symbol: 'د.إ', name: 'Дирхам ОАЭ' },
  { code: 'SAR', symbol: '﷼', name: 'Саудовский риял' },
  { code: 'QAR', symbol: '﷼', name: 'Катарский риал' },
  { code: 'ILS', symbol: '₪', name: 'Израильский шекель' },
  { code: 'THB', symbol: '฿', name: 'Тайский бат' },
  { code: 'VND', symbol: '₫', name: 'Вьетнамский донг' },
  { code: 'IDR', symbol: 'Rp', name: 'Индонезийская рупия' },
  { code: 'MYR', symbol: 'RM', name: 'Малайзийский ринггит' },
  { code: 'SGD', symbol: 'S$', name: 'Сингапурский доллар' },
  { code: 'PHP', symbol: '₱', name: 'Филиппинское песо' },
  { code: 'HKD', symbol: 'HK$', name: 'Гонконгский доллар' },
  { code: 'TWD', symbol: 'NT$', name: 'Тайваньский доллар' },
  { code: 'RSD', symbol: 'дин', name: 'Сербский динар' },
  { code: 'MKD', symbol: 'ден', name: 'Македонский денар' },
  { code: 'BAM', symbol: 'КМ', name: 'Боснийская марка' },
  { code: 'ALL', symbol: 'L', name: 'Албанский лек' },
  { code: 'UZS', symbol: 'сум', name: 'Узбекский сум' },
  { code: 'KGS', symbol: 'с', name: 'Киргизский сом' },
  { code: 'TJS', symbol: 'SM', name: 'Таджикский сомони' },
  { code: 'TMT', symbol: 'm', name: 'Туркменский манат' },
  { code: 'MNT', symbol: '₮', name: 'Монгольский тугрик' },
  { code: 'NGN', symbol: '₦', name: 'Нигерийская найра' },
  { code: 'KES', symbol: 'KSh', name: 'Кенийский шиллинг' },
  { code: 'GHS', symbol: '₵', name: 'Ганский седи' },
  { code: 'MAD', symbol: 'د.م.', name: 'Марокканский дирхам' },
  { code: 'TND', symbol: 'د.ت', name: 'Тунисский динар' },
  { code: 'DZD', symbol: 'د.ج', name: 'Алжирский динар' },
  { code: 'PKR', symbol: '₨', name: 'Пакистанская рупия' },
  { code: 'BDT', symbol: '৳', name: 'Бангладешская така' },
  { code: 'LKR', symbol: 'Rs', name: 'Шри-ланкийская рупия' },
  { code: 'NPR', symbol: 'Rs', name: 'Непальская рупия' },
  { code: 'MMK', symbol: 'K', name: 'Мьянманский кьят' },
  { code: 'KHR', symbol: '៛', name: 'Камбоджийский риель' },
  { code: 'LAK', symbol: '₭', name: 'Лаосский кип' },
];

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/**
 * Локализованное название валюты. Раньше в списке всегда стояли русские
 * названия, и в английском интерфейсе «Чешская крона» соседствовала с
 * «Main currency».
 *
 * Названия берём у системы через Intl, а не заводим 73 валюты × 3 языка
 * в словарь: столько строк невозможно поддерживать, а Intl знает их для
 * всех локалей сразу. Если API недоступно, откатываемся на встроенное
 * название для русского и на код валюты для остальных языков — показать
 * «CZK» лучше, чем русский текст в английском интерфейсе.
 */
export function currencyName(code: string, intlLocale: string): string {
  try {
    const names = new Intl.DisplayNames([intlLocale], { type: 'currency' });
    const name = names.of(code);
    if (name && name !== code) return name;
  } catch {
    // Intl.DisplayNames нет в этой среде — уходим на запасной вариант.
  }
  if (intlLocale.startsWith('ru')) {
    return CURRENCIES.find((c) => c.code === code)?.name ?? code;
  }
  return FALLBACK_EN[code] ?? code;
}

// Запасные английские названия на случай, если Intl.DisplayNames нет в
// среде (Hermes на устройстве поддерживает не весь Intl). Не все 73 валюты,
// а те, которыми реально пользуются: для остальных код валюты рядом с
// символом читается достаточно.
const FALLBACK_EN: Record<string, string> = {
  CZK: 'Czech koruna',
  EUR: 'Euro',
  USD: 'US dollar',
  GBP: 'Pound sterling',
  UAH: 'Ukrainian hryvnia',
  PLN: 'Polish zloty',
  RUB: 'Russian ruble',
  CHF: 'Swiss franc',
  SEK: 'Swedish krona',
  NOK: 'Norwegian krone',
  DKK: 'Danish krone',
  HUF: 'Hungarian forint',
  RON: 'Romanian leu',
  BGN: 'Bulgarian lev',
  TRY: 'Turkish lira',
  CAD: 'Canadian dollar',
  AUD: 'Australian dollar',
  JPY: 'Japanese yen',
  CNY: 'Chinese yuan',
  INR: 'Indian rupee',
  KZT: 'Kazakhstani tenge',
  GEL: 'Georgian lari',
};
