import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type UserData = {
  role: string | null;
  status: string;
  profile_id: string | null;
};

export default function Index() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Role check: if authenticated but no role set, redirect to role selection
  useEffect(() => {
    if (!session || loading) return;
    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then((data: UserData) => {
        if (!data.role) {
          router.replace('/(onboarding)/role-select');
        } else {
          setUserData(data);
        }
      })
      .catch(() => {});
  }, [session, loading]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.om}>🕉</Text>
          <ActivityIndicator color="#92400E" style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/register" />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>🕉 GKKS Vivah</Text>
        <Text style={styles.subtitle}>ગુજરાતી સમુદાય મૅટ્રિમૉનિઅલ</Text>

        {/* Browse Profiles */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#92400E', marginBottom: 10 }]}
          onPress={() => router.push('/browse')}
        >
          <Text style={styles.actionBtnTxt}>🔍 Browse Profiles</Text>
        </TouchableOpacity>

        {/* Candidate — no profile claimed yet */}
        {userData?.role === 'candidate' && !userData?.profile_id && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#B45309' }]}
            onPress={() => router.push('/(onboarding)/claim-profile')}
          >
            <Text style={styles.actionBtnTxt}>🔍 Claim Your Profile</Text>
          </TouchableOpacity>
        )}

        {/* Candidate — profile pending review */}
        {userData?.role === 'candidate' && userData?.profile_id && (
          <View style={styles.infoBadge}>
            <Text style={styles.infoTxt}>⏳ Profile claim under admin review</Text>
          </View>
        )}

        {/* Parent */}
        {userData?.role === 'parent' && (
          <View style={styles.infoBadge}>
            <Text style={styles.infoTxt}>👨‍👩‍👧 Parent account — Step 6 coming next</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.adminBtn}
          onPress={() => router.push('/(admin)/import')}
        >
          <Text style={styles.adminBtnText}>📋 Admin: Import Profiles</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.adminBtn, { backgroundColor: '#78716C', marginTop: 12 }]}
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/(auth)/register');
          }}
        >
          <Text style={styles.adminBtnText}>↩ Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  om: { fontSize: 48 },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 32, fontWeight: '800', color: '#1C1917', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#78716C', marginBottom: 32 },
  actionBtn: {
    backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
    width: '100%', alignItems: 'center', marginBottom: 16,
  },
  actionBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFBEB' },
  infoBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14,
    width: '100%', marginBottom: 16, alignItems: 'center',
  },
  infoTxt: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  adminBtn: {
    backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
    width: '100%', alignItems: 'center',
  },
  adminBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFBEB' },
});
