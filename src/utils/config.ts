import { loadConfig, getConfigDir, saveConfig } from '../os';
import { t } from '../i18n';

export function editConfig(...args: string[]) {
	const configFile = loadConfig();

	if (args.length === 0) {
		// Display current configuration
		console.log(`\n${t('config.current')}:`);
		Object.entries(configFile).forEach(([section, values]) => {
			console.log(`\n[${section}]`);
			Object.entries(values as object).forEach(([key, value]) => {
				console.log(`${key} = ${value}`);
			});
		});
		return;
	}

	// Handle key editing: format should be "section.key=value" or "section.key value"
	const configPath = args[0];
	const newValue = args.length > 1 ? args[1] : args[0].split('=')[1];
	const [section, key] = args[0].split('=')[0].split('.');

	if (!section || !key) {
		throw new Error(t('config.invalid_path'));
	}

	// Create section if it doesn't exist
	if (!configFile[section]) {
		configFile[section] = {};
	}

	// Update the value
	(configFile[section] as any)[key] = newValue;

	// Save the updated config
	saveConfig(configFile);
	console.log(t('config.updated', `${section}.${key}`, newValue));
}
