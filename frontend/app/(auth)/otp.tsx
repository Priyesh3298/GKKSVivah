import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { t, type Lang } from '../../lib/i18n';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const OTP_LENGTH = 6;

export default function OtpScreen() {
  const { phone, lang: paramLang } = useLocalSearchParams<{ phone: string; lang: string }>();
  const lang = (paramLang === 'gu' ? 'gu' : 'en') as Lang;

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    const timer = setTimeout(() => inputRefs.current[0]?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [digits]);

  const handleKeyPress = useCallback((index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const otp = digits.join('');

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH) {
      setError(lang === 'gu' ? '6 અંક દાખલ કરો.' : 'Enter all 6 digits.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Verification failed');

      await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });

      // New users → role selection; returning users → home
      if (body.is_new_user) {
        router.replace('/(onboarding)/role-select');
      } else {
        router.replace('/');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, turnstile_token: 'RESEND_BYPASS' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to resend');
      setCooldown(60);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 200);
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP.');
    } finally {
      setIsResending(false);
    }
  };

  const maskedPhone = phone
    ? String(phone).replace(/(\+91)(\d{3})(\d{4})(\d{3})/, '$1 $2-XXXX-$4')
    : '';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backTxt}>← {t('changeNumber', lang)}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Text style={styles.om}>🕉</Text>
          <Text style={styles.title}>{t('otpTitle', lang)}</Text>
          <Text style={styles.subtitle}>{t('otpSentTo', lang)}</Text>
          <Text style={styles.phone}>{maskedPhone}</Text>
          <Text style={styles.viaTxt}>{t('viaWhatsApp', lang)}</Text>

          {/* 6-cell OTP Input */}
          <View style={styles.otpRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={ref => { inputRefs.current[i] = ref; }}
                style={[styles.otpBox, !!d && styles.otpBoxFilled]}
                value={d}
                onChangeText={v => handleDigit(i, v)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
              />
            ))}
          </View>

          {/* Error */}
          {!!error && <Text style={styles.errorTxt}>{error}</Text>}

          {/* Verify Button */}
          <TouchableOpacity
            style={[styles.btn, (otp.length < OTP_LENGTH || loading) && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={otp.length < OTP_LENGTH || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFBEB" />
            ) : (
              <Text style={styles.btnTxt}>{t('verify', lang)}</Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={styles.resendRow}>
            {cooldown > 0 ? (
              <Text style={styles.resendCooldown}>
                {t('resendIn', lang)} {cooldown}{t('seconds', lang)}
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend} disabled={isResending}>
                <Text style={styles.resendBtn}>
                  {isResending ? '…' : t('resend', lang)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backTxt: { fontSize: 14, color: '#92400E', fontWeight: '600' },

  body: { flex: 1, paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' },
  om: { fontSize: 38, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1917', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#78716C', textAlign: 'center' },
  phone: { fontSize: 17, fontWeight: '700', color: '#92400E', marginTop: 4, letterSpacing: 0.5 },
  viaTxt: { fontSize: 13, color: '#A8A29E', marginTop: 3, marginBottom: 28 },

  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  otpBox: {
    width: 46, height: 56, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E7E5E4',
    backgroundColor: '#FFFFFF',
    fontSize: 22, fontWeight: '700', color: '#1C1917',
    textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#92400E', backgroundColor: '#FEF3C7' },

  errorTxt: {
    fontSize: 13, color: '#DC2626', fontWeight: '500',
    marginBottom: 12, textAlign: 'center',
  },

  btn: {
    width: '100%', backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 16,
    shadowColor: '#92400E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { backgroundColor: '#D6D3D1', shadowOpacity: 0 },
  btnTxt: { fontSize: 16, fontWeight: '800', color: '#FFFBEB', letterSpacing: 0.3 },

  resendRow: { alignItems: 'center' },
  resendCooldown: { fontSize: 13, color: '#A8A29E' },
  resendBtn: { fontSize: 14, color: '#92400E', fontWeight: '700' },
});
