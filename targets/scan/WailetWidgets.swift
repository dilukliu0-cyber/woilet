import SwiftUI
import WidgetKit

// Виджеты Wailet: траты и бюджет, кнопка скана, неделя, кольцо бюджета на
// экране блокировки.
//
// Данные кладёт приложение (src/services/widgets/widgetSnapshot.ts) в общее
// хранилище App Group — сам виджет в базу не ходит. Имя группы и ключ должны
// совпадать с JS. Строки приходят уже переведёнными.

private let appGroup = "group.com.dilukliu0.wailet"
private let snapshotKey = "snapshot"

struct WidgetSnapshot: Codable {
  struct Labels: Codable {
    var spent: String
    var budgetPercent: String
    var noBudget: String
    var week: String
    var wallet: String
    var today: String
    var scan: String
    var empty: String
    // Новые поля — необязательные: старая сводка без них должна читаться.
    var walletLeft: String?
    var perDay: String?
    var until: String?
  }

  var currency: String
  var monthLabel: String
  var monthSpent: Double
  var budget: Double
  var todaySpent: Double
  var weekTotal: Double
  var week: [Double]
  var weekLabels: [String]
  var wallet: Double
  var labels: Labels
  var updatedAt: Double

  static func load() -> WidgetSnapshot? {
    guard
      let raw = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  /// Доля бюджета 0…1, nil — бюджет не задан.
  var budgetFraction: Double? {
    budget > 0 ? min(monthSpent / budget, 1) : nil
  }

  var budgetPercentText: String {
    guard budget > 0 else { return labels.noBudget }
    let percent = Int((monthSpent / budget * 100).rounded())
    return labels.budgetPercent.replacingOccurrences(of: "{percent}", with: "\(percent)")
  }
}

/// «3 259» — пробел между разрядами, без копеек: на виджете места мало.
private func amount(_ value: Double) -> String {
  let formatter = NumberFormatter()
  formatter.numberStyle = .decimal
  formatter.groupingSeparator = " "
  formatter.maximumFractionDigits = 0
  return formatter.string(from: NSNumber(value: value)) ?? "\(Int(value))"
}

// MARK: - Таймлайн

struct SnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct SnapshotProvider: TimelineProvider {
  func placeholder(in context: Context) -> SnapshotEntry {
    SnapshotEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
    completion(SnapshotEntry(date: Date(), snapshot: WidgetSnapshot.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
    // Новые цифры появляются, только когда приложение их запишет — тогда оно
    // само просит перерисовку. Час — запасной интервал: например, чтобы в
    // полночь «сегодня» не застряло на вчерашнем.
    let entry = SnapshotEntry(date: Date(), snapshot: WidgetSnapshot.load())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600))))
  }
}

// MARK: - Фон виджета

private extension View {
  /// С iOS 17 фон обязан задаваться через containerBackground, иначе система
  /// показывает заглушку «Adopt containerBackground API». Ниже — обычный фон.
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

// MARK: - Траты и бюджет (маленький + кольцо на экране блокировки)

struct BudgetWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: SnapshotEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      circular
    default:
      small
    }
  }

  private var small: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(entry.snapshot?.monthLabel ?? "Wailet")
        .font(.caption)
        .foregroundStyle(.black.opacity(0.55))
      Text(amount(entry.snapshot?.monthSpent ?? 0))
        .font(.system(size: 30, weight: .bold))
        .minimumScaleFactor(0.6)
        .lineLimit(1)
        .foregroundStyle(.black)
      Text("\(entry.snapshot?.currency ?? "") \(entry.snapshot?.labels.spent ?? "")")
        .font(.caption2)
        .foregroundStyle(.black.opacity(0.55))
      Spacer(minLength: 0)
      if let snapshot = entry.snapshot {
        if let fraction = snapshot.budgetFraction {
          GeometryReader { geo in
            ZStack(alignment: .leading) {
              Capsule().fill(Color.black.opacity(0.12))
              Capsule().fill(Color.black).frame(width: geo.size.width * fraction)
            }
          }
          .frame(height: 5)
        }
        Text(snapshot.budgetPercentText)
          .font(.caption2)
          .foregroundStyle(.black.opacity(0.55))
          .padding(.top, 4)
      } else {
        Text("—").font(.caption2).foregroundStyle(.black.opacity(0.55))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetBackground(.white)
  }

  private var circular: some View {
    let fraction = entry.snapshot?.budgetFraction ?? 0
    return Gauge(value: fraction) {
      EmptyView()
    } currentValueLabel: {
      Text(entry.snapshot?.budgetFraction == nil ? "—" : "\(Int((fraction * 100).rounded()))%")
        .font(.system(size: 14, weight: .semibold))
    }
    .gaugeStyle(.accessoryCircularCapacity)
    .widgetBackground(.clear)
  }
}

struct BudgetWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WailetBudget", provider: SnapshotProvider()) { entry in
      BudgetWidgetView(entry: entry)
        .widgetURL(URL(string: "wailet://"))
    }
    .configurationDisplayName("Wailet")
    .description("Monthly spending and budget")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

