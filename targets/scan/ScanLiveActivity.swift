import ActivityKit
import SwiftUI
import WidgetKit

// Live Activity распознавания чека: Dynamic Island во всех трёх состояниях
// плюс карточка на экране блокировки.
//
// Текст сюда приходит уже переведённым (см. ScanActivityAttributes) — здесь
// решается только внешний вид.

@main
struct ScanActivityBundle: WidgetBundle {
  var body: some Widget {
    ScanLiveActivity()
    BudgetWidget()
    ScanWidget()
    WeekWidget()
  }
}

// MARK: - Состояние

private enum ScanStatus {
  case processing
  case done
  case error

  init(_ raw: String) {
    switch raw {
    case "done": self = .done
    case "error": self = .error
    default: self = .processing
    }
  }

  var symbol: String {
    switch self {
    case .processing: return "doc.text.viewfinder"
    case .done: return "checkmark.circle.fill"
    case .error: return "exclamationmark.triangle.fill"
    }
  }

  var tint: Color {
    switch self {
    // Не фирменный #2E8659: на чёрном фоне островка он почти не читается,
    // поэтому берём его же, но светлее.
    case .processing, .done: return Color(red: 0.31, green: 0.75, blue: 0.52)
    case .error: return Color(red: 0.95, green: 0.55, blue: 0.35)
    }
  }

  var isProcessing: Bool {
    if case .processing = self { return true }
    return false
  }
}

private typealias ScanState = ScanActivityAttributes.ContentState

/// Диапазон для ProgressView(timerInterval:). Пустой или перевёрнутый
/// диапазон роняет приложение, а сюда приходят числа из JS — поэтому конец
/// принудительно держим позже начала.
private func progressRange(_ state: ScanState) -> ClosedRange<Date> {
  let start = Date(timeIntervalSince1970: state.startedAt)
  let end = Date(timeIntervalSince1970: max(state.estimatedEndAt, state.startedAt + 1))
  return start...end
}

// MARK: - Виджет

struct ScanLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ScanActivityAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.6))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let status = ScanStatus(context.state.status)

      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          IconBadge(status: status)
            .padding(.leading, 4)
        }

        DynamicIslandExpandedRegion(.trailing) {
          if !context.state.amount.isEmpty {
            Text(context.state.amount)
              .font(.title3.weight(.semibold))
              .monospacedDigit()
              .foregroundStyle(status.tint)
              .padding(.trailing, 4)
          }
        }

        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.title)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.white)
              .lineLimit(1)

            if !context.state.subtitle.isEmpty {
              Text(context.state.subtitle)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.65))
                .lineLimit(1)
            }

            if status.isProcessing {
              ProgressView(timerInterval: progressRange(context.state), countsDown: false) {
                EmptyView()
              } currentValueLabel: {
                EmptyView()
              }
              .progressViewStyle(.linear)
              .tint(status.tint)
              .padding(.top, 2)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } compactLeading: {
        Image(systemName: status.symbol)
          .foregroundStyle(status.tint)
      } compactTrailing: {
        if status.isProcessing {
          // Кольцо заполняется само по таймеру: в виджетах бесконечный
          // ProgressView не анимируется, а этот — штатный способ показать,
          // что процесс идёт, без обновлений активности.
          ProgressView(timerInterval: progressRange(context.state), countsDown: false) {
            EmptyView()
          } currentValueLabel: {
            EmptyView()
          }
          .progressViewStyle(.circular)
          .tint(status.tint)
        } else if !context.state.amount.isEmpty {
          Text(context.state.amount)
            .font(.caption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(status.tint)
        }
      } minimal: {
        Image(systemName: status.symbol)
          .foregroundStyle(status.tint)
      }
      .keylineTint(status.tint)
    }
  }
}

// MARK: - Части интерфейса

private struct IconBadge: View {
  let status: ScanStatus

  var body: some View {
    Image(systemName: status.symbol)
      .font(.system(size: 18, weight: .medium))
      .foregroundStyle(status.tint)
      .frame(width: 36, height: 36)
      .background(status.tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct LockScreenView: View {
  let state: ScanState

  var body: some View {
    let status = ScanStatus(state.status)

    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 12) {
        IconBadge(status: status)

        VStack(alignment: .leading, spacing: 2) {
          Text(state.title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)

          if !state.subtitle.isEmpty {
            Text(state.subtitle)
              .font(.caption)
              .foregroundStyle(.white.opacity(0.65))
              .lineLimit(1)
          }
        }

        Spacer(minLength: 8)

        if !state.amount.isEmpty {
          Text(state.amount)
            .font(.title3.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(status.tint)
        }
      }

      if status.isProcessing {
        ProgressView(timerInterval: progressRange(state), countsDown: false) {
          EmptyView()
        } currentValueLabel: {
          EmptyView()
        }
        .progressViewStyle(.linear)
        .tint(status.tint)
      }
    }
    .padding(16)
  }
}
