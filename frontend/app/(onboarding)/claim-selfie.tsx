import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Image, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export default function ClaimSelfieScreen() {
  const { profile_id, profile_name, lang: paramLang } = useLocalSearchParams<{
    profile_id: string; profile_name: string; lang: string;
  }>();
  const lang = paramLang === 'gu' ? 'gu' : 'en';

  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const takeSelfie = async () => {
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setError(lang === 'gu' ? 'કેમેરા પરવાનગી જરૂરી છે.' : 'Camera permission required.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
          cameraType: ImagePicker.CameraType.front,
        });
        if (!result.canceled && result.assets[0]) {
          setSelfieUri(result.assets[0].uri);
          setSelfieBase64(result.assets[0].base64 || null);
        }
      } else {
        // Web: use image library (file picker)
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          setSelfieUri(result.assets[0].uri);
          setSelfieBase64(result.assets[0].base64 || null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to capture image.');
    }
  };

  const handleSubmit = async () => {
    if (!selfieBase64) {
      setError(lang === 'gu' ? 'પહેલા સેલફી લો.' : 'Please take a selfie first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND_URL}/api/profiles/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ profile_id, selfie_base64: selfieBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Claim failed');
      router.replace('/');
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← {lang === 'gu' ? 'પાછળ' : 'Back'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>
          {lang === 'gu' ? 'સેલફી લો' : 'Take a Selfie'}
        </Text>
        <Text style={styles.profileName}>"{profile_name}"</Text>
        <Text style={styles.instructions}>
          {lang === 'gu'
            ? 'આમનાબામના કેમેરા વડે કહો જે આ પ્રોફાઇલ તમારી છે'
            : 'Use your front camera to confirm this is your profile'}
        </Text>

        {/* Selfie Preview */}
        <TouchableOpacity style={styles.selfieBox} onPress={takeSelfie}>
          {selfieUri ? (
            <Image source={{ uri: selfieUri }} style={styles.selfieImg} />
          ) : (
            <View style={styles.selfieEmpty}>
              <Text style={styles.selfieEmoji}>🤳</Text>
              <Text style={styles.selfiePrompt}>
                {lang === 'gu' ? 'ટેપ કરીને સેલફી લો' : 'Tap to take selfie'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {selfieUri && (
          <TouchableOpacity onPress={takeSelfie}>
            <Text style={styles.retake}>
              {lang === 'gu' ? 'ફરી થી લો' : 'Retake'}
            </Text>
          </TouchableOpacity>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, (!selfieBase64 || loading) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!selfieBase64 || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFBEB" />
          ) : (
            <Text style={styles.btnTxt}>
              {lang === 'gu' ? 'ક્લેઇમ સબમિટ કરો' : 'Submit Claim'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          {lang === 'gu'
            ? 'એડમિન 24 કલાકમાં સમીક્ષા કરશે.'
            : 'An admin will review and approve within 24 hours.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEB' },
  header: { paddingHorizontal: 20, paddingTop: 14 },
  back: { fontSize: 14, color: '#92400E', fontWeight: '600', paddingVertical: 8 },

  body: { flex: 1, paddingHorizontal: 28, paddingTop: 16, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1917', marginBottom: 4 },
  profileName: { fontSize: 16, color: '#92400E', fontWeight: '700', marginBottom: 8 },
  instructions: { fontSize: 13, color: '#78716C', textAlign: 'center', marginBottom: 24 },

  selfieBox: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#E7E5E4',
    overflow: 'hidden', marginBottom: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  selfieImg: { width: 200, height: 200, borderRadius: 100 },
  selfieEmpty: { alignItems: 'center', gap: 8 },
  selfieEmoji: { fontSize: 40 },
  selfiePrompt: { fontSize: 13, color: '#A8A29E' },

  retake: { fontSize: 13, color: '#92400E', fontWeight: '600', marginBottom: 16 },
  error: { fontSize: 13, color: '#DC2626', textAlign: 'center', marginBottom: 8 },

  btn: {
    width: '100%', backgroundColor: '#92400E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 12,
  },
  btnDisabled: { backgroundColor: '#D6D3D1' },
  btnTxt: { fontSize: 16, fontWeight: '800', color: '#FFFBEB' },

  note: { fontSize: 12, color: '#A8A29E', textAlign: 'center' },
});
