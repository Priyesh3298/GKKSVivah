import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, FlatList, ActivityIndicator, Image,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type ShortlistProfile = {
  id: string;
  full_name: string;
  age: number | null;
  city: string;
  gender: string;
  education: string | null;
  profession: string | null;
  photos: string[];
};

export default function ShortlistScreen() {
  const [profiles, setProfiles] = useState<ShortlistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchShortlist();
  }, []);

  const fetchShortlist = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND_URL}/api/shortlist`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProfiles(data.profiles || []);
      }
    } catch (err) {
      console.error('Failed to fetch shortlist:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchShortlist();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My Shortlist</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#92400E" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Shortlist</Text>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>❤️</Text>
            <Text style={styles.emptyTitle}>No Saved Profiles</Text>
            <Text style={styles.emptyText}>
              Profiles you save will appear here.{'\n'}
              Tap the heart icon on any profile to add it.
            </Text>
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => router.push('/browse')}
            >
              <Text style={styles.browseBtnTxt}>Browse Profiles</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/profile/${item.id}`)}
            activeOpacity={0.7}
          >
            {/* Profile Photo */}
            <View style={styles.photoContainer}>
              {item.photos && item.photos.length > 0 ? (
                <Image
                  source={{ uri: item.photos[0] }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderIcon}>
                    {item.gender === 'Male' ? '👦' : '👧'}
                  </Text>
                </View>
              )}
            </View>

            {/* Profile Info */}
            <View style={styles.cardInfo}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>
                {item.age ? `${item.age} years` : 'Age not available'}
                {item.city ? ` · ${item.city}` : ''}
              </Text>
              {item.education && (
                <Text style={styles.education} numberOfLines={1}>
                  🎓 {item.education}
                </Text>
              )}
              {item.profession && (
                <Text style={styles.profession} numberOfLines={1}>
                  💼 {item.profession}
                </Text>
              )}
            </View>

            <View style={styles.chevronContainer}>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {profiles.length > 0 && (
        <Text style={styles.countTxt}>
          {profiles.length} saved profile{profiles.length !== 1 ? 's' : ''}
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E7E5E4',
  },
  backBtn: { paddingVertical: 6 },
  backTxt: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800', color: '#1C1917', flex: 1 },

  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },

  photoContainer: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden' },
  photo: { width: 80, height: 80 },
  photoPlaceholder: {
    width: 80, height: 80, backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPlaceholderIcon: { fontSize: 40 },

  cardInfo: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700', color: '#1C1917', marginBottom: 4 },
  meta: { fontSize: 14, color: '#78716C', marginBottom: 4 },
  education: { fontSize: 13, color: '#57534E', marginBottom: 2 },
  profession: { fontSize: 13, color: '#57534E' },

  chevronContainer: { paddingLeft: 8 },
  chevron: { fontSize: 24, color: '#92400E', fontWeight: '700' },

  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 80,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    fontSize: 22, fontWeight: '800', color: '#1C1917',
    marginBottom: 8, textAlign: 'center',
  },
  emptyText: {
    fontSize: 15, color: '#78716C', textAlign: 'center',
    lineHeight: 22, marginBottom: 28,
  },
  browseBtn: {
    backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
  },
  browseBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFBEB' },

  countTxt: {
    fontSize: 12, color: '#A8A29E', textAlign: 'center',
    paddingBottom: 12,
  },
});
