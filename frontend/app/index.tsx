import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export default function Index() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
        <Text style={styles.build}>Step 3 Complete — Registration ✓</Text>

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
  subtitle: { fontSize: 16, color: '#78716C', marginBottom: 8 },
  build: { fontSize: 12, color: '#15803D', marginBottom: 40, fontWeight: '600' },
  adminBtn: {
    backgroundColor: '#92400E',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
  },
  adminBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFBEB' },
});
