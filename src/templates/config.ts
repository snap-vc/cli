import { getLocales } from '../i18n';
import { appName } from '../constants';

const config = `
[i18n]
; Locale setting controls the application's language
; This setting affects all user-facing text and messages
; Available locales: ${getLocales().join(', ')}
locale = en_US
`;

export default config;
