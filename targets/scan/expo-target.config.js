/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'ScanActivity',
  // Ведущая точка = «дописать к bundle id приложения». Apple требует, чтобы
  // расширение лежало внутри пространства имён основного приложения, а
  // умолчание плагина собирается из имени проекта и может с ним разойтись.
  bundleIdentifier: '.scanactivity',
  displayName: 'Wailet',
  // Dynamic Island появился в iOS 16.1, но ActivityContent/ActivityConfiguration
  // в нынешнем виде — с 16.2. Ниже опускаться незачем: устройства с островком
  // (iPhone 14 Pro и новее) давно на 17+. Умолчание плагина — 18.0, оно
  // отрезало бы часть таких телефонов без всякой пользы.
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
