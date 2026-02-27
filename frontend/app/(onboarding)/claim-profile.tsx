import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, FlatList, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type Profile = {
  id: string;
  full_name: string;
  father_name: string;
  dob: string;
  city: string;
  gender: string;
};

export default function ClaimProfileScreen() {
  const [lang, setLang] = useState<'en' | 'gu'>('en');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('lang').then(v => {
      if (v === 'en' || v === 'gu') setLang(v as 'en' | 'gu');
    });
  }, []);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${BACKEND_URL}/api/profiles/search?q=${encodeURIComponent(query)}`,
          { headers: { 'Authorization': `Bearer ${session?.access_token}` } }
        );
        const body = await res.json();
        setResults(body.profiles || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const formatDob = (dob: string) => {
    if (!dob) return '';
    const d = new Date(dob);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleSelect = useCallback((profile: Profile) => {
    router.push({
      pathname: '/(onboarding)/claim-selfie',
      params: { profile_id: profile.id, profile_name: profile.full_name, lang },
    });
  }, [lang]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {lang === 'gu' ? 'તમારી પ્રોફાઇલ શોધો' : 'Find Your Profile'}
        </Text>
        <Text style={styles.subtitle}>
          {lang === 'gu'
            ? 'તમારું નામ અથવા પિતાનું નામ દાખલ કરો'
            : 'Search by your name or father’s name'}
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={lang === 'gu' ? 'નામ લખો…' : 'Type name…'}
          placeholderTextColor="#A8A29E"
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color="#92400E" />}
      </View>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searched && !loading ? (
            <Text style={styles.emptyTxt}>
              {lang === 'gu' ? 'કોઈ પ્રોફાઇલ મળ્૯ું નહીં. એડમિનનો સંપર્ક કરો.' : 'No profile found. Contact the admin.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)} activeOpacity={0.85}>
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.detail}>
                {lang === 'gu' ? 'પિતા:' : 'Father:'} {item.father_name}
              </Text>
              <Text style={styles.detail}>
                {formatDob(item.dob)}{item.city ? ` · ${item.city}` : ''} · {item.gender}
              </Text>
            </View>
            <Text style={styles.claimBtn}>
              {lang === 'gu' ? 'આ મારી છે' : 'This is me'} ›
            </Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.footer}>
        {lang === 'gu'
          ? 'ફક્ત પ્રી-સીડ પ્રોફાઇલ દેખાઈ રહ્૯ા છે'
          : 'Only pre-seeded profiles are shown'}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#1C1917', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#78716C' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', marginHorizontal: 24, marginVertical: 12,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 16, color: '#1C1917' },

  list: { paddingHorizontal: 24, paddingBottom: 80 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardBody: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#1C1917', marginBottom: 3 },
  detail: { fontSize: 13, color: '#78716C', marginBottom: 1 },
  claimBtn: { fontSize: 14, color: '#92400E', fontWeight: '700', paddingLeft: 8 },

  emptyTxt: { fontSize: 14, color: '#A8A29E', textAlign: 'center', marginTop: 32 },
  footer: { fontSize: 11, color: '#A8A29E', textAlign: 'center', paddingBottom: 16 },
});
