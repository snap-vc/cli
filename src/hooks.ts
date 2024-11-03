import { existsSync, readFile, readFileSync, writeFile } from 'node:fs';
import { basename, join } from 'node:path';
import { exec, execSync } from 'node:child_process';
import { env } from 'node:process';
import { promisify } from 'node:util';
import yaml from 'yaml';
import { glob } from 'glob';
import { t } from './i18n';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const execAsync = promisify(exec);

const getDefaultShell = () => {
	return process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
};

interface HookConfig {
	name: string;
	description?: string;
	run: string[];
	enabled?: boolean;
	failOnError?: boolean;
	timeout?: number;
	env?: Record<string, string>;
	workingDir?: string;
	parallel?: boolean;
	shell?: boolean | string;
	onlyIf?: {
		files?: string[];
		env?: string[];
		commands?: string[];
		branches?: string[];
	};
}

export interface HookData {
	name: string;
	description?: string;
	enabled: boolean;
	type: string;
}

async function checkConditions(
	hookData: HookConfig,
): Promise<{ passed: boolean; reason?: string }> {
	if (!hookData.onlyIf) {
		return { passed: true };
	}

	// Check branches
	if (hookData.onlyIf.branches) {
		const currentBranch = execSync('git branch --show-current')
			.toString()
			.trim();
		if (!hookData.onlyIf.branches.includes(currentBranch)) {
			return {
				passed: false,
				reason: t(
					'hooks.branch_condition',
					hookData.onlyIf.branches.join(', '),
				),
			};
		}
	}

	// Check files
	if (hookData.onlyIf.files) {
		const matchedFiles = await glob(hookData.onlyIf.files);
		if (matchedFiles.length === 0) {
			return {
				passed: false,
				reason: t('hooks.files_condition', hookData.onlyIf.files.join(', ')),
			};
		}
	}

	// Check environment variables
	if (hookData.onlyIf.env) {
		const missingEnv = hookData.onlyIf.env.filter(
			(envVar) => !process.env[envVar],
		);
		if (missingEnv.length > 0) {
			return {
				passed: false,
				reason: t('hooks.env_condition', missingEnv.join(', ')),
			};
		}
	}

	// Check commands
	if (hookData.onlyIf.commands) {
		for (const command of hookData.onlyIf.commands) {
			try {
				execSync(command, { stdio: 'ignore' });
			} catch (error) {
				return {
					passed: false,
					reason: t('hooks.command_condition', command),
				};
			}
		}
	}

	return { passed: true };
}

export const runHook = async (hook: string): Promise<void> => {
	const hookPath = join(process.cwd(), '.snap', 'hooks', hook);
	let hookData: HookConfig;

	// Check if hook exists
	if (!existsSync(hookPath)) {
		return;
	}

	try {
		const hookContent = await readFileAsync(hookPath, 'utf-8');

		hookData = yaml.parse(hookContent) as HookConfig;

		// Validate hook structure
		if (!hookData.name || !Array.isArray(hookData.run)) {
			throw new Error(t('hooks.invalid_format', hook));
		}

		// Check if hook is enabled
		if (hookData.enabled === false) {
			console.log(t('hooks.disabled', hook));
			return;
		}

		// Check conditions
		const { passed, reason } = await checkConditions(hookData);
		if (!passed) {
			console.log(t('hooks.skipping', hook, reason));
			return;
		}

		// Prepare environment
		const hookEnv = {
			...process.env,
			SNAP_HOOK_NAME: hookData.name,
			SNAP_HOOK_NODE_VERSION: process.version,
			...(hookData.env || {}),
		};

		const execOptions = {
			env: hookEnv,
			stdio: 'inherit' as const,
			shell: getDefaultShell(),
			cwd: hookData.workingDir || process.cwd(),
			timeout: hookData.timeout || 30000,
			windowsHide: true,
		};

		// Execute commands
		if (hookData.parallel) {
			const commandPromises = hookData.run.map(async (command) => {
				try {
					const { stdout, stderr } = await execAsync(command, execOptions);
					if (stdout) console.log(stdout);
					if (stderr) console.error(stderr);
				} catch (error) {
					if (hookData.failOnError !== false) {
						throw new Error(t('hooks.command_failed', command));
					}
					console.error(error);
					console.warn(t('hooks.command_failed', command));
				}
			});

			await Promise.all(commandPromises);
		} else {
			for (const command of hookData.run) {
				try {
					const { stdout, stderr } = await execAsync(command, execOptions);
					if (stdout) console.log(stdout);
					if (stderr) console.error(stderr);
				} catch (error) {
					if (hookData.failOnError !== false) {
						throw new Error(t('hooks.command_failed', command));
					}
					console.error(error);
					console.warn(t('hooks.command_failed', command));
				}
			}
		}
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(t('hooks.execution_failed', hook, error.message));
		}
		throw error;
	}
};

export const getHooks = async (): Promise<HookData[]> => {
	const hooks = await glob(join(process.cwd(), '.snap', 'hooks', '*'));

	let hooksData: HookData[] = [];

	for (const hook of hooks) {
		const hookContent = await readFileAsync(hook, 'utf-8');
		const data = yaml.parse(hookContent) as HookConfig;
		hooksData.push({
			name: data.name,
			description: data.description,
			enabled: data.enabled ?? true,
			type: basename(hook),
		});
	}

	return hooksData;
};
