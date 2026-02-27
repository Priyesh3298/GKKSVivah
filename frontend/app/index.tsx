import { Text, View, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
import { useRouter } from "expo-router";

export default function Index() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>🕉 GKKS Vivah</Text>
        <Text style={styles.subtitle}>ગુજરાતી સમુદાય મૅટ્રિમૉનિઅલ</Text>
        <Text style={styles.build}>Building…  Step 2 of 25</Text>

        {/* Temporary admin button — will be replaced with full auth in Step 3 */}
        <TouchableOpacity
          testID="admin-import-btn"
          style={styles.adminBtn}
          onPress={() => router.push('/(admin)/import')}
        >
          <Text style={styles.adminBtnText}>📋 Admin: Import Profiles</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 32, fontWeight: '800', color: '#1C1917', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#78716C', marginBottom: 8 },
  build: { fontSize: 12, color: '#A8A29E', marginBottom: 40 },
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
