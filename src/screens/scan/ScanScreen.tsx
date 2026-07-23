import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Check, CircleHelp, Image as ImageIcon, Zap, ZapOff, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { submitScan } from '../../services/receipts/backgroundScan';
import { enqueueScan, isNetworkError } from '../../services/offlineQueue/offlineQueue';
import { useT } from '../../i18n/useT';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import type { AppStackParamList, QueuedPhoto } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AppStackParamList, 'Scan'>;

// Отступ вокруг рамки при вырезке (в экранных пикселях) — чтобы не срезать края чека.
const CROP_MARGIN = 16;

// Этот экран — оверлей поверх живой камеры (или чёрного экрана до выдачи
// разрешения), а не обычный themedStyles-фон. Управляющие элементы должны
// оставаться светлыми ВСЕГДА, а не следовать теме приложения — иначе в
// светлой теме colors.textPrimary становится тёмным и иконки/текст на
// тёмной полупрозрачной подложке (или чёрном фоне) пропадают из виду.
const OVERLAY_TEXT = '#FFFFFF';
const OVERLAY_DARK = '#0A0A0C';

export function ScanScreen({ navigation }: Props) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [capturedPhotos, setCapturedPhotos] = useState<QueuedPhoto[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const frameRect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const userId = useAuthStore((state) => state.session?.user.id);
  const baseCurrency = useSettingsStore((state) => state.settings?.currency ?? 'CZK');
  const showToast = useToastStore((state) => state.show);

  // "Скан" вместо фото: превью камеры растянуто как resizeMode=cover, поэтому
  // пересчитываем экранные координаты зелёной рамки в координаты снимка и
  // вырезаем только её содержимое (с небольшим запасом).
  function frameCropRect(photoWidth: number, photoHeight: number) {
    const frame = frameRect.current;
    if (!frame || frame.width === 0) return null;

    const scale = Math.max(photoWidth / screenWidth, photoHeight / screenHeight);
    const offsetX = (photoWidth - screenWidth * scale) / 2;
    const offsetY = (photoHeight - screenHeight * scale) / 2;

    const originX = Math.max(0, offsetX + (frame.x - CROP_MARGIN) * scale);
    const originY = Math.max(0, offsetY + (frame.y - CROP_MARGIN) * scale);
    const width = Math.min(photoWidth - originX, (frame.width + CROP_MARGIN * 2) * scale);
    const height = Math.min(photoHeight - originY, (frame.height + CROP_MARGIN * 2) * scale);

    if (width < 100 || height < 100) return null;
    return { originX, originY, width, height };
  }

  async function captureAndAdd(uri: string, crop?: { originX: number; originY: number; width: number; height: number } | null) {
    setIsCapturing(true);
    setProcessingError(null);
    try {
      const actions: ImageManipulator.Action[] = [];
      if (crop) actions.push({ crop });
      actions.push({ resize: { width: 1600 } });
      const manipulated = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (!manipulated.base64) {
        throw new Error(t('scan_prepare_failed'));
      }
      setCapturedPhotos((prev) => [...prev, { uri: manipulated.uri, base64: manipulated.base64! }]);
    } catch (err) {
      Alert.alert(t('scan_error_title'), err instanceof Error ? err.message : t('scan_prepare_failed'));
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleCapture() {
    if (!cameraRef.current || isCapturing || isProcessing) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (photo?.uri) {
      await captureAndAdd(photo.uri, frameCropRect(photo.width, photo.height));
    }
  }

  async function handlePickFromGallery() {
    if (isCapturing || isProcessing) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      await captureAndAdd(result.assets[0].uri);
    }
  }

  function confirmDiscardLast() {
    if (capturedPhotos.length === 0) return;
    Alert.alert(t('scan_discard_title'), t('scan_discard_body'), [
      { text: t('common_cancel'), style: 'cancel' },
      { text: t('common_delete'), style: 'destructive', onPress: () => setCapturedPhotos((prev) => prev.slice(0, -1)) },
    ]);
  }

  // Без экрана ожидания: фото сразу становятся чеками со статусом
  // «Обрабатывается» в «Расходах», Gemini работает в фоне.
  async function handleConfirm() {
    if (capturedPhotos.length === 0 || isProcessing || !userId) return;
    const queue = capturedPhotos;
    setCapturedPhotos([]);
    setProcessingError(null);
    setIsProcessing(true);

    let submitted = 0;
    for (let i = 0; i < queue.length; i++) {
      const { error } = await submitScan(userId, queue[i].base64, baseCurrency);
      if (error) {
        if (isNetworkError(error)) {
          // §12.1: без сети — оставшиеся фото в локальную очередь.
          for (const item of queue.slice(i)) await enqueueScan(item.base64);
          setIsProcessing(false);
          Alert.alert(t('scan_no_connection_title'), t('scan_no_connection_body'), [
            { text: t('scan_got_it'), onPress: () => navigation.goBack() },
          ]);
          return;
        }
        setIsProcessing(false);
        setCapturedPhotos(queue.slice(i));
        setProcessingError(error);
        return;
      }
      submitted++;
    }

    setIsProcessing(false);
    showToast(submitted === 1 ? t('scan_receipt_added') : t('scan_receipts_added', { count: submitted }));
    navigation.goBack();
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>{t('scan_permission_title')}</Text>
        <Text style={styles.permissionSubtitle}>{t('scan_permission_body')}</Text>
        <PrimaryButton label={t('scan_permission_allow')} onPress={requestPermission} />
        <PrimaryButton label={t('common_cancel')} variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const lastPhoto = capturedPhotos[capturedPhotos.length - 1];

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} />

      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
          <X color={OVERLAY_TEXT} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>{t('scan_title')}</Text>
        <Pressable
          style={styles.iconButton}
          onPress={() => Alert.alert(t('scan_hint_title'), t('scan_hint_body'))}
        >
          <CircleHelp color={OVERLAY_TEXT} size={22} />
        </Pressable>
      </View>

      <View style={styles.frameWrap} pointerEvents="none">
        <View
          style={styles.frame}
          onLayout={(e) => {
            // frameWrap занимает весь экран, поэтому координаты layout — экранные.
            const { x, y, width, height } = e.nativeEvent.layout;
            frameRect.current = { x, y, width, height };
          }}
        >
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <Text style={styles.hint}>{t('scan_frame_hint')}</Text>
      </View>

      {processingError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{processingError}</Text>
        </View>
      )}

      <View style={styles.bottomBar}>
        <View style={styles.sideGroup}>
          <Pressable style={styles.iconButton} onPress={handlePickFromGallery} disabled={isCapturing || isProcessing}>
            <ImageIcon color={OVERLAY_TEXT} size={24} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
            disabled={isProcessing}
          >
            {flash === 'off' ? (
              <ZapOff color={OVERLAY_TEXT} size={22} />
            ) : (
              <Zap color={colors.accent} size={22} />
            )}
          </Pressable>
        </View>

        <Pressable style={styles.shutter} onPress={handleCapture} disabled={isCapturing || isProcessing}>
          {isCapturing ? <ActivityIndicator color={OVERLAY_DARK} /> : <View style={styles.shutterInner} />}
        </Pressable>

        <View style={[styles.sideGroup, styles.sideGroupRight]}>
          {lastPhoto && (
            <View style={styles.thumbWrap}>
              <Pressable
                style={styles.thumbnailButton}
                onPress={confirmDiscardLast}
                disabled={isProcessing}
                accessibilityLabel={t('scan_last_photo_a11y')}
              >
                <Image source={{ uri: lastPhoto.uri }} style={styles.thumbnailImage} />
              </Pressable>
              {capturedPhotos.length > 1 && (
                <View style={styles.countBadge} pointerEvents="none">
                  <Text style={styles.countBadgeText}>{capturedPhotos.length}</Text>
                </View>
              )}
            </View>
          )}
          {capturedPhotos.length > 0 && (
            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={isProcessing || isCapturing}>
              {isProcessing ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Check color={colors.background} size={26} />
              )}
            </Pressable>
          )}
        </View>
      </View>

      {capturedPhotos.length > 0 && !isProcessing && (
        <Text style={styles.queueHint}>
          {capturedPhotos.length === 1
            ? t('scan_queue_hint_one')
            : t('scan_queue_hint_many', { count: capturedPhotos.length })}
        </Text>
      )}

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.processingText}>{t('scan_uploading')}</Text>
        </View>
      )}
    </View>
  );
}

const FRAME_WIDTH = 300;
const FRAME_HEIGHT = 420;
const CORNER_SIZE = 28;

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  permissionTitle: {
    color: OVERLAY_TEXT,
    fontSize: 20,
    fontWeight: '600',
  },
  permissionSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  topTitle: {
    color: OVERLAY_TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(28,28,31,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.accent,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  hint: {
    color: OVERLAY_TEXT,
    fontSize: 14,
    backgroundColor: 'rgba(28,28,31,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 150,
    left: 20,
    right: 20,
    backgroundColor: colors.error,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: OVERLAY_TEXT,
    fontSize: 13,
    textAlign: 'center',
  },
  queueHint: {
    position: 'absolute',
    bottom: 138,
    left: 20,
    right: 20,
    color: OVERLAY_TEXT,
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(28,28,31,0.7)',
    paddingVertical: 8,
    borderRadius: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sideGroupRight: {
    justifyContent: 'flex-end',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: OVERLAY_TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: OVERLAY_DARK,
  },
  thumbWrap: {
    width: 40,
    height: 40,
  },
  thumbnailButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: OVERLAY_TEXT,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
  },
  confirmButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,12,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  processingText: {
    color: OVERLAY_TEXT,
    fontSize: 15,
  },
}));
