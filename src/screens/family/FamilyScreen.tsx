import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Check, Crown, UserPlus, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { useT } from '../../i18n/useT';
import { translateCategoryName } from '../../i18n/translations';
import type { AppStackParamList } from '../../navigation/types';
import { supabase } from '../../services/api/supabaseClient';
import { avatarUrl } from '../../services/profile/avatarService';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { useToastStore } from '../../store/toastStore';
import { CATEGORY_NAMES } from '../../utils/categoryIconMap';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AppStackParamList, 'Family'>;

type MemberProfile = { user_id: string; nickname: string | null; avatar_path: string | null; updated_at: string };
type Member = { user_id: string; allowed_categories: string[] | null };
type Invite = {
  id: string;
  family_id: string;
  inviter_id: string;
  invitee_id: string;
  allowed_categories: string[] | null;
  status: string;
};

export function FamilyScreen({ navigation }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const userId = useAuthStore((state) => state.session?.user.id);
  const showToast = useToastStore((state) => state.show);

  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, MemberProfile>>({});
  const [incomingInvites, setIncomingInvites] = useState<Invite[]>([]);
  const [inviteId, setInviteId] = useState('');
  const [inviteCategories, setInviteCategories] = useState<string[] | null>(null); // null = все
  const [busy, setBusy] = useState(false);
  const [memberSpend, setMemberSpend] = useState<Record<string, number>>({});
  const [spendCurrency, setSpendCurrency] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const [{ data: myMemberships }, { data: invites }] = await Promise.all([
      supabase.from('family_members').select('family_id').eq('user_id', userId),
      supabase.from('family_invites').select('*').eq('invitee_id', userId).eq('status', 'pending'),
    ]);
    setIncomingInvites(invites ?? []);

    const fid = myMemberships?.[0]?.family_id ?? null;
    setFamilyId(fid);

    if (!fid) {
      setMembers([]);
      setProfiles({});
      setOwnerId(null);
      setLoading(false);
      return;
    }

    const [{ data: fam }, { data: allMembers }] = await Promise.all([
      supabase.from('families').select('owner_id').eq('id', fid).single(),
      supabase.from('family_members').select('user_id, allowed_categories').eq('family_id', fid),
    ]);
    setOwnerId(fam?.owner_id ?? null);
    setMembers(allMembers ?? []);

    const ids = (allMembers ?? []).map((m) => m.user_id);
    if (ids.length > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().slice(0, 10);

      const [{ data: settingsRows }, { data: monthReceipts }] = await Promise.all([
        supabase
          .from('user_settings')
          .select('user_id, nickname, avatar_path, updated_at')
          .in('user_id', ids),
        // Небольшая статистика: кто сколько потратил в этом месяце (видимые чеки).
        supabase
          .from('receipts')
          .select('user_id, total_amount, exchange_rate, base_currency, purchase_date, created_at')
          .in('user_id', ids),
      ]);
      const map: Record<string, MemberProfile> = {};
      (settingsRows ?? []).forEach((p) => (map[p.user_id] = p));
      setProfiles(map);

      const spend: Record<string, number> = {};
      let currency = '';
      (monthReceipts ?? []).forEach((r) => {
        const date = r.purchase_date ?? r.created_at?.slice(0, 10) ?? '';
        if (date < monthStartStr) return;
        spend[r.user_id] = (spend[r.user_id] ?? 0) + (r.total_amount ?? 0) * (r.exchange_rate ?? 1);
        if (!currency && r.base_currency) currency = r.base_currency;
      });
      setMemberSpend(spend);
      setSpendCurrency(currency);
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function createFamily() {
    if (!userId || busy) return;
    setBusy(true);
    const { data: fam, error } = await supabase
      .from('families')
      .insert({ owner_id: userId })
      .select()
      .single();
    if (error || !fam) {
      setBusy(false);
      Alert.alert(t('family_create_failed'), error?.message ?? '');
      return;
    }
    await supabase.from('family_members').insert({ family_id: fam.id, user_id: userId, allowed_categories: null });
    setBusy(false);
    load();
  }

  async function sendInvite() {
    const target = inviteId.trim();
    if (!familyId || !target || busy) return;
    if (target === userId) {
      Alert.alert(t('family_own_id'));
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('family_invites').insert({
      family_id: familyId,
      inviter_id: userId,
      invitee_id: target,
      allowed_categories: inviteCategories,
    });
    setBusy(false);
    if (error) {
      // FK на auth.users отсеет несуществующий ID.
      Alert.alert(t('family_send_invite_failed'), t('family_send_invite_failed_hint'));
      return;
    }
    setInviteId('');
    setInviteCategories(null);
    showToast(t('family_invite_sent'));
  }

  async function acceptInvite(invite: Invite) {
    if (!userId || busy) return;
    setBusy(true);
    await supabase.from('family_invites').update({ status: 'accepted' }).eq('id', invite.id);
    const { error } = await supabase.from('family_members').insert({
      family_id: invite.family_id,
      user_id: userId,
      allowed_categories: invite.allowed_categories,
    });
    setBusy(false);
    if (error) {
      Alert.alert(t('family_join_failed'), error.message);
      return;
    }
    showToast(t('family_joined'));
    load();
  }

  async function declineInvite(invite: Invite) {
    await supabase.from('family_invites').update({ status: 'declined' }).eq('id', invite.id);
    load();
  }

  function confirmLeave() {
    Alert.alert(t('family_leave_title'), t('family_leave_body'), [
      { text: t('common_cancel'), style: 'cancel' },
      {
        text: t('family_leave'),
        style: 'destructive',
        onPress: async () => {
          if (!familyId || !userId) return;
          await supabase.from('family_members').delete().eq('family_id', familyId).eq('user_id', userId);
          load();
        },
      },
    ]);
  }

  function toggleInviteCategory(name: string) {
    setInviteCategories((prev) => {
      if (prev === null) return [name];
      if (prev.includes(name)) {
        const next = prev.filter((c) => c !== name);
        return next.length === 0 ? null : next;
      }
      return [...prev, name];
    });
  }

  function memberName(id: string): string {
    if (id === userId) return t('family_you');
    return profiles[id]?.nickname?.trim() || t('profile_no_name');
  }

  async function copyMemberId(id: string) {
    await Clipboard.setStringAsync(id);
    showToast(t('profile_id_copied'));
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('family_title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {incomingInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('family_invites_section')}</Text>
            {incomingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <Text style={styles.inviteText}>
                  {invite.allowed_categories
                    ? t('family_invited_text_some', {
                        categories: invite.allowed_categories
                          .map((c) => translateCategoryName(c, locale))
                          .join(', '),
                      })
                    : t('family_invited_text_all')}
                </Text>
                <View style={styles.inviteActions}>
                  <Pressable style={styles.acceptButton} onPress={() => acceptInvite(invite)}>
                    <Check color={colors.background} size={16} />
                    <Text style={styles.acceptText}>{t('family_accept')}</Text>
                  </Pressable>
                  <Pressable style={styles.declineButton} onPress={() => declineInvite(invite)}>
                    <X color={colors.textSecondary} size={16} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {!familyId ? (
          <View style={[styles.section, styles.card]}>
            <Text style={styles.emptyText}>{t('family_empty_title')}</Text>
            <PrimaryButton label={t('family_create')} onPress={createFamily} loading={busy} />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('family_members_section', { count: members.length })}</Text>
              <View style={styles.card}>
                {members.map((member, index) => {
                  const profile = profiles[member.user_id];
                  const url = avatarUrl(profile?.avatar_path ?? null, profile?.updated_at);
                  return (
                    <View
                      key={member.user_id}
                      style={[styles.memberRow, index > 0 && styles.memberRowDivider]}
                    >
                      {url ? (
                        <Image source={{ uri: url }} style={styles.memberAvatar} />
                      ) : (
                        <View style={styles.memberAvatarFallback}>
                          <Text style={styles.memberAvatarText}>
                            {(memberName(member.user_id)[0] ?? '?').toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.memberInfo}>
                        <View style={styles.memberNameRow}>
                          <Text style={styles.memberName}>{memberName(member.user_id)}</Text>
                          {member.user_id === ownerId && <Crown color={colors.warning} size={14} />}
                        </View>
                        <Text style={styles.memberSub}>
                          {memberSpend[member.user_id] !== undefined
                            ? `${t('family_spent_this_month', { amount: memberSpend[member.user_id].toFixed(0), currency: spendCurrency })} · `
                            : ''}
                          {member.allowed_categories
                            ? t('family_shares_count', { count: member.allowed_categories.length })
                            : t('family_shares_all')}
                        </Text>
                        <Pressable onPress={() => copyMemberId(member.user_id)} hitSlop={4}>
                          <Text style={styles.memberId} numberOfLines={1} ellipsizeMode="middle">
                            {t('family_id_prefix', { id: member.user_id })}
                          </Text>
                          <Text style={styles.memberIdHint}>{t('family_id_hint')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('family_invite_section')}</Text>
              <View style={[styles.card, styles.inviteCardWrap]}>
                <TextField
                  label={t('family_friend_id_label')}
                  value={inviteId}
                  onChangeText={setInviteId}
                  placeholder={t('family_friend_id_placeholder')}
                  autoCapitalize="none"
                />
                <Text style={styles.categoriesLabel}>
                  {t('family_categories_visible', {
                    value:
                      inviteCategories === null
                        ? t('family_categories_all_short')
                        : `(${inviteCategories.length})`,
                  })}
                </Text>
                <View style={styles.chipsWrap}>
                  <Pressable
                    style={[styles.chip, inviteCategories === null && styles.chipActive]}
                    onPress={() => setInviteCategories(null)}
                  >
                    <Text style={[styles.chipText, inviteCategories === null && styles.chipTextActive]}>
                      {t('family_all_chip')}
                    </Text>
                  </Pressable>
                  {CATEGORY_NAMES.map((name) => {
                    const active = inviteCategories?.includes(name) ?? false;
                    return (
                      <Pressable
                        key={name}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleInviteCategory(name)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {translateCategoryName(name, locale)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PrimaryButton
                  label={t('family_send_invite')}
                  onPress={sendInvite}
                  loading={busy}
                  disabled={!inviteId.trim()}
                />
              </View>
            </View>

            <Pressable style={[styles.card, styles.leaveRow]} onPress={confirmLeave}>
              <UserPlus color={colors.error} size={16} style={{ transform: [{ rotate: '45deg' }] }} />
              <Text style={styles.leaveText}>{t('family_leave_row')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 6,
  },
  inviteCardWrap: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  inviteCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  inviteText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
  },
  inviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  acceptText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '600',
  },
  declineButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  memberRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
  },
  memberAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
  },
  memberId: {
    color: colors.textTertiary,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  memberIdHint: {
    color: colors.textTertiary,
    fontSize: 9,
    marginTop: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  memberSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  categoriesLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.background,
    fontWeight: '600',
  },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  leaveText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
}));
