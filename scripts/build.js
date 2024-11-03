const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const COLORS = {
	RESET: '\x1b[0m',
	RED: '\x1b[31m',
	GREEN: '\x1b[32m',
	YELLOW: '\x1b[33m',
	BLUE: '\x1b[34m',
	MAGENTA: '\x1b[35m',
	CYAN: '\x1b[36m',
	WHITE: '\x1b[37m',
};

const rawArgs = process.argv.slice(2);
const isSilent = rawArgs.includes('--silent') || rawArgs.includes('-s');
const skipArgs = rawArgs.includes('--skip') || rawArgs.includes('-sk');
const specArgs = rawArgs.includes('--spec') || rawArgs.includes('-sp');
const isVerbose = rawArgs.includes('--verbose') || rawArgs.includes('-v');
const confirmEach = rawArgs.includes('--confirm') || rawArgs.includes('-c');
const listCommands = rawArgs.includes('--list') || rawArgs.includes('-l');
const runInParallel = rawArgs.includes('--parallel') || rawArgs.includes('-p');
const watch = rawArgs.includes('--watch') || rawArgs.includes('-w');

const log = (message, color = COLORS.WHITE) => {
	console.log(
		`${COLORS.GREEN}[BUILDER]${COLORS.RESET} ${color}${message}${COLORS.RESET}`,
	);
};

// Command definitions
const commands = [
	{
		name: 'validate-deps',
		description: 'Validate package dependencies',
		command: () => {
			const pkg = require('../package.json');
			const nodeVersion = process.version.slice(1); // Remove 'v' prefix
			const requiredVersion = pkg.engines.node.replace('>=', '');

			if (nodeVersion < requiredVersion) {
				throw new Error(
					`Node.js version ${requiredVersion} or higher is required`,
				);
			}
			log('Dependencies validated', COLORS.GREEN);
		},
	},
	{
		name: 'clean',
		description: 'Clean the dist directory',
		command: 'npm run clean',
	},
	{
		name: 'format',
		description: 'Format the codebase using prettier',
		command: 'npm run format',
	},
	{
		name: 'lint',
		description: 'Run TypeScript type checking',
		command: 'npm run lint',
	},
	{
		name: 'tsc',
		description: 'Compile the TypeScript codebase',
		command: 'npm run tsc',
	},
	{
		name: 'copy',
		description: 'Copy non-TypeScript files to dist',
		command: 'npm run copy-files',
	},
	{
		name: 'chmod',
		description: 'Make the CLI executable',
		command: () => {
			if (process.platform === 'win32') {
				log('Skipping chmod on Windows', COLORS.YELLOW);
				return;
			}
			execSync('chmod +x ./dist/app.js', { stdio: 'inherit' });
		},
	},
	{
		name: 'verify',
		description: 'Verify the build output',
		command: () => {
			const distPath = path.join(process.cwd(), 'dist');
			if (!fs.existsSync(distPath)) {
				throw new Error('dist directory does not exist');
			}

			const mainFile = path.join(distPath, 'app.js');
			if (!fs.existsSync(mainFile)) {
				throw new Error('Main application file not found');
			}

			log('Build verification completed', COLORS.GREEN);
		},
	},
];

// Helper to display usage
const displayHelp = () => {
	console.log('Usage: npm run build [options]');
	console.log('Options:');
	console.log('  -h, --help       Display this help message');
	console.log('  -l, --list       List available commands');
	console.log('  -c, --confirm    Confirm before running each command');
	console.log('  -p, --parallel   Run commands in parallel');
	console.log('  -v, --verbose    Show detailed output');
	console.log('  -s, --silent     Run commands silently');
	console.log('  -sk, --skip      Skip the specified command');
	console.log('  -sp, --spec      Run the specified command');
	console.log(
		'\nIf no options are provided, all commands will be run in sequence.\n',
	);
	process.exit(0);
};

// Helper to list commands
const listAvailableCommands = () => {
	console.log('Available Commands:');
	commands.forEach(({ name, description }) =>
		console.log(`  ${name} - ${description}`),
	);
	process.exit(0);
};

// Helper to confirm execution
const confirmCommand = (name) =>
	new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question(`Are you sure you want to run "${name}"? (y/n) `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === 'y');
		});
	});

// Helper to execute a command
const runCommand = async (command) => {
	const { name, command: cmd } = command;
	try {
		if (confirmEach) {
			const confirmed = await confirmCommand(name);
			if (!confirmed) {
				log(`Skipped ${name}`, COLORS.YELLOW);
				return;
			}
		}

		log(`Running ${name} command ${isSilent ? 'silently' : ''}`);

		if (typeof cmd === 'function') {
			await cmd();
		} else {
			execSync(cmd, {
				stdio: isSilent ? 'ignore' : 'inherit',
				...(isVerbose && { env: { ...process.env, VERBOSE: 'true' } }),
				cwd: process.cwd(),
			});
		}

		log(`Completed ${name}`, COLORS.GREEN);
	} catch (error) {
		log(`Error running ${name}:`, error.message, COLORS.RED);
		if (isVerbose) {
			console.error(error.stack);
		}
		if (!runInParallel) {
			process.exit(1);
		}
	}
};

// Filter and run specified commands or all commands if none specified
const processCommands = async () => {
	log('Total build time', COLORS.WHITE);

	try {
		const selectedCommands = commands.filter((command) => {
			if (skipArgs && rawArgs.includes(command.name)) return false;
			if (specArgs && !rawArgs.includes(command.name)) return false;
			return true;
		});

		if (selectedCommands.length === 0) {
			log('No commands selected to run', COLORS.YELLOW);
			return;
		}

		if (runInParallel) {
			await Promise.all(selectedCommands.map((command) => runCommand(command)));
		} else {
			for (const command of selectedCommands) {
				await runCommand(command);
			}
		}

		log('Build completed successfully', COLORS.GREEN);
	} catch (error) {
		log('Build failed:', error.message, COLORS.RED);
		process.exit(1);
	}
};

// Handle --help or --list flags
if (rawArgs.includes('-h') || rawArgs.includes('--help')) displayHelp();
if (listCommands) listAvailableCommands();

// Execute the command processing
processCommands();
