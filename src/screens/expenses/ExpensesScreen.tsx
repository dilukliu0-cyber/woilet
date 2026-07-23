import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  LayoutGrid,
  LogOut,
  PenLine,
  PlusCircle,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DonutChart, type DonutSegment } from '../../components/charts/DonutChart';
import { ReceiptListItem } from '../../components/cards/ReceiptListItem';
import { ReceiptQuickActions } from '../../components/modals/ReceiptQuickActions';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { FadeInView } from '../../components/ui/FadeInView';
import { ProfileMenuButton } from '../../components/ui/ProfileMenuButton';
import { ScreenPlaceholder } from '../../components/ui/ScreenPlaceholder';
import { Skeleton } from '../../components/ui/Skeleton';
import { SpeedDialFab } from '../../components/ui/SpeedDialFab';
import { SwipeToDeleteRow } from '../../components/ui/SwipeToDeleteRow';
import { useT } from '../../i18n/useT';
import { INTL_LOCALE, translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { checkAiDigest } from '../../services/ai/aiDigest';
import {
  fetchMonthlyCategoryBreakdown,
  type CategoryBreakdownEntry,
} from '../../services/analytics/categoryBreakdown';
import { getQueue, removeFromQueue, type QueuedScan } from '../../services/offlineQueue/offlineQueue';
import { avatarUrl } from '../../services/profile/avatarService';
import { rescanReceipt, submitScan } from '../../services/receipts/backgroundScan';
import { deleteReceipt } from '../../services/receipts/receiptsService';
import { deleteIncome, fetchIncomes, fetchWalletBalance } from '../../services/wallet/walletService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useLimitsStore } from '../../store/limitsStore';
import { useLocaleStore } from '../../store/localeStore';
import { useReceiptsStore } from '../../store/receiptsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import { colors, getCategoryColor } from '../../theme/colors';
import type { IncomeRecord } from '../../types/income';
import type { ReceiptRecord } from '../../types/receiptRecord';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type FeedEntry =
  | { kind: 'receipt'; id: string; sortDate: string; receipt: ReceiptRecord }
  | { kind: 'income'; id: string; sortDate: string; income: IncomeRecord };

// 1 января 2024 — понедельник: удобная опорная неделя, чтобы получить
// названия дней через Intl вместо жёсткого списка на одном языке.
function weekdayLabels(intlLocale: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i);
    return new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(d).replace('.', '');
  });
}

function monthLabels(intlLocale: string): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(intlLocale, { month: 'long' }).format(new Date(2024, i, 1)),
  );
}

