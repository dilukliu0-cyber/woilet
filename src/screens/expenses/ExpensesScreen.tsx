import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
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
  ShoppingCart,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  InteractionManager,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WeeklySpendingChart } from '../../components/charts/WeeklySpendingChart';
import { WheelSelector } from '../../components/ui/WheelSelector';
import { WalletPanel } from '../../components/wallet/WalletPanel';
import { buildWidgetSnapshot, publishWidgetSnapshot } from '../../services/widgets/widgetSnapshot';
import { useLimitsStore } from '../../store/limitsStore';
import { ReceiptListItem } from '../../components/cards/ReceiptListItem';
import { LimitsScreen } from '../limits/LimitsScreen';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { FadeInView } from '../../components/ui/FadeInView';
import { ProfileMenuButton } from '../../components/ui/ProfileMenuButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { SpeedDialFab } from '../../components/ui/SpeedDialFab';
import { SwipeToDeleteRow } from '../../components/ui/SwipeToDeleteRow';
import { useT } from '../../i18n/useT';
import { INTL_LOCALE, translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
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
import { useLocaleStore } from '../../store/localeStore';
import { useReceiptsStore } from '../../store/receiptsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import { colors } from '../../theme/colors';
import type { IncomeRecord } from '../../types/income';
import type { ReceiptRecord } from '../../types/receiptRecord';
import { themedStyles } from '../../theme/themedStyles';
import { haptics } from '../../utils/haptics';

type FeedEntry =
  | { kind: 'receipt'; id: string; sortDate: string; receipt: ReceiptRecord }
  | { kind: 'income'; id: string; sortDate: string; income: IncomeRecord }
  | { kind: 'month'; id: string; sortDate: string; monthKey: string; label: string; total: number }
  | { kind: 'day'; id: string; sortDate: string; label: string; total: number };

function feedDate(entry: FeedEntry): Date {
  if (entry.kind === 'receipt' && entry.receipt.purchase_date) {
    const [year, month, day] = entry.receipt.purchase_date.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(entry.sortDate);
}

function feedDayKey(entry: FeedEntry): string {
  const date = feedDate(entry);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

type CardView = 'week' | 'month' | 'calendar' | 'wallet';
const CARD_VIEWS: CardView[] = ['week', 'month', 'calendar', 'wallet'];

function animateNextLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(260, 'easeInEaseOut', 'opacity'));
}

export function ExpensesScreen() {
  const t = useT();
  const isPro = useSubscriptionStore((state) => state.isPro);
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

  // Карточка трат: три вида за период (неделя, месяц по категориям,
  // календарь) переключаются подписанным сегментом; кошелёк — отдельная
  // раскрывающаяся строка. Раньше это был 3D-переворот с безымянными
  // иконками в углах: что откроется, приходилось угадывать.
  const [cardView, setCardView] = useState<CardView>('month');
  const cardViewRef = useRef<CardView>('month');
  // На экране кошелька список под карточкой показывает пополнения вместо чеков.
  const walletMode = cardView === 'wallet';
  const calendarAnimating = useRef(false);
  const calendarContentOpacity = useRef(new Animated.Value(1)).current;
  const calendarContentOffset = useRef(new Animated.Value(0)).current;
  const headerScroll = useRef(new Animated.Value(0)).current;

  // Лимиты открываются не отдельным экраном, а разворотом карточки
  // расходов на весь экран поверх этого же экрана (см. рендер overlay
  // в конце компонента) — так «блок расходов» визуально растягивается,
  // а не просто уводит на другой слайд стека.
  const [limitsOpen, setLimitsOpen] = useState(false);
  const limitsAnim = useRef(new Animated.Value(0)).current;

  function openLimits() {
    haptics.light();
    setLimitsOpen(true);
    Animated.spring(limitsAnim, { toValue: 1, useNativeDriver: true, friction: 9, tension: 50 }).start();
  }

  function closeLimits() {
    Animated.timing(limitsAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setLimitsOpen(false);
    });
  }

  // Мини-календарь сразу «полный» — переключение месяцев прямо тут, без
  // перехода на отдельный экран.
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  // Тап по дню с расходами — фильтрует список чеков ниже этим днём.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Раскрытые месяцы в списке чеков. Текущий раскрыт сразу — он и нужен
  // чаще всего; прошлые открываются тапом по заголовку.
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    () => new Set([`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`]),
  );

  function toggleMonth(key: string) {
    haptics.selection();
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function shiftCalMonth(delta: number) {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setSelectedDay(null);
    haptics.selection();
  }

  function animateCalMonth(delta: number) {
    if (calendarAnimating.current) return;
    calendarAnimating.current = true;
    const direction = delta > 0 ? -1 : 1;
    Animated.parallel([
      Animated.timing(calendarContentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(calendarContentOffset, {
        toValue: direction * 42,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        calendarAnimating.current = false;
        return;
      }
      shiftCalMonth(delta);
      calendarContentOffset.setValue(-direction * 42);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(calendarContentOpacity, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(calendarContentOffset, {
            toValue: 0,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => { calendarAnimating.current = false; });
      });
    });
  }

  function loadCategories() {
    if (!userId) return;
    // Диаграмма считается за месяц, выбранный стрелками календаря, а не за
    // текущий: раньше здесь стояла сегодняшняя дата, и пролистать календарь
    // на прошлый месяц было можно, а диаграмма оставалась на этом — в начале
    // нового месяца экран выглядел так, будто данные пропали.
    // Диаграмма должна совпадать со списком чеков ниже: без фильтра — вместе
    // с семьёй, с «только я» — как и список, только свои.
    fetchMonthlyCategoryBreakdown(userId, new Date(calYear, calMonth, 1), !showOnlyMine).then(
      ({ entries, currency }) => {
        setCategories(entries);
        // В пустом месяце валюту взять неоткуда — падаем на основную из
        // настроек, иначе сумма выводится как «0 » без обозначения.
        setCategoryCurrency(currency || settings?.currency || '');
      },
    );
  }

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchReceipts(userId);
        loadCategories();
        loadWallet();
      }
      getQueue().then(setPendingScans);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, fetchReceipts]),
  );

  // Пересчитываем и при смене месяца стрелками, иначе диаграмма отстанет от
  // календаря.
  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnlyMine, calYear, calMonth]);

  function rootNav() {
    return navigation;
  }

  // Профиль — не вкладка, а «рулетка» из аватарки в шапке.
  function profileMenuActions() {
    return [
      { icon: User, label: t('expenses_menu_profile'), onPress: () => rootNav()?.navigate('Profile') },
      // ИИ-чат и покупки — только в Pro. Бесплатным пункты не показываем
      // вовсе, а не заглушкой: так решили, чтобы бесплатная версия была
      // чистой, без замков на каждом шагу.
      ...(isPro
        ? [
            { icon: Sparkles, label: t('tabs_chat'), onPress: () => rootNav()?.navigate('Chat') },
            { icon: ShoppingCart, label: t('tabs_shopping'), onPress: () => rootNav()?.navigate('Shopping') },
          ]
        : []),
      { icon: LayoutGrid, label: t('expenses_menu_categories'), onPress: () => rootNav()?.navigate('Categories') },
      { icon: Users, label: t('expenses_menu_family'), onPress: () => rootNav()?.navigate('Family') },
      { icon: LogOut, label: t('expenses_menu_logout'), onPress: () => signOut(), destructive: true },
    ];
  }

  function loadWallet() {
    if (!userId) return;
    fetchWalletBalance(userId).then(setWalletBalance);
    fetchIncomes(userId).then(setIncomes);
  }

  // Тап по строке кошелька докручивает колесо до экрана кошелька.
  function toggleWallet() {
    loadWallet();
    goToPage(CARD_VIEWS.indexOf('wallet'));
  }

  async function removeIncome(income: IncomeRecord) {
    const error = await deleteIncome(income.id);
    if (error) {
      Alert.alert(t('expenses_delete_income_failed'), error);
      return;
    }
    loadWallet();
  }

  // --- Лента экранов (неделя / месяц / календарь) ---
  // Одно положение на всё: его меняет палец (лента — обычная горизонтальная
  // прокрутка с постраничной доводкой), а экраны и подписи над карточкой
  // только отражают его. На каждой смене экрана — щелчок, как трещотка у
  // колеса таймера.
  const pagerRef = useRef<ScrollView>(null);
  const pagerX = useRef(new Animated.Value(0)).current;
  const [pageWidth, setPageWidth] = useState(0);
  const pagerPosition = useRef(0);
  const tickIndex = useRef(CARD_VIEWS.indexOf(cardViewRef.current));
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartX = useRef(0);
  const pageProgress = useMemo(
    () => Animated.divide(pagerX, pageWidth > 0 ? pageWidth : 1),
    [pagerX, pageWidth],
  );

  // Начальное положение ставим сами, когда ширина известна: contentOffset
  // браузер игнорирует, и лента открывалась на первом экране, а не на том,
  // что выбран.
  useEffect(() => {
    if (pageWidth <= 0) return;
    const x = CARD_VIEWS.indexOf(cardViewRef.current) * pageWidth;
    requestAnimationFrame(() => pagerRef.current?.scrollTo({ x, animated: false }));
    pagerX.setValue(x);
    pagerPosition.current = x;
    tickIndex.current = CARD_VIEWS.indexOf(cardViewRef.current);
  }, [pageWidth, pagerX]);

  // Высота ленты — по текущему экрану, а не по самому высокому: иначе под
  // «Месяцем» оставалась пустота высотой с календарь.
  const pageHeights = useRef<number[]>([]);
  const [pagerHeight, setPagerHeight] = useState(0);
  function onPageLayout(i: number, h: number) {
    pageHeights.current[i] = h;
    if (i === CARD_VIEWS.indexOf(cardViewRef.current)) setPagerHeight(h);
  }

  // Экраны — грани кубика: страница поворачивается вокруг ребра, общего с
  // соседней, и при свайпе видно, как выходит следующая сторона.
  function pageStyle(i: number) {
    const half = pageWidth / 2;
    const p = Animated.subtract(pageProgress, i);
    const pivot = p.interpolate({
      inputRange: [-1, -0.0001, 0.0001, 1],
      outputRange: [-half, -half, half, half],
      extrapolate: 'clamp',
    });
    return {
      width: pageWidth,
      alignSelf: 'flex-start' as const,
      backfaceVisibility: 'hidden' as const,
      opacity: p.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' }),
      transform: [
        { perspective: pageWidth * 2.2 },
        { translateX: pivot },
        {
          rotateY: p.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: ['90deg', '0deg', '-90deg'],
            extrapolate: 'clamp',
          }),
        },
        { translateX: Animated.multiply(pivot, -1) },
      ],
    };
  }

  function handlePagerScroll(event: { nativeEvent: { contentOffset: { x: number } } }) {
    const x = event.nativeEvent.contentOffset.x;
    pagerPosition.current = x;
    if (pageWidth <= 0) return;
    const nearest = Math.min(Math.max(Math.round(x / pageWidth), 0), CARD_VIEWS.length - 1);
    if (nearest !== tickIndex.current) {
      tickIndex.current = nearest;
      haptics.selection();
    }
    // Веб не присылает onMomentumScrollEnd надёжно: остановку ловим по паузе.
    if (Platform.OS === 'web') {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => settlePager(pagerPosition.current), 140);
    }
  }

  function settlePager(x: number) {
    if (pageWidth <= 0) return;
    const index = Math.min(Math.max(Math.round(x / pageWidth), 0), CARD_VIEWS.length - 1);
    if (Math.abs(x - index * pageWidth) > 1) {
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    }
    const next = CARD_VIEWS[index];
    if (next === cardViewRef.current) return;
    cardViewRef.current = next;
    animateNextLayout();
    setPagerHeight(pageHeights.current[index] ?? 0);
    // Тяжёлую перерисовку экрана (список чеков, кошелёк) запускаем после
    // того, как лента остановилась — иначе она рвала кадры анимации.
    InteractionManager.runAfterInteractions(() => setCardView(next));
    // Фильтр по дню живёт только в календаре — уходя из него, снимаем,
    // иначе список чеков остался бы урезанным без видимой причины.
    if (next !== 'calendar') setSelectedDay(null);
  }

  function goToPage(index: number) {
    pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    // На iOS программная прокрутка не присылает onMomentumScrollEnd.
    setTimeout(() => settlePager(index * pageWidth), 380);
  }

  // Жест по подписям над карточкой крутит ту же ленту.
  const wheelDragStart = useCallback(() => {
    dragStartX.current = pagerPosition.current;
  }, []);
  const wheelDragMove = useCallback((pages: number) => {
    const max = (CARD_VIEWS.length - 1) * pageWidth;
    const x = Math.min(Math.max(dragStartX.current + pages * pageWidth, 0), max);
    pagerRef.current?.scrollTo({ x, animated: false });
    // Программная прокрутка без анимации не всегда присылает onScroll —
    // двигаем положение и трещотку сами.
    pagerX.setValue(x);
    handlePagerScroll({ nativeEvent: { contentOffset: { x } } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);
  const wheelDragEnd = useCallback((velocityPages: number) => {
    if (pageWidth <= 0) return;
    // Бросок пальцем докручивает дальше — как у колеса таймера.
    const projected = pagerPosition.current / pageWidth + velocityPages * 0.15;
    const index = Math.min(Math.max(Math.round(projected), 0), CARD_VIEWS.length - 1);
    goToPage(index);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

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

  // Сюда попадаем только когда SwipeToDeleteRow зафиксировал решительный
  // свайп влево (COMMIT_THRESHOLD) — сам жест и есть подтверждение.
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

  // Сводка для виджетов iOS. Только свои чеки: виджет про «мои траты» и мой
  // бюджет, а семейные чеки на главном экране могут быть включены.
  // Бюджет — сумма лимитов, поэтому лимиты подгружаем и здесь: раньше их
  // загружал только экран лимитов.
  const limits = useLimitsStore((state) => state.limits);
  useEffect(() => {
    if (userId) useLimitsStore.getState().fetch(userId);
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    publishWidgetSnapshot(
      buildWidgetSnapshot({
        receipts: receipts.filter((r) => r.user_id === userId),
        currency: walletBalance?.currency || settings?.currency || 'CZK',
        wallet: walletBalance?.balance ?? 0,
        weekdayLabels: WEEKDAYS,
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, walletBalance, limits, locale, settings?.currency, userId]);
  const myAvatar = avatarUrl(settings?.avatar_path ?? null, settings?.updated_at);

  const receiptEntries: FeedEntry[] = visibleReceipts.map((r) => ({
    kind: 'receipt',
    id: r.id,
    sortDate: r.purchase_date ?? r.created_at,
    receipt: r,
  }));
  const feedItemsAll: FeedEntry[] = (walletMode
    ? incomes.map((i): FeedEntry => ({ kind: 'income', id: i.id, sortDate: i.created_at, income: i }))
    : receiptEntries).sort((a, b) => {
      const dayOrder = feedDayKey(b).localeCompare(feedDayKey(a));
      if (dayOrder) return dayOrder;
      const aTime = a.kind === 'receipt' ? a.receipt.purchase_time : null;
      const bTime = b.kind === 'receipt' ? b.receipt.purchase_time : null;
      return (bTime ?? b.sortDate).localeCompare(aTime ?? a.sortDate);
    });
  const feedFiltered: FeedEntry[] =
    selectedDay !== null && !walletMode
      ? feedItemsAll.filter((item) => {
          const d = feedDate(item);
          return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay;
        })
      : feedItemsAll;

  // Месяцы раскрываются отдельно, а внутри записи идут по дням покупки.
  const feedItems: FeedEntry[] = (() => {
    if (walletMode) return feedFiltered;
    if (selectedDay !== null) return feedFiltered;

    const groups = new Map<string, FeedEntry[]>();
    for (const entry of feedFiltered) {
      const d = feedDate(entry);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const list = groups.get(key);
      if (list) list.push(entry);
      else groups.set(key, [entry]);
    }

    const out: FeedEntry[] = [];
    for (const [key, entries] of groups) {
      const [year, month] = key.split('-').map(Number);
      const total = entries.reduce((sum, e) => {
        if (e.kind === 'receipt') return sum + (e.receipt.total_amount ?? 0) * (e.receipt.exchange_rate ?? 1);
        if (e.kind === 'income') return sum + e.income.amount;
        return sum;
      }, 0);

      out.push({
        kind: 'month',
        id: key,
        sortDate: entries[0].sortDate,
        monthKey: key,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        total,
      });
      if (expandedMonths.has(key)) {
        let previousDay = '';
        for (const entry of entries) {
          const dayKey = feedDayKey(entry);
          if (dayKey !== previousDay) {
            const dayEntries = entries.filter((candidate) => feedDayKey(candidate) === dayKey);
            out.push({
              kind: 'day',
              id: dayKey,
              sortDate: entry.sortDate,
              label: feedDate(entry).toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' }),
              total: dayEntries.reduce((sum, candidate) =>
                candidate.kind === 'receipt'
                  ? sum + (candidate.receipt.total_amount ?? 0) * (candidate.receipt.exchange_rate ?? 1)
                  : candidate.kind === 'income'
                    ? sum + candidate.income.amount
                    : sum, 0),
            });
            previousDay = dayKey;
          }
          out.push(entry);
        }
      }
    }
    return out;
  })();

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

  const monthTotal = categories.reduce((sum, category) => sum + category.total, 0);
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
  const calendarTotal = [...dailyTotals.values()].reduce((sum, amount) => sum + amount, 0);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Пн=0
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth();
  // Когда смотрим не текущий месяц, подпись под суммой должна называть его:
  // иначе непонятно, за какой период цифра.
  const periodLabel = isCurrentMonth
    ? t('expenses_total_month')
    : `${MONTH_NAMES[calMonth]} ${calYear}`;
  const prevMonthLabel = MONTH_NAMES[(calMonth + 11) % 12];


  return (
    <View style={styles.container}>
      <FlatList
        data={feedItems}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        renderItem={({ item, index }) => {
          if (item.kind === 'month') {
            const open = expandedMonths.has(item.monthKey);
            return (
              <Pressable style={styles.monthHeader} onPress={() => toggleMonth(item.monthKey)}>
                <View style={styles.monthHeaderText}>
                  <Text style={styles.monthHeaderLabel}>{item.label}</Text>
                </View>
                <View style={styles.monthHeaderRight}>
                  <Text style={styles.monthHeaderMeta}>{item.total.toFixed(0)} {categoryCurrency}</Text>
                  <ChevronRight color={colors.textPrimary} size={17} style={open ? styles.monthChevronOpen : undefined} />
                </View>
              </Pressable>
            );
          }
          if (item.kind === 'day') {
            return (
              <View style={styles.dayHeader}>
                <Text style={styles.dayHeaderLabel}>{item.label}</Text>
                <Text style={styles.dayHeaderTotal}>{item.total.toFixed(0)} {categoryCurrency}</Text>
              </View>
            );
          }
          if (item.kind === 'income') {
            return (
              <FadeInView index={index}>
                <SwipeToDeleteRow onDelete={() => removeIncome(item.income)}>
                <Pressable style={styles.incomeRow}>
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
                </SwipeToDeleteRow>
              </FadeInView>
            );
          }
          const receipt = item.receipt;
          const foreignOwner = receipt.user_id !== userId ? ownerProfiles[receipt.user_id] : null;
          return (
            <FadeInView index={index}>
              <SwipeToDeleteRow onDelete={() => performDelete(receipt)}>
                <ReceiptListItem
                  receipt={receipt}
                  onPress={() => openDetail(receipt.id)}
                  onRescan={() => handleRescan(receipt)}
                  ownerAvatarUrl={foreignOwner ? avatarUrl(foreignOwner.avatar_path, foreignOwner.updated_at) : null}
                  ownerName={foreignOwner ? foreignOwner.nickname?.trim() || t('expenses_owner_unknown') : null}
                />
              </SwipeToDeleteRow>
            </FadeInView>
          );
        }}
        contentContainerStyle={styles.listContent}
        onScroll={(event) => headerScroll.setValue(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={
          <View style={styles.receiptsEmpty}>
            <Text style={styles.receiptsEmptyText}>
              {walletMode
                ? t('expenses_topups_empty')
                : selectedDay === null
                  ? t('expenses_empty_description')
                  : t('expenses_no_receipts_day')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => userId && fetchReceipts(userId)}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.scrollHeader}>
              <Text style={styles.screenTitle}>{t('expenses_title')}</Text>
            </View>
            {pendingScans.length > 0 && (
              <Pressable style={styles.queueBanner} onPress={() => setQueueVisible(true)}>
                <CloudUpload color={colors.warning} size={18} />
                <Text style={styles.queueBannerText}>
                  {t('expenses_queue_banner', { count: pendingScans.length })}
                </Text>
              </Pressable>
            )}

            {/* Графический блок (диаграмма, кошелёк, календарь) показывается
                всегда. Раньше он был обёрнут в segments.length > 0 и в месяце
                без трат пропадал целиком — вместе с календарём и кошельком,
                через которые как раз и переключаются месяцы. В начале нового
                месяца экран выглядел сломанным. */}
            {/* Выбор вида — «барабан» между заголовком и карточкой: крутишь,
                подписи прокатываются как на цилиндре механического календаря. */}
            <WheelSelector
              labels={[t('expenses_view_week'), t('expenses_view_month'), t('expenses_view_calendar'), t('expenses_wallet')]}
              progress={pageProgress}
              onSelect={goToPage}
              onDragStart={wheelDragStart}
              onDragMove={wheelDragMove}
              onDragEnd={wheelDragEnd}
            />

            {(
              <FadeInView index={0}>
                <View style={styles.chartCard}>
                  {/* Переключатель «только мои / вся семья» — единственное,
                      что осталось в карточке сверху: выбор вида уехал в
                      барабан над ней. */}
                  {hasFamilyReceipts && (
                  <View style={styles.cardTopRow}>
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
                  </View>
                  )}

                  {/* Лента из трёх экранов. Её крутит палец, экраны
                      поворачиваются как грани барабана, а подписи над
                      карточкой считаются из того же положения — поэтому
                      ничего не может разъехаться. */}
                  <View onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
                    {pageWidth > 0 && (
                    <Animated.ScrollView
                      ref={pagerRef}
                      horizontal
                      pagingEnabled
                      directionalLockEnabled
                      disableIntervalMomentum
                      decelerationRate="fast"
                      style={pagerHeight > 0 ? { height: pagerHeight } : undefined}
                      showsHorizontalScrollIndicator={false}
                      scrollEventThrottle={16}
                      contentOffset={{ x: CARD_VIEWS.indexOf(cardViewRef.current) * pageWidth, y: 0 }}
                      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: pagerX } } }], {
                        useNativeDriver: Platform.OS !== 'web',
                        listener: handlePagerScroll,
                      })}
                      onMomentumScrollEnd={(e) => settlePager(e.nativeEvent.contentOffset.x)}
                    >
                      <Animated.View style={pageStyle(0)} shouldRasterizeIOS renderToHardwareTextureAndroid onLayout={(e) => onPageLayout(0, e.nativeEvent.layout.height)}>
                        <WeeklySpendingChart
                          receipts={visibleReceipts}
                          currency={settings?.currency ?? categoryCurrency ?? 'CZK'}
                          weekdayLabels={WEEKDAYS}
                          intlLocale={intlLocale}
                          embedded
                        />
                      </Animated.View>
                      <Animated.View style={pageStyle(1)} shouldRasterizeIOS renderToHardwareTextureAndroid onLayout={(e) => onPageLayout(1, e.nativeEvent.layout.height)}>
                        <View style={styles.barsWrap}>
                          <AnimatedNumber
                            value={monthTotal}
                            formatter={(n) => `${n.toFixed(0)} ${categoryCurrency}`}
                            style={styles.barsTotal}
                          />
                          <Text style={styles.barsTotalSub}>{periodLabel}</Text>
                        </View>
                        <View style={styles.legend}>
                          {categories.map((entry) => (
                            <Pressable
                              key={entry.categoryName}
                              style={styles.legendRow}
                              onPress={() => {
                                rootNav()?.navigate('Category', { categoryName: entry.categoryName });
                              }}
                            >
                              <View style={styles.legendBody}>
                                <View style={styles.legendTopRow}>
                                  <Text style={styles.legendName}>{translateCategoryName(entry.categoryName, locale)}</Text>
                                  <Text style={styles.legendAmount}>
                                    {entry.total.toFixed(0)} {categoryCurrency}
                                  </Text>
                                </View>
                                <View style={styles.barTrack}>
                                  <View style={[styles.barFill, { width: `${Math.max((entry.total / maxCategoryTotal) * 100, 3)}%` }]} />
                                </View>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                        {categories.length === 0 && (
                          <View style={styles.emptyMonth}>
                            <Text style={styles.emptyMonthText}>{t('expenses_empty_month')}</Text>
                            <Pressable onPress={() => shiftCalMonth(-1)} hitSlop={8}>
                              <Text style={styles.emptyMonthAction}>
                                {t('expenses_show_month', { month: prevMonthLabel })}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </Animated.View>
                      <Animated.View style={pageStyle(2)} shouldRasterizeIOS renderToHardwareTextureAndroid onLayout={(e) => onPageLayout(2, e.nativeEvent.layout.height)}>
                        <Animated.View style={[styles.calendarContent, {
                          opacity: calendarContentOpacity,
                          transform: [{ translateX: calendarContentOffset }],
                        }]}>
                        {/* Месяцы листаются стрелками: горизонтальный свайп
                            теперь крутит ленту экранов. */}
                        <View style={styles.calendarNavRow}>
                          <Pressable onPress={() => animateCalMonth(-1)} hitSlop={10}>
                            <ChevronLeft color={colors.textPrimary} size={20} />
                          </Pressable>
                          <Text style={[styles.calendarTitle, styles.calendarNavTitle]}>
                            {MONTH_NAMES[calMonth]} {calYear}
                          </Text>
                          <Pressable onPress={() => animateCalMonth(1)} hitSlop={10}>
                            <ChevronRight color={colors.textPrimary} size={20} />
                          </Pressable>
                        </View>
                        <View style={styles.calendarSummary}>
                          <Text style={styles.calendarSummaryLabel}>{t('expenses_total')}</Text>
                          <Text style={styles.calendarSummaryAmount}>
                            {calendarTotal.toFixed(0)} {categoryCurrency}
                          </Text>
                        </View>
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
                        </Animated.View>
                      </Animated.View>
                      <Animated.View style={pageStyle(3)} shouldRasterizeIOS renderToHardwareTextureAndroid onLayout={(e) => onPageLayout(3, e.nativeEvent.layout.height)}>
                        <WalletPanel
                          balance={walletBalance?.balance ?? 0}
                          totalIncome={walletBalance?.totalIncome ?? 0}
                          currency={walletBalance?.currency || categoryCurrency}
                        />
                      </Animated.View>
                    </Animated.ScrollView>
                    )}
                  </View>

                  {/* Кошелёк — не ещё один вид трат, а остаток: поэтому не
                      сегмент, а строка, которая всегда на виду. Тап раскрывает
                      пополнения, и список ниже переключается на них. */}
                  {cardView !== 'wallet' && (
                  <Pressable style={styles.walletRow} onPress={toggleWallet}>
                    <Wallet color={colors.accent} size={18} />
                    <Text style={styles.walletRowLabel}>{t('expenses_wallet')}</Text>
                    <AnimatedNumber
                      value={walletBalance?.balance ?? 0}
                      formatter={(n) => `${n.toFixed(0)} ${walletBalance?.currency || categoryCurrency}`}
                      style={styles.walletRowAmount}
                    />
                    <ChevronRight color={colors.textSecondary} size={16} />
                  </Pressable>
                  )}

                    <Pressable style={styles.limitsLink} onPress={openLimits}>
                      <ShieldCheck color={colors.accent} size={16} />
                      <Text style={styles.limitsLinkText}>{t('expenses_limits_link')}</Text>
                      <ChevronRight color={colors.textSecondary} size={16} />
                    </Pressable>
                </View>
              </FadeInView>
            )}

            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>
                {walletMode
                  ? t('expenses_topups_history')
                  : selectedDay !== null
                    ? `${selectedDay} ${MONTH_NAMES[calMonth].toLowerCase()}`
                    : t('expenses_receipts')}
              </Text>
              {selectedDay !== null && !walletMode && (
                <Pressable onPress={() => setSelectedDay(null)} hitSlop={8} style={styles.dayFilterClear}>
                  <Text style={styles.dayFilterClearText}>{t('expenses_show_all')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        }
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
        scrollY={headerScroll}
      />

      {/* Лимиты: не отдельный экран стека, а разворот этого же блока
          расходов на весь экран — потому и рендерится прямо тут, поверх
          остального контента, а не через navigation.navigate. */}
      {limitsOpen && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.limitsOverlay,
            {
              opacity: limitsAnim,
              transform: [
                { scale: limitsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
              ],
            },
          ]}
        >
          <LimitsScreen onBack={closeLimits} />
        </Animated.View>
      )}

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
  limitsOverlay: {
    backgroundColor: colors.background,
    zIndex: 100,
  },
  listContent: {
    padding: 20,
    paddingTop: 16,
    // Чтобы плавающая «+» не закрывала последний чек в списке.
    paddingBottom: 110,
  },
  scrollHeader: {
    paddingTop: 42,
    paddingBottom: 20,
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
    backgroundColor: colors.accentSoft,
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
    borderWidth: 2,
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
  calendarSwipeSurface: {
    userSelect: 'none',
  },
  calendarContent: {
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
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  walletRowLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  walletRowAmount: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  walletDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -6,
    paddingLeft: 28,
  },
  walletDetailsLabel: {
    color: colors.textSecondary,
    fontSize: 13,
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
  calendarNavTitle: {
    textAlign: 'center',
  },
  calendarSummary: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 12,
    paddingBottom: 6,
  },
  calendarSummaryLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  calendarSummaryAmount: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 7,
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
    height: 38,
    padding: 1,
  },
  dayInner: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  daySpent: {
    backgroundColor: colors.accent,
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  daySelected: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  dayText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  dayTextSpent: {
    color: colors.background,
    fontWeight: '700',
  },
  daySpentAmount: {
    color: colors.background,
    fontSize: 8,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: colors.textPrimary,
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
  emptyMonth: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  emptyMonthText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyMonthAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 12,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: 15,
  },
  monthHeaderText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  monthHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Стрелка поворачивается вниз у раскрытого месяца — привычный знак
  // сворачиваемого раздела.
  monthChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  monthHeaderLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  monthHeaderMeta: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 18,
    paddingBottom: 4,
  },
  dayHeaderLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  dayHeaderTotal: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  receiptsEmpty: {
    paddingVertical: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  receiptsEmptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  limitsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  limitsLinkText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  barTrack: {
    height: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
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
    alignItems: 'stretch',
    paddingTop: 76,
  },
  walletBalanceBig: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
  },
  walletCaption: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 3,
  },
  walletStrip: {
    marginTop: 44,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  walletStripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 8,
  },
  walletStripLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  walletSubIncome: {
    color: colors.textPrimary,
    fontSize: 15,
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
    backgroundColor: '#000000',
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
