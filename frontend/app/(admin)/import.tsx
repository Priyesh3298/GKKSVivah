import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Modal, FlatList, ActivityIndicator, Alert, SafeAreaView, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const REQUIRED_FIELDS = ['full_name', 'dob', 'father_name'];

const C = {
  saffron: '#D97706',
  saffronDark: '#92400E',
  saffronLight: '#FEF3C7',
  gold: '#F59E0B',
  cream: '#FFFBEB',
  textDark: '#1C1917',
  textMid: '#57534E',
  textLight: '#A8A29E',
  white: '#FFFFFF',
  success: '#15803D',
  successBg: '#F0FDF4',
  error: '#DC2626',
  errorBg: '#FEF2F2',
  border: '#E7E5E4',
  required: '#B45309',
};

// ─── Types ───────────────────────────────────────────────────
interface ProfileField { value: string; label: string; }
interface PreviewResponse {
  columns: string[];
  mapping: Record<string, string>;
  preview: Record<string, string>[];
  total_rows: number;
  missing_required: string[];
  profile_fields: ProfileField[];
}
interface ImportResult {
  total: number;
  imported?: number;
  will_import?: number;
  duplicates: number;
  errors: number;
  error_details: { row?: number; name?: string; error: string }[];
  dry_run: boolean;
}

