import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'ini';
import { loadConfig } from './os';

/**
 * Interface representing a translations object structure.
 * Can contain either direct string translations or nested objects of translations.
 */
interface Translations {
	[key: string]: string | { [key: string]: string };
}

/**
 * Loads translations from INI files based on configured locale.
 * Falls back to en_US if the configured locale file is not found.
 *
 * @returns {Translations} Object containing all translations for the current locale
 * @throws {Error} If neither the configured locale nor fallback translations can be loaded
 */
export function loadTranslations(): Translations {
	try {
		const config = loadConfig();
		const locale = config.i18n?.locale || 'en_US';
		const filePath = resolve(__dirname, `translations/${locale}.ini`);

		try {
			const fileContent = readFileSync(filePath, 'utf-8');
			return parse(fileContent);
		} catch (error) {
			// If original language file fails, try loading en_US
			const defaultPath = resolve(__dirname, 'translations/en_US.ini');
			const defaultContent = readFileSync(defaultPath, 'utf-8');
			return parse(defaultContent);
		}
	} catch (error) {
		console.error(`Failed to load translations: ${(error as Error).message}`);
		return {};
	}
}

/**
 * Translates a key into the corresponding message in the current locale.
 * Supports parameter substitution using {0}, {1}, etc. placeholders.
 *
 * @param {string} key - Translation key in format "section.messageKey"
 * @param {...any[]} args - Values to substitute into the translated message
 * @returns {string} Translated and parameter-substituted message
 * @example
 * t('errors.notFound', 'users') // Returns: "Could not find users"
 */
export function t(key: string, ...args: any[]): string {
	const translations = loadTranslations();
	const [section, messageKey] = key.split('.');

	const sectionData = translations[section];
	let message = typeof sectionData === 'object' ? sectionData[messageKey] : key;

	// Replace placeholders with arguments
	args.forEach((arg, index) => {
		message = message.replace(`{${index}}`, arg.toString());
	});

	return message;
}

/**
 * Returns a list of available locale codes by scanning the translations directory.
 *
 * @returns {string[]} Array of available locale codes (e.g., ['en_US', 'es_ES'])
 */
export function getLocales(): string[] {
	return readdirSync(resolve(__dirname, 'translations'))
		.filter((file) => file.endsWith('.ini'))
		.map((file) => file.split('.')[0]);
}
