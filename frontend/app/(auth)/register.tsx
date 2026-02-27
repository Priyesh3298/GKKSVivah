import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, type Lang } from '../../lib/i18n';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY as string;

function getTurnstileHtml(siteKey: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;background:#fff;display:flex;justify-content:center;align-items:center;min-height:70px}
  <\/style>
</head>
<body>
  <div class="cf-turnstile"
    data-sitekey="${siteKey}"
    data-callback="onSuccess"
    data-error-callback="onError"
    data-expired-callback="onExpired"
    data-theme="light"
    data-size="normal"
  ></div>
  <script>
    function postRN(d){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(d));}catch(e){}}
    function onSuccess(t){postRN({type:'token',value:t});}
    function onError(){postRN({type:'error'});}
    function onExpired(){postRN({type:'expired'});}
  <\/script>
</body>
</html>`;
}

export default function RegisterScreen() {
  const [lang, setLang] = useState<Lang>('en');
  const [phone, setPhone] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem('lang').then(v => {
      if (v === 'en' || v === 'gu') setLang(v as Lang);
    });
  }, []);

  const handleLangToggle = (l: Lang) => {
    setLang(l);
    AsyncStorage.setItem('lang', l);
  };

  const handleWebViewMessage = useCallback((e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'token') {
        setTurnstileToken(data.value);
        setTurnstileError(false);
      } else if (data.type === 'error') {
        setTurnstileError(true);
        setTurnstileToken(null);
      } else if (data.type === 'expired') {
        setTurnstileToken(null);
      }
    } catch {}
  }, []);

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError(lang === 'gu' ? '10 અંકનો ફોન નંબર દાખલ કરો.' : 'Enter a valid 10-digit number.');
      return;
    }
    if (!turnstileToken && Platform.OS !== 'web') {
      setError(lang === 'gu' ? 'સુરક્ષા ચકાસણી પૂર્ણ કરો.' : 'Please complete the security check.');
      return;
    }
    setError('');
    setLoading(true);
    const fullPhone = `+91${digits}`;
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, turnstile_token: turnstileToken || 'WEB_BYPASS' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to send OTP');
      router.push({ pathname: '/(auth)/otp', params: { phone: fullPhone, lang } });
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const phoneFilled = phone.replace(/\D/g, '').length === 10;
  const canSend = phoneFilled && (Platform.OS === 'web' || !!turnstileToken) && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Language Toggle */}
          <View style={styles.langRow}>
            {(['en', 'gu'] as Lang[]).map(l => (
              <TouchableOpacity
                key={l}
                style={[styles.langBtn, lang === l && styles.langBtnActive]}
                onPress={() => handleLangToggle(l)}
              >
                <Text style={[styles.langTxt, lang === l && styles.langTxtActive]}>
                  {l === 'en' ? 'EN' : 'ગુ'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.om}>🕉</Text>
            <Text style={styles.title}>{t('appName', lang)}</Text>
            <Text style={styles.subtitle}>{t('appSubtitle', lang)}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>🔒 {t('inviteOnly', lang)}</Text>
            </View>
          </View>

          {/* Phone Input Card */}
          <View style={styles.card}>
            <Text style={styles.label}>{t('phoneLabel', lang)}</Text>
            <View style={styles.phoneRow}>
              <View style={styles.countryCode}>
                <Text style={styles.flag}>🇮🇳</Text>
                <Text style={styles.dialCode}>+91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder={t('phonePlaceholder', lang)}
                placeholderTextColor="#A8A29E"
                keyboardType="number-pad"
                maxLength={12}
                value={phone}
                onChangeText={v => { setPhone(v); setError(''); }}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Turnstile CAPTCHA */}
          <View style={styles.captchaCard}>
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={styles.webBypass}
                onPress={() => setTurnstileToken('WEB_BYPASS')}
              >
                <Text style={styles.webBypassTxt}>
                  {turnstileToken
                    ? '✓ ' + t('captchaDone', lang)
                    : t('captchaPrompt', lang) + ' (tap to verify)'
                  }
                </Text>
              </TouchableOpacity>
            ) : turnstileToken ? (
              <Text style={styles.captchaDone}>✓ {t('captchaDone', lang)}</Text>
            ) : (
              <>
                <Text style={styles.captchaLabel}>{t('captchaPrompt', lang)}</Text>
                {turnstileError ? (
                  <TouchableOpacity
                    onPress={() => { setTurnstileError(false); webviewRef.current?.reload(); }}
                  >
                    <Text style={styles.captchaRetry}>CAPTCHA failed — tap to retry</Text>
                  </TouchableOpacity>
                ) : (
                  <WebView
                    ref={webviewRef}
                    source={{ html: getTurnstileHtml(TURNSTILE_SITE_KEY) }}
                    style={styles.webview}
                    onMessage={handleWebViewMessage}
                    javaScriptEnabled
                    domStorageEnabled
                    originWhitelist={['*']}
                    scrollEnabled={false}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                  />
                )}
              </>
            )}
          </View>

          {/* Error */}
          {!!error && <Text style={styles.errorTxt}>{error}</Text>}

          {/* Send OTP Button */}
          <TouchableOpacity
            style={[styles.btn, !canSend && styles.btnDisabled]}
            onPress={handleSendOtp}
            disabled={!canSend}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFBEB" />
            ) : (
              <Text style={styles.btnTxt}>{t('sendOtp', lang)}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footerTxt}>
            {lang === 'gu'
              ? 'OTP WhatsApp પર મોકલવામાં આવશે'
              : 'OTP will be sent to your WhatsApp'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },

  langRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 8 },
  langBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#D6D3D1',
  },
  langBtnActive: { backgroundColor: '#92400E', borderColor: '#92400E' },
  langTxt: { fontSize: 13, fontWeight: '600', color: '#78716C' },
  langTxtActive: { color: '#FFFBEB' },

  hero: { alignItems: 'center', marginTop: 12, marginBottom: 28 },
  om: { fontSize: 44, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1917', letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: '#78716C', marginTop: 4 },
  badge: {
    marginTop: 10, backgroundColor: '#FEF3C7',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
  },
  badgeTxt: { fontSize: 12, color: '#92400E', fontWeight: '600' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, marginBottom: 12,
  },
  label: {
    fontSize: 12, fontWeight: '700', color: '#78716C',
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countryCode: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5F5F4', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 13,
  },
  flag: { fontSize: 18 },
  dialCode: { fontSize: 15, fontWeight: '700', color: '#1C1917' },
  phoneInput: {
    flex: 1, fontSize: 18, fontWeight: '600', color: '#1C1917',
    backgroundColor: '#F5F5F4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, letterSpacing: 1,
  },

  captchaCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    alignItems: 'center', minHeight: 82,
    justifyContent: 'center',
  },
  captchaLabel: { fontSize: 13, color: '#78716C', marginBottom: 8, fontWeight: '500' },
  captchaDone: { fontSize: 14, color: '#15803D', fontWeight: '700', paddingVertical: 12 },
  captchaRetry: { fontSize: 13, color: '#DC2626', fontWeight: '600', paddingVertical: 8 },
  webview: { width: 310, height: 68 },
  webBypass: { paddingVertical: 12, paddingHorizontal: 20 },
  webBypassTxt: { fontSize: 14, color: '#92400E', fontWeight: '600' },

  errorTxt: {
    fontSize: 13, color: '#DC2626', textAlign: 'center',
    marginBottom: 8, fontWeight: '500',
  },

  btn: {
    backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 4, marginBottom: 12,
    shadowColor: '#92400E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { backgroundColor: '#D6D3D1', shadowOpacity: 0 },
  btnTxt: { fontSize: 16, fontWeight: '800', color: '#FFFBEB', letterSpacing: 0.3 },

  footerTxt: { fontSize: 12, color: '#A8A29E', textAlign: 'center' },
});
