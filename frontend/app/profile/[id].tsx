import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type ProfileDetail = {
  id: string;
  full_name: string;
  age: number | null;
  city: string;
  gender: string;
  education: string | null;
  profession: string | null;
  employer: string | null;
  about_me: string | null;
  photos: string[];
  income_range: string | null;
  marital_status: string | null;
};

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingInterest, setSendingInterest] = useState(false);
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [shortlistLoading, setShortlistLoading] = useState(false);

  useEffect(() => {
    fetchProfile();
    checkShortlist();
  }, [id]);

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND_URL}/api/profiles/${id}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load profile');
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const checkShortlist = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND_URL}/api/shortlist/check/${id}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setIsShortlisted(data.is_shortlisted);
      }
    } catch (err) {
      // Silent fail for shortlist check
    }
  };

  const toggleShortlist = async () => {
    setShortlistLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const method = isShortlisted ? 'DELETE' : 'POST';
      const res = await fetch(`${BACKEND_URL}/api/shortlist/${id}`, {
        method,
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        setIsShortlisted(!isShortlisted);
      }
    } catch (err) {
      alert('Failed to update shortlist');
    } finally {
      setShortlistLoading(false);
    }
  };

  const handleSendInterest = async () => {
    // TODO: Implement send interest API call
    setSendingInterest(true);
    setTimeout(() => {
      setSendingInterest(false);
      alert('Interest sent! (Feature will be implemented in next steps)');
    }, 1000);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#92400E" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorTxt}>{error || 'Profile not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonTxt}>← Go Back</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Profile Details</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Photo */}
        <View style={styles.photoContainer}>
          {profile.photos && profile.photos.length > 0 ? (
            <Image
              source={{ uri: profile.photos[0] }}
              style={styles.photo}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>
                {profile.gender === 'Male' ? '👦' : '👧'}
              </Text>
            </View>
          )}
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.name}>{profile.full_name}</Text>
          <Text style={styles.basicInfo}>
            {profile.age ? `${profile.age} years` : 'Age not available'}
            {profile.city ? ` · ${profile.city}` : ''}
          </Text>
          <View style={styles.genderBadge}>
            <Text style={styles.genderBadgeTxt}>{profile.gender}</Text>
          </View>
        </View>

        {/* Education & Profession */}
        {(profile.education || profile.profession) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education & Career</Text>
            {profile.education && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Education:</Text>
                <Text style={styles.infoValue}>{profile.education}</Text>
              </View>
            )}
            {profile.profession && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Profession:</Text>
                <Text style={styles.infoValue}>{profile.profession}</Text>
              </View>
            )}
            {profile.employer && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Employer:</Text>
                <Text style={styles.infoValue}>{profile.employer}</Text>
              </View>
            )}
            {profile.income_range && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Income:</Text>
                <Text style={styles.infoValue}>{profile.income_range}</Text>
              </View>
            )}
          </View>
        )}

        {/* About/Bio */}
        {profile.about_me && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioTxt}>{profile.about_me}</Text>
          </View>
        )}

        {/* Additional Info */}
        {profile.marital_status && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Marital Status:</Text>
              <Text style={styles.infoValue}>{profile.marital_status}</Text>
            </View>
          </View>
        )}

        {/* Spacer for button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Send Interest Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.interestBtn}
          onPress={handleSendInterest}
          disabled={sendingInterest}
          activeOpacity={0.8}
        >
          {sendingInterest ? (
            <ActivityIndicator color="#FFFBEB" />
          ) : (
            <Text style={styles.interestBtnTxt}>💌 Send Interest</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorTxt: { fontSize: 16, color: '#DC2626', textAlign: 'center', marginBottom: 20 },
  backButton: {
    backgroundColor: '#92400E', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  backButtonTxt: { fontSize: 15, fontWeight: '700', color: '#FFFBEB' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E7E5E4',
  },
  backBtn: { paddingVertical: 6 },
  backTxt: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1C1917' },

  scroll: { flex: 1 },

  photoContainer: {
    width: '100%', height: 400, backgroundColor: '#F5F5F4',
    alignItems: 'center', justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center',
  },
  photoPlaceholderIcon: { fontSize: 120 },

  section: {
    backgroundColor: '#FFFFFF', marginTop: 12,
    paddingHorizontal: 20, paddingVertical: 20,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E7E5E4',
  },

  name: { fontSize: 28, fontWeight: '800', color: '#1C1917', marginBottom: 6 },
  basicInfo: { fontSize: 16, color: '#78716C', marginBottom: 12 },
  genderBadge: {
    alignSelf: 'flex-start', backgroundColor: '#FEF3C7',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  genderBadgeTxt: { fontSize: 13, fontWeight: '700', color: '#92400E' },

  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: '#1C1917',
    marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  infoRow: { flexDirection: 'row', marginBottom: 10, flexWrap: 'wrap' },
  infoLabel: { fontSize: 15, fontWeight: '600', color: '#78716C', width: 120 },
  infoValue: { fontSize: 15, color: '#1C1917', flex: 1 },

  bioTxt: { fontSize: 15, color: '#1C1917', lineHeight: 22 },

  footer: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#E7E5E4',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
  },
  interestBtn: {
    backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#92400E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  interestBtnTxt: { fontSize: 17, fontWeight: '800', color: '#FFFBEB', letterSpacing: 0.3 },
});
