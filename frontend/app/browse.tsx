import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, FlatList, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const GENDERS = ['All', 'Male', 'Female'] as const;

type Profile = {
  id: string;
  full_name: string;
  age: number | null;
  city: string;
  gender: string;
};

export default function BrowseScreen() {
  const [gender, setGender] = useState<string>('All');
  const [city, setCity] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchProfiles = useCallback(async (genderOverride?: string) => {
    setLoading(true);
    setSearched(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      const g = genderOverride ?? gender;
      if (g !== 'All') params.set('gender', g);
      if (city.trim()) params.set('city', city.trim());
      if (ageMin) params.set('age_min', ageMin);
      if (ageMax) params.set('age_max', ageMax);
      params.set('limit', '30');

      const res = await fetch(`${BACKEND_URL}/api/profiles/browse?${params}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const body = await res.json();
      setProfiles(body.profiles || []);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [gender, city, ageMin, ageMax]);

  // Load on mount
  useEffect(() => { fetchProfiles('All'); }, []);

  const handleGender = (g: string) => {
    setGender(g);
    fetchProfiles(g);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Browse Profiles</Text>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {/* Gender pills */}
        <View style={styles.genderRow}>
          {GENDERS.map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.pill, gender === g && styles.pillActive]}
              onPress={() => handleGender(g)}
            >
              <Text style={[styles.pillTxt, gender === g && styles.pillTxtActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* City + Age row */}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            placeholder="City"
            placeholderTextColor="#A8A29E"
            value={city}
            onChangeText={setCity}
            returnKeyType="search"
            onSubmitEditing={() => fetchProfiles()}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Age min"
            placeholderTextColor="#A8A29E"
            value={ageMin}
            onChangeText={setAgeMin}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Age max"
            placeholderTextColor="#A8A29E"
            value={ageMax}
            onChangeText={setAgeMax}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={() => fetchProfiles()}>
            <Text style={styles.searchBtnTxt}>Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#92400E" />
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searched ? (
              <Text style={styles.emptyTxt}>No profiles found. Try different filters.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/profile/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>
                  {item.gender === 'Male' ? '👦' : '👧'}
                </Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.meta}>
                  {item.age ? `${item.age} yrs` : '—'}
                  {item.city ? ` · ${item.city}` : ''}
                  {` · ${item.gender}`}
                </Text>
              </View>
              <View style={[
                styles.badge,
                item.gender === 'Male' ? styles.badgeMale : styles.badgeFemale,
              ]}>
                <Text style={styles.badgeTxt}>{item.gender === 'Male' ? 'M' : 'F'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {!loading && searched && (
        <Text style={styles.countTxt}>{profiles.length} profile{profiles.length !== 1 ? 's' : ''} found</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  backBtn: { paddingVertical: 6 },
  backTxt: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800', color: '#1C1917' },

  filters: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E7E5E4', gap: 10,
  },
  genderRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#D6D3D1',
  },
  pillActive: { backgroundColor: '#92400E', borderColor: '#92400E' },
  pillTxt: { fontSize: 13, fontWeight: '600', color: '#78716C' },
  pillTxtActive: { color: '#FFFBEB' },

  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#F5F5F4', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 14, color: '#1C1917',
  },
  searchBtn: {
    backgroundColor: '#92400E', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  searchBtnTxt: { fontSize: 13, fontWeight: '700', color: '#FFFBEB' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center',
  },
  avatarTxt: { fontSize: 24 },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#1C1917', marginBottom: 2 },
  meta: { fontSize: 13, color: '#78716C' },
  badge: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeMale: { backgroundColor: '#DBEAFE' },
  badgeFemale: { backgroundColor: '#FCE7F3' },
  badgeTxt: { fontSize: 12, fontWeight: '800', color: '#1C1917' },
  chevron: { fontSize: 20, color: '#92400E', fontWeight: '700', marginLeft: 4 },

  emptyTxt: { fontSize: 14, color: '#A8A29E', textAlign: 'center', marginTop: 40 },
  countTxt: {
    fontSize: 12, color: '#A8A29E', textAlign: 'center',
    paddingBottom: 12,
  },
});