export function ExpensesScreen() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const intlLocale = INTL_LOCALE[locale];
  const WEEKDAYS = weekdayLabels(intlLocale);
  const MONTH_NAMES = monthLabels(intlLocale);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const userId = useAuthStore((state) => state.session?.user.id);
  const signOut = useAuthStore((state) => state.signOut);
  const receipts = useReceiptsStore((state) => state.receipts);
  const ownerProfiles = useReceiptsStore((state) => state.ownerProfiles);
  const isLoading = useReceiptsStore((state) => state.isLoading);
  const fetchReceipts = useReceiptsStore((state) => state.fetch);
  const settings = useSettingsStore((state) => state.settings);
  const showToast = useToastStore((state) => state.show);
  const limits = useLimitsStore((state) => state.limits);
  const fetchLimits = useLimitsStore((state) => state.fetch);

  const [quickActionsReceipt, setQuickActionsReceipt] = useState<ReceiptRecord | null>(null);
  const [pendingScans, setPendingScans] = useState<QueuedScan[]>([]);
  const [queueVisible, setQueueVisible] = useState(false);
  const [sendingQueueId, setSendingQueueId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdownEntry[]>([]);
  const [categoryCurrency, setCategoryCurrency] = useState('');
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  // Кошелёк: баланс = доходы − расходы, вводится вручную с Главной.
  const [walletBalance, setWalletBalance] = useState<{
    balance: number;
    totalIncome: number;
    totalExpense: number;
    currency: string;
  } | null>(null);
  const [incomes, setIncomes] = useState<IncomeRecord[]>([]);

  // 3D-переворот карточки: спереди диаграмма, сзади календарь (поворот вправо)
  // или кошелёк (поворот влево).
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [openFace, setOpenFace] = useState<'calendar' | 'wallet' | null>(null);
  const [backContent, setBackContent] = useState<'calendar' | 'wallet'>('calendar');
  const walletMode = openFace === 'wallet';
  // Задняя сторона (position:absolute, inset:0) стягивается под высоту
  // контейнера, а её задаёт передняя (диаграмма+легенда) — если её
  // фактическая высота отличается от календаря/кошелька, флип «дёргается»
  // и низ задней стороны может обрезаться. Меряем переднюю и фиксируем
  // этой же высотой весь контейнер, чтобы все три грани были одного размера.
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  // Мини-календарь сразу «полный» — переключение месяцев прямо тут, без
  // перехода на отдельный экран.
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  // Тап по дню с расходами — фильтрует список чеков ниже этим днём.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  function shiftCalMonth(delta: number) {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setSelectedDay(null);
  }

  function loadCategories() {
    if (!userId) return;
    // Диаграмма должна совпадать со списком чеков ниже: без фильтра — вместе
    // с семьёй, с «только я» — как и список, только свои.
    fetchMonthlyCategoryBreakdown(userId, new Date(), !showOnlyMine).then(({ entries, currency }) => {
      setCategories(entries);
      setCategoryCurrency(currency);
    });
  }

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchReceipts(userId);
        fetchLimits(userId);
        loadCategories();
        if (walletMode) loadWallet();
        // Главный экран теперь этот — проактивный ИИ-разбор трат
        // проверяется отсюда (сама функция решает, пора ли).
        checkAiDigest();
      }
      getQueue().then(setPendingScans);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, fetchReceipts, fetchLimits, walletMode]),
  );

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnlyMine]);

  function rootNav() {
    return navigation.getParent<NativeStackNavigationProp<AppStackParamList>>();
  }

  // Профиль — не вкладка, а «рулетка» из аватарки в шапке.
  function profileMenuActions() {
    return [
      { icon: User, label: t('expenses_menu_profile'), onPress: () => rootNav()?.navigate('Profile') },
      { icon: LayoutGrid, label: t('expenses_menu_categories'), onPress: () => rootNav()?.navigate('Categories') },
      { icon: Users, label: t('expenses_menu_family'), onPress: () => rootNav()?.navigate('Family') },
      { icon: LogOut, label: t('expenses_menu_logout'), onPress: () => signOut(), destructive: true },
    ];
  }

  function animateFlip(toValue: number) {
    Animated.spring(flipAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 14,
    }).start();
  }

  function toggleFlip() {
    haptics.light();
    if (openFace === 'calendar') {
      setOpenFace(null);
      animateFlip(0);
      return;
    }
    // Переключение прямо с кошелька на календарь: не анимируем через 0
    // (мимо передней стороны — это и давало «дёрганый» переворот с
    // видимой вспышкой диаграммы посередине), а мгновенно перескакиваем
    // на 0 и открываем календарь уже оттуда одним движением.
    if (openFace === 'wallet') {
      flipAnim.setValue(0);
    }
    setBackContent('calendar');
    setOpenFace('calendar');
    animateFlip(1);
  }

  function loadWallet() {
    if (!userId) return;
    fetchWalletBalance(userId).then(setWalletBalance);
    fetchIncomes(userId).then(setIncomes);
  }

  function toggleWallet() {
    haptics.light();
    if (openFace === 'wallet') {
      setOpenFace(null);
      animateFlip(0);
      return;
    }
    if (openFace === 'calendar') {
      flipAnim.setValue(0);
    }
    loadWallet();
    setBackContent('wallet');
    setOpenFace('wallet');
    animateFlip(-1);
  }

  function handleIncomeLongPress(income: IncomeRecord) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(t('expenses_delete_income_title'), t('expenses_delete_income_body'), [
      { text: t('common_cancel'), style: 'cancel' },
      {
        text: t('common_delete'),
        style: 'destructive',
        onPress: async () => {
          const error = await deleteIncome(income.id);
          if (error) {
            Alert.alert(t('expenses_delete_income_failed'), error);
            return;
          }
          loadWallet();
        },
      },
    ]);
  }

  async function sendQueuedScan(scan: QueuedScan) {
    if (!userId || sendingQueueId) return;
    setSendingQueueId(scan.id);
    const { error } = await submitScan(userId, scan.imageBase64, settings?.currency ?? 'CZK');
    setSendingQueueId(null);
    if (error) {
      Alert.alert(t('expenses_queue_not_sent_yet'), t('expenses_queue_retry_hint'));
      return;
    }
    await removeFromQueue(scan.id);
    const next = await getQueue();
    setPendingScans(next);
    if (next.length === 0) setQueueVisible(false);
    showToast(t('expenses_receipt_sent_toast'));
    fetchReceipts(userId);
  }

  async function deleteQueuedScan(scan: QueuedScan) {
    await removeFromQueue(scan.id);
    const next = await getQueue();
    setPendingScans(next);
    if (next.length === 0) setQueueVisible(false);
  }

  function openDetail(receiptId: string) {
    rootNav()?.navigate('ReceiptDetail', { receiptId });
  }

  function handleLongPress(receipt: ReceiptRecord) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickActionsReceipt(receipt);
  }

  function handleEdit() {
    if (!quickActionsReceipt) return;
    const id = quickActionsReceipt.id;
    setQuickActionsReceipt(null);
    openDetail(id);
  }

  async function handleRescan(receipt: ReceiptRecord) {
    if (!receipt.image_path) {
      Alert.alert(t('expenses_no_photo_title'), t('expenses_no_photo_body'));
      return;
    }
    showToast(t('expenses_rescanning_toast'));
    const { error } = await rescanReceipt(receipt);
    if (userId) fetchReceipts(userId);
    if (error) {
      Alert.alert(t('expenses_rescan_failed'), error);
    }
  }

  // Подтверждение уже показал SwipeToDeleteRow — сюда попадаем только
  // после явного тапа по корзинке и «Удалить» в алерте.
  async function performDelete(receipt: ReceiptRecord) {
    const error = await deleteReceipt(receipt.id, receipt.image_path);
    if (error) {
      Alert.alert(t('expenses_delete_receipt_failed'), error);
      return;
    }
    if (userId) fetchReceipts(userId);
  }

  const hasFamilyReceipts = receipts.some((r) => r.user_id !== userId);
  const visibleReceipts = showOnlyMine ? receipts.filter((r) => r.user_id === userId) : receipts;
  const myAvatar = avatarUrl(settings?.avatar_path ?? null, settings?.updated_at);

  // Список чеков как есть, если кошелёк выключен; с включённым — доходы
  // подмешиваются рядом, отсортированные вместе по дате.
  const receiptEntries: FeedEntry[] = visibleReceipts.map((r) => ({
    kind: 'receipt',
    id: r.id,
    sortDate: r.purchase_date ?? r.created_at,
    receipt: r,
  }));
  const feedItemsAll: FeedEntry[] = walletMode
    ? [
        ...receiptEntries,
        ...incomes.map((i): FeedEntry => ({ kind: 'income', id: i.id, sortDate: i.created_at, income: i })),
      ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
    : receiptEntries;
  const feedItems: FeedEntry[] =
    selectedDay !== null
      ? feedItemsAll.filter((item) => {
          const d = new Date(item.sortDate);
          return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay;
        })
      : feedItemsAll;

  if (!isLoading && receipts.length === 0 && pendingScans.length === 0) {
    // Пустое состояние — но «+» обязана остаться: это главный экран,
    // и другого места добавить первый чек у пользователя нет.
    return (
      <View style={styles.container}>
        <ScreenPlaceholder
          icon={Wallet}
          title={t('expenses_empty_title')}
          description={t('expenses_empty_description')}
        />
        <SpeedDialFab
          actions={[
            { icon: ScanLine, label: t('expenses_action_scan'), onPress: () => rootNav()?.navigate('Scan') },
            { icon: PenLine, label: t('expenses_action_manual'), onPress: () => rootNav()?.navigate('AddExpense') },
            { icon: WalletCards, label: t('expenses_action_income'), onPress: () => rootNav()?.navigate('AddIncome') },
          ]}
        />
        <ProfileMenuButton
          avatarUri={myAvatar}
          fallbackLetter={settings?.nickname?.trim()?.[0] ?? ''}
          actions={profileMenuActions()}
        />
      </View>
    );
  }

  if (isLoading && receipts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          <View style={styles.header}>
            <Text style={styles.screenTitle}>{t('expenses_title')}</Text>
          </View>
          <Skeleton width="100%" height={220} borderRadius={22} />
          <Skeleton width={70} height={15} style={{ marginTop: 20, marginBottom: 10 }} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={72} borderRadius={16} style={{ marginBottom: 10 }} />
          ))}
        </View>
      </View>
    );
  }

  const monthTotal = categories.reduce((sum, c) => sum + c.total, 0);

  // Советы ИИ: лимиты у порога/превышены — тап отправляет вопрос в чат,
  // где ИИ разберёт его подробнее. severity красит точку и определяет
  // формулировку — превышенный лимит нагляднее «красного», близкий — «жёлтого».
  const recommendations: { text: string; severity: 'exceeded' | 'warning' }[] = [];
  for (const limit of limits) {
    const spent = categories.find((c) => c.categoryName === limit.category_name)?.total ?? 0;
    const percent = limit.amount > 0 ? (spent / limit.amount) * 100 : 0;
    if (percent >= 100) {
      recommendations.push({
        text: t('expenses_limit_exceeded', { category: translateCategoryName(limit.category_name, locale) }),
        severity: 'exceeded',
      });
    } else if (percent >= 75) {
      recommendations.push({
        text: t('expenses_limit_near', {
          category: translateCategoryName(limit.category_name, locale),
          percent: Math.round(percent),
        }),
        severity: 'warning',
      });
    }
  }
  const topRecommendations = recommendations.slice(0, 3);

  function openTipInChat(tip: string) {
    haptics.light();
    if (userId) {
      useChatStore.getState().sendMessage(userId, tip);
    }
    (navigation as unknown as { navigate: (name: string) => void }).navigate('Chat');
  }

  const segments: DonutSegment[] = categories.map((c) => ({
    key: c.categoryName,
    value: c.total,
    color: getCategoryColor(c.categoryName),
  }));
  const chartStyle = settings?.chart_style ?? 'donut';
  const maxCategoryTotal = Math.max(...categories.map((c) => c.total), 1);

  // Мини-календарь на обратной стороне карточки — уже «полный»: месяц
  // переключается стрелками прямо тут, сумма видна в ячейке без тапа.
  const dailyTotals = new Map<number, number>();
  for (const r of visibleReceipts) {
    const d = r.purchase_date ? new Date(r.purchase_date) : new Date(r.created_at);
    if (d.getFullYear() !== calYear || d.getMonth() !== calMonth) continue;
    const amount = (r.total_amount ?? 0) * (r.exchange_rate ?? 1);
    dailyTotals.set(d.getDate(), (dailyTotals.get(d.getDate()) ?? 0) + amount);
  }
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Пн=0
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth();

  // Календарь открывается поворотом вправо (0→1), кошелёк — влево (0→−1).
  const frontAnimated = {
    transform: [
      { perspective: 1000 },
      {
        rotateY: flipAnim.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: ['-180deg', '0deg', '180deg'],
        }),
      },
    ],
  };
  const backAnimated = {
    transform: [
      { perspective: 1000 },
      {
        rotateY:
          backContent === 'calendar'
            ? flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] })
            : flipAnim.interpolate({ inputRange: [-1, 0], outputRange: ['0deg', '-180deg'] }),
      },
    ],
  };

  return (
    <View style={styles.container}>
      {/* Закреплённая шапка: не скроллится вместе со списком, поэтому
          аватарка (тоже absolute, но фиксированная) больше не остаётся
          «одна» после того как заголовок уезжал вместе с контентом. */}
      <View style={styles.fixedHeader}>
        <Text style={styles.screenTitle}>{t('expenses_title')}</Text>
      </View>

      <FlatList
        data={feedItems}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        renderItem={({ item, index }) => {
          if (item.kind === 'income') {
            return (
              <FadeInView index={index}>
                <Pressable
                  style={styles.incomeRow}
                  onLongPress={() => handleIncomeLongPress(item.income)}
                >
                  <PlusCircle color={colors.success} size={24} strokeWidth={1.75} />
                  <View style={styles.incomeInfo}>
                    <Text style={styles.incomeNote} numberOfLines={1}>
                      {item.income.note?.trim() || t('expenses_income_fallback')}
                    </Text>
                    <Text style={styles.incomeDate}>
                      {new Date(item.income.created_at).toLocaleDateString(intlLocale, {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.incomeAmount}>
                    +{item.income.amount.toFixed(0)} {item.income.currency}
                  </Text>
                </Pressable>
              </FadeInView>
            );
          }
          const receipt = item.receipt;
          const foreignOwner = receipt.user_id !== userId ? ownerProfiles[receipt.user_id] : null;
          return (
            <FadeInView index={index}>
              <SwipeToDeleteRow
                onDelete={() => performDelete(receipt)}
                confirmTitle={t('expenses_delete_confirm_title')}
                confirmMessage={t('expenses_delete_confirm_body')}
              >
                <ReceiptListItem
                  receipt={receipt}
                  onPress={() => openDetail(receipt.id)}
                  onLongPress={() => handleLongPress(receipt)}
                  onRescan={() => handleRescan(receipt)}
                  ownerAvatarUrl={
                    foreignOwner ? avatarUrl(foreignOwner.avatar_path, foreignOwner.updated_at) : myAvatar
                  }
                  ownerName={foreignOwner ? foreignOwner.nickname?.trim() || t('expenses_owner_unknown') : null}
                />
              </SwipeToDeleteRow>
            </FadeInView>
          );
        }}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => userId && fetchReceipts(userId)}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {pendingScans.length > 0 && (
              <Pressable style={styles.queueBanner} onPress={() => setQueueVisible(true)}>
                <CloudUpload color={colors.warning} size={18} />
                <Text style={styles.queueBannerText}>
                  {t('expenses_queue_banner', { count: pendingScans.length })}
                </Text>
              </Pressable>
            )}

            {segments.length > 0 && (
              <FadeInView index={0}>
                <View style={[styles.flipWrap, cardHeight ? { height: cardHeight } : null]}>
                  {/* Задняя сторона: мини-календарь (кнопка справа) */}
                  {backContent === 'calendar' && (
                  <Animated.View
                    style={[styles.chartCard, styles.cardBack, backAnimated]}
                    pointerEvents={openFace ? 'auto' : 'none'}
                  >
                    <Text style={[styles.calendarTitle, styles.calendarNavTitle]}>
                      {MONTH_NAMES[calMonth]} {calYear}
                    </Text>
                    <View style={styles.weekRow}>
                      {WEEKDAYS.map((day) => (
                        <Text key={day} style={styles.weekday}>
                          {day}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.daysGrid}>
                      {calendarCells.map((day, i) => {
                        const total = day !== null ? dailyTotals.get(day) : undefined;
                        return (
                          <View key={i} style={styles.dayCell}>
                            {day !== null && (
                              <Pressable
                                disabled={total === undefined}
                                onPress={() => {
                                  haptics.selection();
                                  setSelectedDay((prev) => (prev === day ? null : day));
                                }}
                                style={[
                                  styles.dayInner,
                                  total !== undefined && styles.daySpent,
                                  isCurrentMonth && day === today.getDate() && styles.dayToday,
                                  selectedDay === day && styles.daySelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.dayText,
                                    total !== undefined && styles.dayTextSpent,
                                    selectedDay === day && styles.dayTextSelected,
                                  ]}
                                >
                                  {day}
                                </Text>
                                {total !== undefined && (
                                  <Text
                                    style={[styles.daySpentAmount, selectedDay === day && styles.dayTextSelected]}
                                    numberOfLines={1}
                                  >
                                    {total.toFixed(0)}
                                  </Text>
                                )}
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </View>
                    {/* Переключение месяца — снизу, а не сверху над заголовком. */}
                    <View style={styles.calendarNavRow}>
                      <Pressable onPress={() => shiftCalMonth(-1)} hitSlop={8} style={styles.calendarNavButton}>
                        <ChevronLeft color={colors.textPrimary} size={18} />
                      </Pressable>
                      <Pressable onPress={() => shiftCalMonth(1)} hitSlop={8} style={styles.calendarNavButton}>
                        <ChevronRight color={colors.textPrimary} size={18} />
                      </Pressable>
                    </View>
                  </Animated.View>
                  )}

                  {/* Задняя сторона: кошелёк (кнопка слева) */}
                  {backContent === 'wallet' && (
                  <Animated.View
                    style={[styles.chartCard, styles.cardBack, backAnimated]}
                    pointerEvents={openFace ? 'auto' : 'none'}
                  >
                    <Text style={[styles.calendarTitle, styles.backTitle]}>{t('expenses_wallet')}</Text>
                    <View style={styles.walletBody}>
                      <View style={styles.walletIconCircle}>
                        <Wallet color={colors.accent} size={44} />
                      </View>
                      <AnimatedNumber
                        value={walletBalance?.balance ?? 0}
                        formatter={(n) => `${n.toFixed(0)} ${walletBalance?.currency || categoryCurrency}`}
                        style={[
                          styles.walletBalanceBig,
                          (walletBalance?.balance ?? 0) < 0 && styles.walletBalanceNeg,
                        ]}
                      />
                      <Text style={styles.walletCaption}>{t('expenses_wallet_balance')}</Text>
                    </View>
                    {walletBalance && (
                      <View style={styles.walletStrip}>
                        <View style={styles.walletStripItem}>
                          <View style={styles.walletStripLabelRow}>
                            <ArrowUpCircle color={colors.success} size={14} />
                            <Text style={styles.walletStripLabel}>{t('expenses_income')}</Text>
                          </View>
                          <Text style={styles.walletSubIncome}>
                            +{walletBalance.totalIncome.toFixed(0)} {walletBalance.currency || categoryCurrency}
                          </Text>
                        </View>
                        <View style={styles.walletStripDivider} />
                        <View style={styles.walletStripItem}>
                          <View style={styles.walletStripLabelRow}>
                            <ArrowDownCircle color={colors.error} size={14} />
                            <Text style={styles.walletStripLabel}>{t('expenses_expense')}</Text>
                          </View>
                          <Text style={styles.walletSubExpense}>
                            −{walletBalance.totalExpense.toFixed(0)} {walletBalance.currency || categoryCurrency}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Animated.View>
                  )}

                  {/* Передняя сторона: диаграмма.
                      Блюр тут не годится: на web backdrop-filter «протекает»
                      через все грани флип-карточки (они наложены друг на
                      друга в одном контейнере) — размывало и календарь, и
                      кошелёк на обратной стороне. Оставляем плоскую заливку. */}
                  <Animated.View
                    style={[styles.chartCard, frontAnimated]}
                    pointerEvents={openFace ? 'none' : 'auto'}
                    onLayout={(e) => {
                      const h = Math.ceil(e.nativeEvent.layout.height);
                      if (h > 0 && h !== cardHeight) setCardHeight(h);
                    }}
                  >
                    {chartStyle === 'donut' ? (
                      <View style={styles.donutWrap}>
                        <DonutChart
                          segments={segments}
                          size={200}
                          strokeWidth={26}
                          centerValue={monthTotal}
                          centerFormatter={(n) => `${n.toFixed(0)} ${categoryCurrency}`}
                          centerBottom={t('expenses_total')}
                        />
                      </View>
                    ) : (
                      <View style={styles.barsWrap}>
                        <AnimatedNumber
                          value={monthTotal}
                          formatter={(n) => `${n.toFixed(0)} ${categoryCurrency}`}
                          style={styles.barsTotal}
                        />
                        <Text style={styles.barsTotalSub}>{t('expenses_total_month')}</Text>
                      </View>
                    )}

                    <View style={styles.legend}>
                      {categories.map((entry) => (
                        <Pressable
                          key={entry.categoryName}
                          style={styles.legendRow}
                          onPress={() => rootNav()?.navigate('Category', { categoryName: entry.categoryName })}
                        >
                          <View
                            style={[styles.legendDot, { backgroundColor: getCategoryColor(entry.categoryName) }]}
                          />
                          <View style={styles.legendBody}>
                            <View style={styles.legendTopRow}>
                              <Text style={styles.legendName}>{translateCategoryName(entry.categoryName, locale)}</Text>
                              <Text style={styles.legendAmount}>
                                {entry.total.toFixed(0)} {categoryCurrency}
                              </Text>
                              <Text style={styles.legendPercent}>{entry.percent.toFixed(0)}%</Text>
                            </View>
                            {chartStyle === 'bars' && (
                              <View style={styles.barTrack}>
                                <View
                                  style={[
                                    styles.barFill,
                                    {
                                      width: `${Math.max((entry.total / maxCategoryTotal) * 100, 3)}%`,
                                      backgroundColor: getCategoryColor(entry.categoryName),
                                    },
                                  ]}
                                />
                              </View>
                            )}
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </Animated.View>

                  {/* Кнопки-углы поверх обеих сторон — при перевороте остаются на месте.
                      Повторное нажатие той же кнопки возвращает диаграмму. */}
                  <View style={styles.cardCornerLeft}>
                    <Pressable
                      style={[styles.cornerButton, openFace === 'wallet' && styles.cornerButtonActive]}
                      onPress={toggleWallet}
                      hitSlop={6}
                    >
                      <Wallet color={openFace === 'wallet' ? colors.background : colors.accent} size={18} />
                    </Pressable>
                    <Pressable
                      style={styles.cornerButton}
                      onPress={() => {
                        haptics.light();
                        rootNav()?.navigate('Limits');
                      }}
                      hitSlop={6}
                    >
                      <ShieldCheck color={colors.accent} size={18} />
                    </Pressable>
                  </View>
                  <View style={styles.cardCorner}>
                    {hasFamilyReceipts && (
                      <Pressable
                        style={[styles.cornerButton, showOnlyMine && styles.cornerButtonActive]}
                        onPress={() => {
                          haptics.selection();
                          setShowOnlyMine((v) => !v);
                        }}
                        hitSlop={6}
                      >
                        {showOnlyMine ? (
                          <User color={colors.background} size={18} />
                        ) : (
                          <Users color={colors.accent} size={18} />
                        )}
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.cornerButton, openFace === 'calendar' && styles.cornerButtonActive]}
                      onPress={toggleFlip}
                      hitSlop={6}
                    >
                      <CalendarDays
                        color={openFace === 'calendar' ? colors.background : colors.accent}
                        size={18}
                      />
                    </Pressable>
                  </View>
                </View>
              </FadeInView>
            )}

            {topRecommendations.length > 0 && (
              <FadeInView index={1}>
                <View style={styles.aiCard}>
                  <View style={styles.aiHeader}>
                    <Sparkles color={colors.accent} size={18} />
                    <Text style={styles.aiTitle}>{t('expenses_ai_ask_title')}</Text>
                  </View>
                  {topRecommendations.map((rec, i) => (
                    <Pressable key={i} style={styles.aiBullet} onPress={() => openTipInChat(rec.text)}>
                      <View
                        style={[
                          styles.aiDot,
                          { backgroundColor: rec.severity === 'exceeded' ? colors.error : colors.warning },
                        ]}
                      />
                      <Text style={styles.aiBulletText}>{rec.text}</Text>
                      <ChevronRight color={colors.textSecondary} size={16} />
                    </Pressable>
                  ))}
                </View>
              </FadeInView>
            )}

            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>
                {selectedDay !== null
                  ? `${selectedDay} ${MONTH_NAMES[calMonth].toLowerCase()}`
                  : walletMode
                    ? t('expenses_receipts_and_incomes')
                    : t('expenses_receipts')}
              </Text>
              {selectedDay !== null && (
                <Pressable onPress={() => setSelectedDay(null)} hitSlop={8} style={styles.dayFilterClear}>
                  <Text style={styles.dayFilterClearText}>{t('expenses_show_all')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        }
      />

      <ReceiptQuickActions
        receipt={quickActionsReceipt}
        onClose={() => setQuickActionsReceipt(null)}
        onEdit={handleEdit}
      />

      <SpeedDialFab
        actions={[
          { icon: ScanLine, label: t('expenses_action_scan'), onPress: () => rootNav()?.navigate('Scan') },
          { icon: PenLine, label: t('expenses_action_manual'), onPress: () => rootNav()?.navigate('AddExpense') },
          { icon: WalletCards, label: t('expenses_action_income'), onPress: () => rootNav()?.navigate('AddIncome') },
        ]}
      />
      <ProfileMenuButton
        avatarUri={myAvatar}
        fallbackLetter={settings?.nickname?.trim()?.[0] ?? ''}
        actions={profileMenuActions()}
      />

      {/* Очередь чеков без сети: посмотреть, отправить, удалить */}
      <Modal visible={queueVisible} transparent animationType="slide" onRequestClose={() => setQueueVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setQueueVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('expenses_queue_title', { count: pendingScans.length })}</Text>
            <Text style={styles.sheetSub}>{t('expenses_queue_subtitle')}</Text>
            {pendingScans.map((scan) => (
              <View key={scan.id} style={styles.queueRow}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${scan.imageBase64}` }}
                  style={styles.queueThumb}
                />
                <View style={styles.queueInfo}>
                  <Text style={styles.queueDate}>
                    {new Date(scan.createdAt).toLocaleString(intlLocale, {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.queueStatus}>{t('expenses_queue_waiting')}</Text>
                </View>
                <Pressable
                  style={styles.queueSend}
                  onPress={() => sendQueuedScan(scan)}
                  disabled={sendingQueueId !== null}
                >
                  <Send color={colors.background} size={16} />
                </Pressable>
                <Pressable style={styles.queueDelete} onPress={() => deleteQueuedScan(scan)} hitSlop={6}>
                  <Trash2 color={colors.error} size={18} />
                </Pressable>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 20,
    paddingTop: 16,
    // Чтобы плавающая «+» не закрывала последний чек в списке.
    paddingBottom: 110,
  },
  fixedHeader: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 16,
    gap: 16,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 12,
    padding: 12,
  },
  queueBannerText: {
    flex: 1,
    color: colors.warning,
    fontSize: 13,
  },
  flipWrap: {
    position: 'relative',
    borderRadius: 20,
    // Задняя сторона (календарь) абсолютно спозиционирована и не влияет на
    // высоту контейнера — без явного minHeight/overflow она может оказаться
    // выше передней (диаграмма+легенда) и вылезти за скруглённые края карточки.
    overflow: 'hidden',
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    minHeight: 420,
    backfaceVisibility: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    gap: 10,
  },
  cardCorner: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    flexDirection: 'row',
    gap: 8,
  },
  cardCornerLeft: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    gap: 8,
  },
  aiCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  aiBullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  aiBulletText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
  },
  cornerButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerButtonActive: {
    backgroundColor: colors.accent,
  },
  calendarTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  // Заголовок задней стороны по центру — по углам лежат общие кнопки карточки.
  backTitle: {
    textAlign: 'center',
  },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarNavTitle: {
    flex: 1,
    textAlign: 'center',
  },
  calendarNavButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: 11,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    // Фиксированная высота вместо aspectRatio: на широких экранах (iPad —
    // ios.supportsTablet:true) карточка шире, и квадратные ячейки по ширине
    // колонки становились огромными, вылезая за рамки карточки календаря.
    width: `${100 / 7}%`,
    height: 36,
    padding: 1,
  },
  dayInner: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  daySpent: {
    backgroundColor: colors.accentSoft,
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  daySelected: {
    backgroundColor: colors.accent,
  },
  dayText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  dayTextSpent: {
    color: colors.accent,
    fontWeight: '700',
  },
  daySpentAmount: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: colors.background,
  },
  donutWrap: {
    alignItems: 'center',
  },
  barsWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  barsTotal: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  barsTotalSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  legend: {
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendBody: {
    flex: 1,
    gap: 5,
  },
  legendTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  legendAmount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  legendPercent: {
    color: colors.textSecondary,
    fontSize: 13,
    width: 40,
    textAlign: 'right',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  dayFilterClear: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
  },
  dayFilterClearText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  walletBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  walletIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  walletBalanceBig: {
    color: colors.success,
    fontSize: 32,
    fontWeight: '700',
  },
  walletBalanceNeg: {
    color: colors.error,
  },
  walletCaption: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  walletStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 12,
  },
  walletStripItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  walletStripLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  walletStripLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  walletStripDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
  },
  walletSubIncome: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '700',
  },
  walletSubExpense: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '700',
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  incomeInfo: {
    flex: 1,
    gap: 2,
  },
  incomeNote: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  incomeDate: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  incomeAmount: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
    maxHeight: '80%',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSub: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 10,
  },
  queueThumb: {
    width: 48,
    height: 62,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  queueInfo: {
    flex: 1,
  },
  queueDate: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  queueStatus: {
    color: colors.warning,
    fontSize: 12,
    marginTop: 2,
  },
  queueSend: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueDelete: {
    padding: 6,
  },
}));
