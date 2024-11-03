import { join } from 'path';
import { existsSync, readdirSync, copyFileSync } from 'fs';
import { Command } from 'commander';
import { SnapPlugin } from '../types/plugin';
import { t } from '../i18n';
import { getConfigDir } from '../os';
import { clone } from '../utils/clone';
import * as fs from 'fs';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';

const execAsync = promisify(exec);

export class PluginManager {
	private static instance: PluginManager;
	private plugins: Map<string, SnapPlugin> = new Map();
	private program: Command;

	private constructor(program: Command) {
		this.program = program;
	}

	static getInstance(program?: Command): PluginManager {
		if (!PluginManager.instance && program) {
			PluginManager.instance = new PluginManager(program);
		}
		return PluginManager.instance;
	}

	getProgram(): Command {
		return this.program;
	}

	async loadPlugins(): Promise<void> {
		// Clear existing plugins when reloading
		this.plugins.clear();

		const pluginsDir = join(getConfigDir(), 'plugins');

		if (!existsSync(pluginsDir)) {
			return;
		}

		// Get all plugin directories
		const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);

		for (const dir of pluginDirs) {
			try {
				const pluginPath = join(pluginsDir, dir);
				const packageJson = require(join(pluginPath, 'package.json'));
				const mainFile = join(pluginPath, packageJson.main || 'index.js');

				if (!existsSync(mainFile)) {
					throw new Error(`Main file not found: ${mainFile}`);
				}

				// Clear require cache to allow reloading
				delete require.cache[require.resolve(mainFile)];

				const plugin: SnapPlugin = require(mainFile);
				await this.registerPlugin(plugin);
			} catch (error) {
				console.error(
					t(
						'plugins.load_error',
						dir,
						error instanceof Error ? error.message : 'Unknown error',
					),
				);
			}
		}
	}

	async registerPlugin(plugin: SnapPlugin): Promise<void> {
		if (this.plugins.has(plugin.name)) {
			throw new Error(t('plugins.already_registered', plugin.name));
		}

		// Initialize plugin if it has an init function
		if (plugin.init) {
			await plugin.init();
		}

		// Register commands with plugin name prefix
		if (plugin.commands) {
			for (const cmd of plugin.commands) {
				const commandName = cmd.name;
				const command = this.program
					.command(commandName)
					.description(`[${plugin.name}] ${cmd.description}`);

				if (cmd.alias) {
					command.alias(cmd.alias);
				}

				// Add options
				if (cmd.options) {
					for (const opt of cmd.options) {
						command.option(opt.flags, opt.description, opt.defaultValue);
					}
				}

				// Add arguments
				if (cmd.arguments) {
					for (const arg of cmd.arguments) {
						if (arg.required) {
							command.argument(`<${arg.name}>`, arg.description);
						} else {
							command.argument(
								`[${arg.name}]`,
								arg.description,
								arg.defaultValue,
							);
						}
					}
				}

				command.action(cmd.action);
			}
		}

		this.plugins.set(plugin.name, plugin);
	}

	getPlugin(name: string): SnapPlugin | undefined {
		return this.plugins.get(name);
	}

	getAllPlugins(): SnapPlugin[] {
		return Array.from(this.plugins.values());
	}

	async runHook(type: string, ...args: any[]): Promise<void> {
		for (const plugin of this.plugins.values()) {
			const hook = plugin.hooks?.find((h) => h.type === type);
			if (hook) {
				try {
					await hook.handler(...args);
				} catch (error) {
					console.error(
						t(
							'plugins.hook_error',
							plugin.name,
							type,
							error instanceof Error ? error.message : 'Unknown error',
						),
					);
				}
			}
		}
	}

	async init(template = 'basic-ts' as string) {
		console.log(chalk.cyan(t('plugins.initializing')));

		const tempDir = join(getConfigDir(), 'temp');
		try {
			await clone(`https://github.com/snap-vc/plugin-templates`, tempDir);
		} catch (error) {
			console.error(chalk.red(t('plugins.clone_failed')));
			throw error;
		}

		const templateDir = join(tempDir, template);
		if (!existsSync(templateDir)) {
			throw new Error(t('plugins.template_not_found', template));
		}

		const __currentDir = process.cwd();
		const currentDir = join(__currentDir, template);

		try {
			await fs.promises.cp(templateDir, currentDir, { recursive: true });
		} catch (error) {
			throw new Error(t('plugins.template_invalid'));
		}

		await fs.promises.rm(tempDir, { recursive: true });
		await fs.promises.mkdir(tempDir, { recursive: true });

		process.chdir(currentDir);

		try {
			await execAsync('npm install');
		} catch (error) {
			console.error(chalk.red(t('plugins.npm_install_failed')));
			throw error;
		}

		process.chdir(__currentDir);

		console.log(chalk.green(t('plugins.init_success', template)));
	}

	async testPlugin(pluginPath: string, args: string[] = []): Promise<void> {
		const testResults: { success: boolean; message: string }[] = [];

		try {
			// Basic validation checks (existing code)
			const packageJsonPath = join(pluginPath, 'package.json');
			if (!existsSync(packageJsonPath)) {
				throw new Error(t('plugins.no_package_json'));
			}

			const packageJson = require(packageJsonPath);

			// Required fields check (existing code)
			const requiredFields = ['name', 'version', 'main'];
			for (const field of requiredFields) {
				if (!packageJson[field]) {
					testResults.push({
						success: false,
						message: t('plugins.missing_required_field', field),
					});
				}
			}

			// Structure validation (existing code)
			const mainFile = join(pluginPath, packageJson.main || 'index.js');
			if (!existsSync(mainFile)) {
				testResults.push({
					success: false,
					message: t('plugins.main_file_not_found', packageJson.main),
				});
				throw new Error(testResults[0].message);
			}

			// Load and validate plugin
			const plugin = require(mainFile);

			// Basic structure validation
			if (!plugin.name || typeof plugin.name !== 'string') {
				throw new Error(t('plugins.invalid_name'));
			}

			// If no command specified for testing, list available commands
			if (args.length === 0 && plugin.commands) {
				console.log(chalk.cyan(t('plugins.available_commands', plugin.name)));
				plugin.commands.forEach((cmd: any) => {
					console.log(chalk.white(`  ${cmd.name} - ${cmd.description}`));
					if (cmd.options) {
						cmd.options.forEach((opt: any) => {
							console.log(chalk.gray(`    ${opt.flags} - ${opt.description}`));
						});
					}
				});
				return;
			}

			// Find the command to test
			const commandToTest = args[0];
			if (commandToTest && plugin.commands) {
				const command = plugin.commands.find(
					(cmd: any) => cmd.name === commandToTest,
				);
				if (!command) {
					throw new Error(t('plugins.command_not_found', commandToTest));
				}

				console.log(chalk.cyan(t('plugins.testing_command', commandToTest)));

				// Parse command arguments and options
				const cmdArgs: string[] = [];
				const cmdOptions: Record<string, string | boolean> = {};
				let i = 1;

				while (i < args.length) {
					const arg = args[i];

					if (arg.startsWith('-')) {
						// Handle options
						const option = command.options?.find((opt: any) => {
							const flags = opt.flags.split(',').map((f: any) => f.trim());
							// Handle both short (-n) and long (--name) formats
							return flags.some((flag: any) => {
								const parts = flag.split(' ')[0]; // Get just the flag part
								if (arg.startsWith('--')) {
									// For long options (--name)
									return `--${parts.replace(/^-+/, '')}` === arg;
								} else {
									// For short options (-n)
									return `-${parts.replace(/^-+/, '')}` === arg;
								}
							});
						});

						if (!option) {
							throw new Error(t('plugins.invalid_option', arg, commandToTest));
						}

						// Get the option name without dashes
						const optionName = option.flags
							.split(',')[0] // Take the first flag variant
							.split(' ')[0] // Split off any value indicators
							.replace(/^-+/, '') // Remove leading dashes
							.replace(/^n$/, 'name'); // Convert short form to long form

						// Check if option expects a value
						if (option.flags.includes('<') || option.flags.includes('[')) {
							if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
								cmdOptions[optionName] = args[i + 1];
								i += 2;
							} else {
								throw new Error(t('plugins.missing_option_value', arg));
							}
						} else {
							cmdOptions[optionName] = true;
							i++;
						}
					} else {
						// Regular argument
						cmdArgs.push(arg);
						i++;
					}
				}

				console.log(chalk.gray(t('plugins.command_args', cmdArgs.join(' '))));
				if (Object.keys(cmdOptions).length > 0) {
					console.log(
						chalk.gray(
							t('plugins.command_options', JSON.stringify(cmdOptions)),
						),
					);
				}

				// Execute the command directly
				try {
					await command.action(cmdOptions);
				} catch (error) {
					throw new Error(
						t(
							'plugins.command_execution_failed',
							error instanceof Error ? error.message : 'Unknown error',
						),
					);
				}
			}
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : 'Unknown error');
		}
	}
}
