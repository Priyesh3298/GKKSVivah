export type Lang = 'en' | 'gu';

const strings = {
  appName:         { en: 'GKKS Vivah',                      gu: 'GKKS વિવાહ' },
  appSubtitle:     { en: 'Gujarati Community Matrimonial',   gu: 'ગુજરાતી સમુદાય મૅટ્રિમૉનિઅલ' },
  inviteOnly:      { en: 'Invite-only community',            gu: 'આમંત્રણ-માત્ર સમુદાય' },
  phoneLabel:      { en: 'WhatsApp Number',                  gu: 'WhatsApp નંબર' },
  phonePlaceholder:{ en: '98765 43210',                     gu: '98765 43210' },
  captchaPrompt:   { en: 'Complete security check',          gu: 'સુરક્ષા ચકાસણી પૂર્ણ કરો' },
  captchaDone:     { en: 'Security check passed ✓',          gu: 'સુરક્ષા ચકાસણી પૂર્ણ ✓' },
  sendOtp:         { en: 'Send OTP',                         gu: 'OTP મોકલો' },
  sending:         { en: 'Sending…',                         gu: 'મોકલી રહ્યા છીએ…' },
  otpTitle:        { en: 'Enter OTP',                        gu: 'OTP દાખલ કરો' },
  otpSentTo:       { en: 'OTP sent to',                      gu: 'OTP મોકલ્યો' },
  viaWhatsApp:     { en: 'via WhatsApp',                     gu: 'WhatsApp દ્વારા' },
  verify:          { en: 'Verify & Continue',                gu: 'ચકાસો અને આગળ વધો' },
  verifying:       { en: 'Verifying…',                       gu: 'ચકાસી રહ્યા છીએ…' },
  resendIn:        { en: 'Resend in',                        gu: 'ફરી મોકલો' },
  resend:          { en: 'Resend OTP',                       gu: 'OTP ફરી મોકલો' },
  changeNumber:    { en: 'Change number',                    gu: 'નંબર બદલો' },
  seconds:         { en: 's',                                gu: 'સે.' },
} as const;

export function t(key: keyof typeof strings, lang: Lang): string {
  return (strings[key] as any)?.[lang] ?? (strings[key] as any)?.en ?? key;
}

export default strings;
