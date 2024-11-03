import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ResetOptions {
	soft?: boolean;
	hard?: boolean;
	mixed?: boolean;
}

export async function reset(
	commit: string = 'HEAD',
	options: ResetOptions = {},
): Promise<void> {
	let mode = '--mixed'; // default mode
	if (options.soft) mode = '--soft';
	if (options.hard) mode = '--hard';

	await execAsync(`git reset ${mode} ${commit}`);
}

export async function restore(
	paths: string[],
	options: { source?: string; staged?: boolean; worktree?: boolean } = {},
): Promise<void> {
	const args: string[] = [];

	if (options.source) {
		args.push(`--source ${options.source}`);
	}

	if (options.staged) {
		args.push('--staged');
	}

	if (options.worktree) {
		args.push('--worktree');
	}

	await execAsync(`git restore ${args.join(' ')} ${paths.join(' ')}`);
}
