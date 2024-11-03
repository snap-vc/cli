import { join, relative } from 'path';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { getConfigDir } from '../os';
import { t } from '../i18n';

const API_URL = 'https://snap.choco.rip/api';

interface PluginFile {
	path: string;
	content: string;
}

function getAllFiles(dir: string): string[] {
	const files: string[] = [];

	readdirSync(dir).forEach((file) => {
		const fullPath = join(dir, file);
		if (statSync(fullPath).isDirectory()) {
			if (!['node_modules', '.git', 'dist'].includes(file)) {
				files.push(...getAllFiles(fullPath));
			}
		} else {
			files.push(fullPath);
		}
	});

	return files;
}

export async function publishPlugin(update = false): Promise<void> {
	const currentDir = process.cwd();
	const packageJsonPath = join(currentDir, 'package.json');

	if (!existsSync(packageJsonPath)) {
		throw new Error(t('plugins.no_package_json'));
	}

	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
	const files: PluginFile[] = [];

	// Read all files in the directory
	const allFiles = getAllFiles(currentDir);
	for (const file of allFiles) {
		const relativePath = relative(currentDir, file);
		const content = readFileSync(file, 'utf-8');
		files.push({
			path: relativePath,
			content,
		});
	}

	const pluginData: any = {
		name: packageJson.name,
		version: packageJson.version,
		description: packageJson.description,
		tags: packageJson.keywords,
		files,
	};

	// Check if there is a readme file
	if (existsSync(join(currentDir, 'README.md'))) {
		pluginData.readme = readFileSync(join(currentDir, 'README.md'), 'utf-8');
	}

	// Get auth token from config
	let config;
	try {
		const configPath = join(getConfigDir(), 'config.json');
		if (!existsSync(configPath)) {
			throw new Error(t('auth.not_authenticated'));
		}
		config = JSON.parse(readFileSync(configPath, 'utf-8'));
	} catch (error) {
		throw new Error(t('auth.not_authenticated'));
	}

	if (!config.authToken) {
		throw new Error(t('auth.not_authenticated'));
	}

	const response = await fetch(`${API_URL}/plugins`, {
		method: update ? 'PUT' : 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.authToken}`,
		},
		body: JSON.stringify(pluginData),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(
			(error as any).error ||
				t(update ? 'plugins.update_failed' : 'plugins.publish_failed'),
		);
	}
}
