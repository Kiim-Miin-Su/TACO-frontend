import type { ProfileVerificationPurpose } from '@kms545487/contracts';

export const PROFILE_CHANGE_VERIFICATION_PURPOSE: ProfileVerificationPurpose = 'profile_change';

export const credentialVerificationPurposeOf = (
  mustChangePassword: boolean,
): Extract<ProfileVerificationPurpose, 'password_change' | 'account_setup'> =>
  mustChangePassword ? 'account_setup' : 'password_change';