// ─── Field Picker Modal ───────────────────────────────────────
function FieldPickerModal({
  visible, fields, selected, onSelect, onClose,
}: {
  visible: boolean;
  fields: ProfileField[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={s.pickerSheet}>
          <View style={s.pickerHandle} />
          <Text style={s.pickerTitle}>Select Profile Field</Text>
          <FlatList
            data={fields}
            keyExtractor={item => item.value || '__ignore__'}
            renderItem={({ item }) => {
              const isSelected = item.value === selected;
              const isReq = REQUIRED_FIELDS.includes(item.value);
              return (
                <TouchableOpacity
                  testID={`field-option-${item.value}`}
                  style={[s.pickerOption, isSelected && s.pickerOptionSelected]}
                  onPress={() => { onSelect(item.value); onClose(); }}
                >
                  <Text style={[s.pickerOptionText, isSelected && s.pickerOptionTextSelected]}>
                    {item.label}
                    {isReq ? ' ✱' : ''}
                  </Text>
                  {isSelected && <Text style={s.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Step Indicator ───────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const steps = ['Select', 'Map', 'Preview', 'Done'];
  return (
    <View style={s.stepBar}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <View key={n} style={s.stepItem}>
            <View style={[s.stepCircle, done && s.stepDone, active && s.stepActive]}>
              <Text style={[s.stepNum, (done || active) && s.stepNumActive]}>
                {done ? '✓' : n}
              </Text>
            </View>
            <Text style={[s.stepLabel, active && s.stepLabelActive]}>{label}</Text>
            {i < steps.length - 1 && <View style={[s.stepLine, done && s.stepLineDone]} />}
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
export default function AdminImportScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [adminSecret, setAdminSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCol, setPickerCol] = useState('');
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Auth gate ──
  if (!authed) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.authContainer}>
          <Text style={s.authTitle}>🔐 Admin Access</Text>
          <Text style={s.authSubtitle}>Enter admin secret to continue</Text>
          <TextInput
            testID="admin-secret-input"
            style={s.authInput}
            placeholder="Admin secret key"
            secureTextEntry
            value={adminSecret}
            onChangeText={setAdminSecret}
            onSubmitEditing={() => { if (adminSecret.trim()) setAuthed(true); }}
          />
          <TouchableOpacity
            testID="admin-auth-btn"
            style={s.primaryBtn}
            onPress={() => { if (adminSecret.trim()) setAuthed(true); }}
          >
            <Text style={s.primaryBtnText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 1: Select File ──
  const pickFile = async () => {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
    await loadPreview(asset);
  };

  const loadPreview = async (asset: { uri: string; name: string; mimeType?: string }) => {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, type: asset.mimeType || 'text/csv', name: asset.name } as any);

      const res = await fetch(`${BACKEND_URL}/api/admin/csv-preview`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': adminSecret },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Preview failed');

      setPreviewData(data);
      setMapping(data.mapping || {});
      setStep(2);
    } catch (e: any) {
      setError(e.message || 'Failed to read CSV');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Confirm mapping → dry run ──
  const runDryRun = async () => {
    if (!file || !previewData) return;
    const missingRequired = REQUIRED_FIELDS.filter(f => !Object.values(mapping).includes(f));
    if (missingRequired.length) {
      setError(`Please map required fields: ${missingRequired.join(', ')}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', { uri: file.uri, type: file.mimeType || 'text/csv', name: file.name } as any);
      formData.append('mapping', JSON.stringify(mapping));
      formData.append('dry_run', 'true');

      const res = await fetch(`${BACKEND_URL}/api/admin/csv-import`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': adminSecret },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Preview failed');
      setDryRunResult(data);
      setStep(3);
    } catch (e: any) {
      setError(e.message || 'Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Confirm import ──
  const runImport = async () => {
    if (!file) return;
    Alert.alert(
      'Confirm Import',
      `Import ${dryRunResult?.will_import ?? 0} profiles into GKKS Vivah?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import', style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setError('');
            try {
              const formData = new FormData();
              formData.append('file', { uri: file.uri, type: file.mimeType || 'text/csv', name: file.name } as any);
              formData.append('mapping', JSON.stringify(mapping));
              formData.append('dry_run', 'false');

              const res = await fetch(`${BACKEND_URL}/api/admin/csv-import`, {
                method: 'POST',
                headers: { 'X-Admin-Secret': adminSecret },
                body: formData,
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || 'Import failed');
              setImportResult(data);
              setStep(4);
            } catch (e: any) {
              setError(e.message || 'Import failed');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const resetAll = () => {
    setStep(1); setFile(null); setPreviewData(null);
    setMapping({}); setDryRunResult(null); setImportResult(null); setError('');
  };

  const mappedRequired = REQUIRED_FIELDS.filter(f => Object.values(mapping).includes(f));
  const allRequiredMapped = mappedRequired.length === REQUIRED_FIELDS.length;

  return (
    <SafeAreaView style={s.safeArea}>
      <StepBar step={step} />
      <ScrollView style={s.container} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Select File ── */}
        {step === 1 && (
          <View testID="step-1-select">
            <Text style={s.sectionTitle}>Import Profiles</Text>
            <Text style={s.bodyText}>
              Upload a CSV file exported from Excel to seed community member profiles.
              All imported profiles will be marked as{' '}
              <Text style={s.badge}>unclaimed</Text> and invisible to app users.
            </Text>

            <View style={s.infoBox}>
              <Text style={s.infoTitle}>✱ Required CSV Columns</Text>
              <Text style={s.infoText}>full_name, dob (DD/MM/YYYY), father_name</Text>
              <Text style={s.infoTitle} style={{ marginTop: 8 }}>○ Optional Columns</Text>
              <Text style={s.infoText}>
                full_name_gujarati, gender, mother_name, caste, gotra, rashi, nakshatra,
                manglik, family_type, city, country, education, profession, native_village,
                parent_phone, marital_status, preferred_cities…
              </Text>
              <Text style={[s.infoText, { color: C.error, marginTop: 6 }]}>
                ✗ sub_caste and video_url are never imported
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator testID="loading-indicator" size="large" color={C.saffron} style={{ marginTop: 40 }} />
            ) : (
              <TouchableOpacity testID="select-csv-btn" style={s.filePickBtn} onPress={pickFile}>
                <Text style={s.filePickIcon}>📂</Text>
                <Text style={s.filePickText}>Select CSV File</Text>
                <Text style={s.filePickSub}>Supports .csv · UTF-8 or UTF-16</Text>
              </TouchableOpacity>
            )}

            {error ? <Text testID="error-msg" style={s.errorText}>{error}</Text> : null}
          </View>
        )}

        {/* ── Step 2: Column Mapping ── */}
        {step === 2 && previewData && (
          <View testID="step-2-mapping">
            <Text style={s.sectionTitle}>Map Columns</Text>
            <Text style={s.bodyText}>
              {previewData.total_rows} rows detected in{' '}
              <Text style={s.bold}>{file?.name}</Text>
            </Text>

            {!allRequiredMapped && (
              <View style={s.warnBox}>
                <Text style={s.warnText}>
                  ⚠  Map required fields before proceeding:{' '}
                  {REQUIRED_FIELDS.filter(f => !Object.values(mapping).includes(f)).join(', ')}
                </Text>
              </View>
            )}

            {previewData.columns.map(col => {
              const mapped = mapping[col] || '';
              const fieldLabel = previewData.profile_fields.find(f => f.value === mapped)?.label || '— ignore —';
              const isRequired = mapped && REQUIRED_FIELDS.includes(mapped);
              return (
                <TouchableOpacity
                  testID={`map-row-${col}`}
                  key={col}
                  style={s.mapRow}
                  onPress={() => { setPickerCol(col); setPickerOpen(true); }}
                >
                  <View style={s.mapLeft}>
                    <Text style={s.mapCsvCol}>{col}</Text>
                    <Text style={s.mapArrow}>→</Text>
                  </View>
                  <View style={[s.mapField, isRequired && s.mapFieldRequired]}>
                    <Text style={[s.mapFieldText, !mapped && s.mapIgnoreText]} numberOfLines={1}>
                      {fieldLabel}
                    </Text>
                    <Text style={s.editHint}>✏</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              testID="preview-import-btn"
              style={[s.primaryBtn, !allRequiredMapped && s.primaryBtnDisabled, { marginTop: 24 }]}
              onPress={runDryRun}
              disabled={!allRequiredMapped || loading}
            >
              {loading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.primaryBtnText}>Preview Import →</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.ghostBtn} onPress={() => setStep(1)}>
              <Text style={s.ghostBtnText}>← Change File</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Preview & Confirm ── */}
        {step === 3 && dryRunResult && (
          <View testID="step-3-preview">
            <Text style={s.sectionTitle}>Preview Import</Text>

            <View style={s.summaryGrid}>
              <View style={s.summaryCard}>
                <Text style={s.summaryNum}>{dryRunResult.total}</Text>
                <Text style={s.summaryLabel}>Total rows</Text>
              </View>
              <View style={[s.summaryCard, s.summaryCardGreen]}>
                <Text style={[s.summaryNum, { color: C.success }]}>{dryRunResult.will_import}</Text>
                <Text style={s.summaryLabel}>Will import</Text>
              </View>
              <View style={[s.summaryCard, s.summaryCardOrange]}>
                <Text style={[s.summaryNum, { color: C.saffron }]}>{dryRunResult.duplicates}</Text>
                <Text style={s.summaryLabel}>Duplicates</Text>
              </View>
              <View style={[s.summaryCard, dryRunResult.errors > 0 && s.summaryCardRed]}>
                <Text style={[s.summaryNum, dryRunResult.errors > 0 && { color: C.error }]}>{dryRunResult.errors}</Text>
                <Text style={s.summaryLabel}>Errors</Text>
              </View>
            </View>

            {/* Preview table (first 5 rows) */}
            {previewData && previewData.preview.slice(0, 5).length > 0 && (
              <View style={s.previewTable}>
                <Text style={s.previewTableTitle}>First 5 rows</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    {/* Header */}
                    <View style={s.tableRow}>
                      {['full_name', 'dob', 'father_name', 'city', 'gender'].map(f => {
                        const col = Object.entries(mapping).find(([, v]) => v === f)?.[0];
                        return col ? (
                          <Text key={f} style={s.tableHeader}>{col}</Text>
                        ) : null;
                      })}
                    </View>
                    {previewData.preview.slice(0, 5).map((row, i) => (
                      <View key={i} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                        {['full_name', 'dob', 'father_name', 'city', 'gender'].map(f => {
                          const col = Object.entries(mapping).find(([, v]) => v === f)?.[0];
                          return col ? (
                            <Text key={f} style={s.tableCell} numberOfLines={1}>{row[col] || '—'}</Text>
                          ) : null;
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {dryRunResult.error_details?.length > 0 && (
              <View style={s.errorBox}>
                <Text style={s.errorBoxTitle}>⚠ Rows with errors (will be skipped):</Text>
                {dryRunResult.error_details.slice(0, 5).map((e, i) => (
                  <Text key={i} style={s.errorBoxItem}>Row {e.row}: {e.name} — {e.error}</Text>
                ))}
              </View>
            )}

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              testID="confirm-import-btn"
              style={[s.primaryBtn, { marginTop: 24 }, dryRunResult.will_import === 0 && s.primaryBtnDisabled]}
              onPress={runImport}
              disabled={loading || dryRunResult.will_import === 0}
            >
              {loading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.primaryBtnText}>Confirm Import ({dryRunResult.will_import} profiles)</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.ghostBtn} onPress={() => setStep(2)}>
              <Text style={s.ghostBtnText}>← Edit Mapping</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Result ── */}
        {step === 4 && importResult && (
          <View testID="step-4-result">
            <View style={s.resultIcon}>
              <Text style={{ fontSize: 64 }}>{importResult.errors === 0 ? '✅' : '⚠️'}</Text>
            </View>
            <Text style={s.resultTitle}>
              {importResult.errors === 0 ? 'Import Successful!' : 'Import Complete with Errors'}
            </Text>

            <View style={s.resultGrid}>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>Total rows processed</Text>
                <Text style={s.resultValue}>{importResult.total}</Text>
              </View>
              <View style={[s.resultRow, s.resultRowSuccess]}>
                <Text style={s.resultLabel}>✓ Profiles imported</Text>
                <Text style={[s.resultValue, { color: C.success }]}>{importResult.imported}</Text>
              </View>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>⏭ Duplicates skipped</Text>
                <Text style={[s.resultValue, { color: C.saffron }]}>{importResult.duplicates}</Text>
              </View>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>{importResult.errors > 0 ? '✗' : '✓'} Errors</Text>
                <Text style={[s.resultValue, importResult.errors > 0 && { color: C.error }]}>{importResult.errors}</Text>
              </View>
            </View>

            {importResult.error_details?.length > 0 && (
              <View style={s.errorBox}>
                <Text style={s.errorBoxTitle}>Error details:</Text>
                {importResult.error_details.slice(0, 5).map((e, i) => (
                  <Text key={i} style={s.errorBoxItem}>Row {e.row}: {e.name} — {e.error}</Text>
                ))}
              </View>
            )}

            <Text style={s.bodyText}>
              All imported profiles are now in the database with status{' '}
              <Text style={s.badge}>unclaimed</Text> and are invisible to app users until claimed.
            </Text>

            <TouchableOpacity testID="import-another-btn" style={s.primaryBtn} onPress={resetAll}>
              <Text style={s.primaryBtnText}>Import Another File</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      <FieldPickerModal
        visible={pickerOpen}
        fields={previewData?.profile_fields || []}
        selected={mapping[pickerCol] || ''}
        onSelect={v => setMapping(prev => ({ ...prev, [pickerCol]: v }))}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.cream },
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Auth
  authContainer: { flex: 1, justifyContent: 'center', padding: 32 },
  authTitle: { fontSize: 24, fontWeight: '700', color: C.textDark, textAlign: 'center', marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: C.textMid, textAlign: 'center', marginBottom: 24 },
  authInput: {
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    padding: 14, fontSize: 16, marginBottom: 16, color: C.textDark,
  },

  // Step bar
  stepBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center' },
  stepDone: { backgroundColor: C.success },
  stepActive: { backgroundColor: C.saffron },
  stepNum: { fontSize: 12, fontWeight: '700', color: C.textMid },
  stepNumActive: { color: C.white },
  stepLabel: { fontSize: 10, color: C.textLight, marginHorizontal: 4 },
  stepLabelActive: { color: C.saffron, fontWeight: '600' },
  stepLine: { width: 20, height: 2, backgroundColor: C.border, marginHorizontal: 2 },
  stepLineDone: { backgroundColor: C.success },

  // Common
  sectionTitle: { fontSize: 20, fontWeight: '700', color: C.textDark, marginBottom: 8 },
  bodyText: { fontSize: 14, color: C.textMid, lineHeight: 20, marginBottom: 16 },
  bold: { fontWeight: '700', color: C.textDark },
  badge: { backgroundColor: C.saffronLight, color: C.saffronDark, fontWeight: '600', paddingHorizontal: 4, borderRadius: 4 },

  // Info box
  infoBox: { backgroundColor: C.saffronLight, borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: C.saffron },
  infoTitle: { fontSize: 12, fontWeight: '700', color: C.saffronDark, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoText: { fontSize: 13, color: C.textMid, lineHeight: 18 },

  // File picker
  filePickBtn: { backgroundColor: C.white, borderWidth: 2, borderColor: C.saffron, borderStyle: 'dashed', borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 16 },
  filePickIcon: { fontSize: 40, marginBottom: 8 },
  filePickText: { fontSize: 17, fontWeight: '700', color: C.saffron, marginBottom: 4 },
  filePickSub: { fontSize: 12, color: C.textLight },

  // Column mapping
  warnBox: { backgroundColor: '#FEF9C3', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#CA8A04' },
  warnText: { fontSize: 13, color: '#92400E' },
  mapRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 10, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: C.border },
  mapLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  mapCsvCol: { fontSize: 13, fontWeight: '600', color: C.textDark, flex: 1 },
  mapArrow: { fontSize: 14, color: C.textLight, marginHorizontal: 6 },
  mapField: { flex: 1.2, flexDirection: 'row', alignItems: 'center', backgroundColor: C.saffronLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  mapFieldRequired: { backgroundColor: '#FDE68A', borderWidth: 1, borderColor: C.gold },
  mapFieldText: { flex: 1, fontSize: 13, color: C.textDark, fontWeight: '500' },
  mapIgnoreText: { color: C.textLight, fontStyle: 'italic' },
  editHint: { fontSize: 12, color: C.textLight, marginLeft: 4 },

  // Buttons
  primaryBtn: { backgroundColor: C.saffron, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.white },
  ghostBtn: { alignItems: 'center', paddingVertical: 12 },
  ghostBtnText: { fontSize: 14, color: C.saffron, fontWeight: '600' },

  // Summary cards
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  summaryCard: { flex: 1, minWidth: '45%', backgroundColor: C.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  summaryCardGreen: { borderColor: '#86EFAC' },
  summaryCardOrange: { borderColor: C.gold },
  summaryCardRed: { borderColor: '#FCA5A5' },
  summaryNum: { fontSize: 28, fontWeight: '800', color: C.textDark },
  summaryLabel: { fontSize: 11, color: C.textLight, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Preview table
  previewTable: { backgroundColor: C.white, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  previewTableTitle: { fontSize: 12, fontWeight: '600', color: C.textMid, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 6 },
  tableRowAlt: { backgroundColor: C.cream },
  tableHeader: { width: 110, fontSize: 11, fontWeight: '700', color: C.textDark, paddingHorizontal: 4 },
  tableCell: { width: 110, fontSize: 12, color: C.textMid, paddingHorizontal: 4 },

  // Error boxes
  errorText: { color: C.error, fontSize: 13, marginBottom: 12, marginTop: 8 },
  errorBox: { backgroundColor: C.errorBg, borderRadius: 10, padding: 12, marginBottom: 16 },
  errorBoxTitle: { fontSize: 13, fontWeight: '700', color: C.error, marginBottom: 6 },
  errorBoxItem: { fontSize: 12, color: C.textMid, marginBottom: 2 },

  // Result
  resultIcon: { alignItems: 'center', paddingVertical: 20 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 24 },
  resultGrid: { backgroundColor: C.white, borderRadius: 14, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: C.border },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  resultRowSuccess: { backgroundColor: C.successBg },
  resultLabel: { fontSize: 14, color: C.textMid },
  resultValue: { fontSize: 18, fontWeight: '800', color: C.textDark },

  // Picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: Platform.OS === 'ios' ? 30 : 16 },
  pickerHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: C.textDark, textAlign: 'center', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, marginHorizontal: 16 },
  pickerOption: { paddingVertical: 13, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerOptionSelected: { backgroundColor: C.saffronLight },
  pickerOptionText: { fontSize: 15, color: C.textDark },
  pickerOptionTextSelected: { color: C.saffronDark, fontWeight: '700' },
  checkmark: { fontSize: 16, color: C.saffron },
});
