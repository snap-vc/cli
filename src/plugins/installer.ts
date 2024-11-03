import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
	mkdirSync,
	existsSync,
	rmSync,
	cpSync,
	writeFileSync,
	readFileSync,
} from 'fs';
import { getConfigDir } from '../os';
import { PluginManager } from './manager';
import { Command } from 'commander';
import { t } from '..//i18n';

const execAsync = promisify(exec);

const PLUGINS_DIR = join(getConfigDir(), 'plugins');
const TEMP_DIR = join(getConfigDir(), 'temp');
const API_URL = 'http://localhost:3000/api';

/**
 * Ensures the plugins directory exists
 */
function ensurePluginsDir() {
	if (!existsSync(PLUGINS_DIR)) {
		mkdirSync(PLUGINS_DIR, { recursive: true });
	}
	if (!existsSync(TEMP_DIR)) {
		mkdirSync(TEMP_DIR, { recursive: true });
	}
}

function checkCommandConflicts(plugin: any, program: Command): string[] {
	const conflicts: string[] = [];

	if (plugin.commands) {
		for (const cmd of plugin.commands) {
			const existingCommand = program.commands.find(
				(c) => c.name() === cmd.name || c.aliases().includes(cmd.name),
			);
			if (existingCommand) {
				conflicts.push(cmd.name);
			}
		}
	}

	return conflicts;
}

/**
 * Installs a plugin from Supabase
 * @param pluginId - ID of the plugin to install
 */
export async function installPlugin(pluginId: string): Promise<void> {
	ensurePluginsDir();

	try {
		// Fetch plugin data from API
		const response = await fetch(`${API_URL}/plugins/${pluginId}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch plugin: ${response.statusText}`);
		}

		const plugin = (await response.json()) as any;

		// Check for command conflicts BEFORE installation
		const program = PluginManager.getInstance().getProgram();
		const conflicts = checkCommandConflicts(plugin, program);

		if (conflicts.length > 0) {
			throw new Error(t('plugins.command_conflict', conflicts.join(', ')));
		}

		const pluginDir = join(PLUGINS_DIR, plugin.name);
		const tempDir = join(TEMP_DIR, `${plugin.name}-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });

		// Download and write each file
		for (const file of plugin.files) {
			const filePath = join(tempDir, file.path);
			mkdirSync(join(tempDir, file.path, '..'), { recursive: true });
			writeFileSync(filePath, file.content);
		}

		// Remove existing plugin directory if it exists
		if (existsSync(pluginDir)) {
			rmSync(pluginDir, { recursive: true, force: true });
		}

		// Copy the plugin files
		cpSync(tempDir, pluginDir, {
			recursive: true,
			force: true,
			filter: (src) => !src.includes('node_modules'),
		});

		// Install dependencies and build
		await execAsync('npm install --production', { cwd: pluginDir });

		if (existsSync(join(pluginDir, 'package.json'))) {
			const packageJson = JSON.parse(
				readFileSync(join(pluginDir, 'package.json'), 'utf8'),
			);
			if (packageJson.scripts && packageJson.scripts.build) {
				await execAsync('npm run build', { cwd: pluginDir });
			}
		}

		// Update download count only after successful installation
		await downloadCount(plugin.name);

		// Cleanup
		rmSync(tempDir, { recursive: true, force: true });

		console.log(`Successfully installed plugin: ${plugin.name}`);
	} catch (error) {
		throw new Error(
			`Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Removes an installed plugin
 * @param name - Name of the plugin to remove
 */
export async function removePlugin(name: string): Promise<void> {
	const pluginDir = join(PLUGINS_DIR, name);

	if (!existsSync(pluginDir)) {
		throw new Error(`Plugin "${name}" is not installed`);
	}

	rmSync(pluginDir, { recursive: true, force: true });
}

export async function downloadCount(pluginName: string): Promise<void> {
	try {
		const response = await fetch(`${API_URL}/plugins/${pluginName}/download`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			throw new Error(
				`Failed to update download count: ${response.statusText}`,
			);
		}
	} catch (error) {
		console.error('Failed to update download count:', error);
	}
}
