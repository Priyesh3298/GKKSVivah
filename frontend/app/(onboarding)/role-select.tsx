import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

const ROLES = [
  {
    key: 'candidate' as const,
    en: 'I am a Candidate',
    gu: 'હું ઉમેદવાર છું',
    descEn: 'Looking for a life partner',
    descGu: 'જીવનસાથી શોધી રહ્૯ો છું',
    icon: '👤',
  },
  {
    key: 'parent' as const,
    en: 'I am a Parent',
    gu: 'હું માતા-પિતા છું',
    descEn: 'Looking for my child’s match',
    descGu: 'મારા સંતાન માટે જોડી શોધી રહ્૯ો/રહી છું',
    icon: '👪',
  },
];

export default function RoleSelectScreen() {
  const [lang, setLang] = useState<'en' | 'gu'>('en');
  const [loading, setLoading] = useState<'candidate' | 'parent' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('lang').then(v => {
      if (v === 'en' || v === 'gu') setLang(v as 'en' | 'gu');
    });
  }, []);

  const select = async (role: 'candidate' | 'parent') => {
    setLoading(role);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${BACKEND_URL}/api/auth/set-role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to set role');

      if (role === 'candidate') {
        router.replace('/(onboarding)/claim-profile');
      } else {
        router.replace('/');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.logo}>Shree GKKS Vivah</Text>
        <Text style={styles.title}>
          {lang === 'gu' ? 'તમારી ભૂમિકા પસંદ કરો' : 'How are you joining?'}
        </Text>
        <Text style={styles.subtitle}>
          {lang === 'gu' ? 'તમારી ભૂમિકા બદલી શકાતી નથી.' : 'This cannot be changed later.'}
        </Text>

        {ROLES.map(r => (
          <TouchableOpacity
            key={r.key}
            style={styles.card}
            onPress={() => select(r.key)}
            disabled={loading !== null}
            activeOpacity={0.85}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardIcon}>{r.icon}</Text>
              <View>
                <Text style={styles.cardTitle}>{lang === 'gu' ? r.gu : r.en}</Text>
                <Text style={styles.cardDesc}>{lang === 'gu' ? r.descGu : r.descEn}</Text>
              </View>
            </View>
            {loading === r.key ? (
              <ActivityIndicator color="#92400E" />
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </TouchableOpacity>
        ))}

        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 48, alignItems: 'center' },
  logo: { fontSize: 28, fontWeight: '800', color: '#92400E', marginBottom: 12, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#1C1917', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#78716C', textAlign: 'center', marginBottom: 36 },
  card: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 20, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  cardIcon: { fontSize: 32 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1917', marginBottom: 2 },
  cardDesc: { fontSize: 13, color: '#78716C' },
  chevron: { fontSize: 22, color: '#92400E', fontWeight: '700' },
  error: { fontSize: 13, color: '#DC2626', marginTop: 12, textAlign: 'center' },
});
