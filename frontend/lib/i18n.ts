export type Lang = 'en';

const strings = {
  appName:         'Shree GKKS Vivah',
  appSubtitle:     'Gujarati Community Matrimonial',
  inviteOnly:      'Invite-only community',
  phoneLabel:      'WhatsApp Number',
  phonePlaceholder:'98765 43210',
  captchaPrompt:   'Complete security check',
  captchaDone:     'Security check passed',
  sendOtp:         'Send OTP',
  sending:         'Sending…',
  otpTitle:        'Enter OTP',
  otpSentTo:       'OTP sent to',
  viaWhatsApp:     'via WhatsApp',
  verify:          'Verify & Continue',
  verifying:       'Verifying…',
  resendIn:        'Resend in',
  resend:          'Resend OTP',
  changeNumber:    'Change number',
  seconds:         's',
} as const;

export function t(key: keyof typeof strings, _lang?: Lang): string {
  return strings[key] ?? key;
}

export default strings;