// MARK: - Кнопка скана

struct ScanWidgetView: View {
  let entry: SnapshotEntry

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: "viewfinder")
        .font(.system(size: 40, weight: .light))
      Text(entry.snapshot?.labels.scan ?? "Scan")
        .font(.system(size: 15, weight: .semibold))
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetBackground(.black)
  }
}

struct ScanWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WailetScan", provider: SnapshotProvider()) { entry in
      // Та же ссылка, что у касания задней панели: открывает сразу камеру.
      ScanWidgetView(entry: entry)
        .widgetURL(URL(string: "wailet://scan"))
    }
    .configurationDisplayName("Wailet Scan")
    .description("One tap to scan a receipt")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - Кошелёк

struct WalletWidgetView: View {
  let entry: SnapshotEntry

  /// Остаток делим на дни до конца месяца, включая сегодня.
  private var daysLeft: Int {
    let cal = Calendar.current
    let now = Date()
    let range = cal.range(of: .day, in: .month, for: now)?.count ?? 30
    return max(range - cal.component(.day, from: now) + 1, 1)
  }

  var body: some View {
    let s = entry.snapshot
    let wallet = s?.wallet ?? 0
    let perDay = max(wallet, 0) / Double(daysLeft)
    VStack(alignment: .leading, spacing: 2) {
      Text(s?.labels.wallet ?? "Wallet")
        .font(.caption)
        .foregroundStyle(.black.opacity(0.55))
      Text(amount(wallet))
        .font(.system(size: 30, weight: .bold))
        .minimumScaleFactor(0.6)
        .lineLimit(1)
      Text("\(s?.currency ?? "") \(s?.labels.walletLeft ?? "")")
        .font(.caption2)
        .foregroundStyle(.black.opacity(0.55))
      Spacer(minLength: 0)
      if let s {
        Text((s.labels.perDay ?? "≈ {amount}").replacingOccurrences(of: "{amount}", with: "\(amount(perDay)) \(s.currency)"))
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Text(s.labels.until ?? "")
          .font(.caption2)
          .foregroundStyle(.black.opacity(0.55))
      }
    }
    .foregroundStyle(.black)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetBackground(.white)
  }
}

struct WalletWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WailetWallet", provider: SnapshotProvider()) { entry in
      WalletWidgetView(entry: entry)
        .widgetURL(URL(string: "wailet://"))
    }
    .configurationDisplayName("Wailet Wallet")
    .description("Wallet balance and daily allowance")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - Неделя

struct WeekWidgetView: View {
  let entry: SnapshotEntry

  var body: some View {
    let snapshot = entry.snapshot
    let week = snapshot?.week ?? Array(repeating: 0, count: 7)
    let maxValue = max(week.max() ?? 0, 1)
    let todayIndex = (Calendar.current.component(.weekday, from: Date()) + 5) % 7

    return HStack(alignment: .bottom, spacing: 16) {
      VStack(alignment: .leading, spacing: 2) {
        Text(snapshot?.labels.week ?? "")
          .font(.caption)
          .foregroundStyle(.black.opacity(0.55))
        Text(amount(snapshot?.weekTotal ?? 0))
          .font(.system(size: 28, weight: .bold))
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        Text(snapshot?.currency ?? "")
          .font(.caption2)
          .foregroundStyle(.black.opacity(0.55))
        Spacer(minLength: 0)
        if let snapshot {
          Text("\(snapshot.labels.wallet) \(amount(snapshot.wallet))")
            .font(.caption)
            .lineLimit(1)
        }
      }
      .frame(width: 112, alignment: .leading)

      VStack(spacing: 4) {
        HStack(alignment: .bottom, spacing: 5) {
          ForEach(0..<7, id: \.self) { i in
            RoundedRectangle(cornerRadius: 2)
              // Будущие дни недели — бледные: тратить в них ещё нечего.
              .fill(Color.black.opacity(i > todayIndex ? 0.15 : 1))
              .frame(height: max(CGFloat(week[i] / maxValue) * 78, 3))
              .frame(maxWidth: .infinity)
          }
        }
        .frame(height: 78, alignment: .bottom)
        HStack(spacing: 5) {
          ForEach(0..<7, id: \.self) { i in
            Text(i < (snapshot?.weekLabels.count ?? 0) ? snapshot!.weekLabels[i] : "")
              .font(.system(size: 9))
              .foregroundStyle(.black.opacity(0.55))
              .frame(maxWidth: .infinity)
          }
        }
      }
    }
    .foregroundStyle(.black)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetBackground(.white)
  }
}

struct WeekWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WailetWeek", provider: SnapshotProvider()) { entry in
      WeekWidgetView(entry: entry)
        .widgetURL(URL(string: "wailet://"))
    }
    .configurationDisplayName("Wailet Week")
    .description("Spending by day this week")
    .supportedFamilies([.systemMedium])
  }
}
