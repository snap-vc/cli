import os from 'os';
import { resolve } from 'path';
import { appName } from './constants';
import ini from 'ini';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import configTemplate from './templates/config';

/**
 * Gets the platform-specific configuration directory path.
 * On Windows, this is typically %APPDATA%\{appName}
 * On Unix-like systems, this is ~/.{appName}
 * Creates the directory if it doesn't exist.
 *
 * @returns {string} The absolute path to the configuration directory
 * @throws {Error} If the home directory doesn't exist or directory creation fails
 */
export function getConfigDir(): string {
	const platform = os.platform();
	const home = os.homedir();

	if (!existsSync(home)) {
		throw new Error('Home directory does not exist');
	}

	const configPath =
		platform === 'win32' ?
			resolve(
				process.env.APPDATA || resolve(home, 'AppData', 'Roaming'),
				appName,
			)
		:	resolve(home, `.${appName}`);

	if (!existsSync(configPath)) {
		mkdirSync(configPath, { recursive: true });
	}

	return configPath;
}

/**
 * Loads the application configuration from an INI file.
 * Creates a default configuration file if none exists.
 *
 * @returns {Record<string, any>} The parsed configuration object
 * @throws {Error} If the configuration file cannot be read or parsed
 */
export function loadConfig(): Record<string, any> {
	try {
		const configFile = resolve(getConfigDir(), 'config.ini');

		if (!existsSync(configFile)) {
			writeFileSync(configFile, configTemplate);
		}

		return ini.parse(readFileSync(configFile, 'utf-8'));
	} catch (error) {
		throw new Error(`Failed to load config: ${(error as Error).message}`);
	}
}

/**
 * Saves the application configuration to an INI file.
 *
 * @param {any} config The configuration object to save
 * @throws {Error} If the configuration file cannot be written
 */
export function saveConfig(config: any): void {
	const configPath = `${getConfigDir()}/config.ini`;
	let configContent = '';

	// Convert config object to INI format
	Object.entries(config).forEach(([section, values]) => {
		configContent += `[${section}]\n`;
		Object.entries(values as object).forEach(([key, value]) => {
			configContent += `${key} = ${value}\n`;
		});
		configContent += '\n';
	});

	writeFileSync(configPath, configContent.trim(), 'utf8');
}
