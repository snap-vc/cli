import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as readline from 'node:readline';
import { appName, version } from '../constants';
import { getLocales } from '../i18n';
import { getConfigDir } from '../os';
import { t } from '../i18n';

interface CursorPosition {
	row: number;
	col: number;
}

interface ViewportPosition {
	start: number;
	size: number;
}

interface TemplateContext {
	vars: typeof vars;
	platform: string;
	arch: string;
	appName: string;
	version: string;
	locales: string[];
	configPath: string;
	env: NodeJS.ProcessEnv;
	[key: string]: any;
}

function findHeader(content: string[], headerName: string): number {
	return content.findIndex(
		(line) =>
			line.trim().startsWith(':') &&
			line.trim().endsWith(':') &&
			line.trim().toLowerCase().includes(headerName.toLowerCase()),
	);
}

export function startVimMode(content: string[], initialHeader?: string) {
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);

	// Initialize cursor and viewport
	let cursor: CursorPosition = {
		row: initialHeader ? findHeader(content, initialHeader) : 0,
		col: 0,
	};

	// Get terminal height for viewport calculations
	const terminalHeight = process.stdout.rows || 24;
	let viewport: ViewportPosition = {
		start: Math.max(0, cursor.row - Math.floor(terminalHeight / 2)),
		size: terminalHeight - 2, // Leave room for status line
	};

	function updateViewport() {
		// Keep cursor in middle of screen when possible
		const middle = Math.floor(viewport.size / 2);
		if (cursor.row < viewport.start + middle) {
			viewport.start = Math.max(0, cursor.row - middle);
		} else if (cursor.row > viewport.start + viewport.size - middle) {
			viewport.start = Math.min(
				content.length - viewport.size,
				cursor.row - viewport.size + middle,
			);
		}
	}

	// Initial render
	console.clear();
	updateViewport();
	renderContent(content, cursor, viewport);

	process.stdin.on('keypress', (str, key) => {
		if (key.ctrl && key.name === 'c') {
			process.exit();
		}

		// Handle navigation keys
		switch (key.name) {
			case 'up':
			case 'k':
				cursor.row = Math.max(0, cursor.row - 1);
				break;
			case 'down':
			case 'j':
				cursor.row = Math.min(content.length - 1, cursor.row + 1);
				break;
			case 'left':
			case 'h':
				cursor.col = Math.max(0, cursor.col - 1);
				break;
			case 'right':
			case 'l':
				cursor.col = Math.min(content[cursor.row]?.length ?? 0, cursor.col + 1);
				break;
			case 'q':
				process.exit();
				break;
		}

		updateViewport();
		console.clear();
		renderContent(content, cursor, viewport);
	});
}

const vars = {
	appName,
	version,
	locales: getLocales(),
	configPath: join(getConfigDir(), 'config.ini'),
	env: process.env,
};

function evaluateCondition(
	condition: string,
	context: TemplateContext,
): boolean {
	try {
		// Create a function with context variables
		const fn = new Function(
			...Object.keys(context),
			`return Boolean(${condition});`,
		);
		return fn(...Object.values(context));
	} catch (error) {
		console.error(`Error evaluating condition: ${condition}`);
		return false;
	}
}

function processTemplateDirectives(
	lines: string[],
	context: TemplateContext,
): string[] {
	const result: string[] = [];
	let skipUntil: string | null = null;
	let loopStack: {
		variable: string;
		items: any[];
		index: number;
		itemName: string;
	}[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Handle @if directives
		if (line.startsWith('@(if ')) {
			const condition = line.slice(5, -1);
			if (!evaluateCondition(condition, context)) {
				skipUntil = '@(endif)';
			}
			continue;
		}

		// Handle @foreach directives
		if (line.startsWith('@(foreach ')) {
			const match = line.match(/@\(foreach\s+(\w+)(?:\s+as\s+(\w+))?\)/);
			if (match) {
				const [, arrayName, itemName = 'item'] = match;
				if (arrayName in context) {
					const items =
						Array.isArray(context[arrayName]) ? context[arrayName] : [];
					loopStack.push({
						variable: arrayName,
						items,
						index: 0,
						itemName,
					});
					continue;
				}
			}
			skipUntil = '@(end)';
			continue;
		}

		// Handle @end directives
		if (line === '@(end)') {
			if (loopStack.length > 0) {
				const currentLoop = loopStack[loopStack.length - 1];
				currentLoop.index++;
				if (currentLoop.index < currentLoop.items.length) {
					// Update context with current loop item
					context[currentLoop.variable] = currentLoop.items[currentLoop.index];
					// Go back to start of loop
					while (i > 0 && !lines[i].trim().startsWith('@(foreach ')) {
						i--;
					}
					continue;
				} else {
					loopStack.pop();
				}
			}
			continue;
		}

		// Handle @endif directives
		if (line === '@(endif)') {
			skipUntil = null;
			continue;
		}

		// Skip lines if inside a false condition or skipped loop
		if (skipUntil) continue;

		// Process the line with current context and loop variables
		if (loopStack.length > 0) {
			const currentLoop = loopStack[loopStack.length - 1];
			const loopContext = {
				...context,
				[currentLoop.itemName]: currentLoop.items[currentLoop.index],
			};
			result.push(replaceVariables(lines[i], loopContext));
		} else {
			result.push(replaceVariables(lines[i], context));
		}
	}

	return result;
}

function replaceVariables(text: string, context: typeof vars): string {
	return text.replace(/\$\{(\w+)\}/g, (match, key) => {
		if (key in context) {
			return String(context[key as keyof typeof context]);
		}
		return match;
	});
}

function formatLine(line: string): string {
	// Replace variables first
	line = replaceVariables(line, vars);

	// Format code inline with backticks
	line = line.replace(/`(.*?)`/g, '\x1b[33m$1\x1b[0m'); // Yellow for inline code

	// Format bold text with ** or __
	line = line.replace(/(\*\*|__)(.*?)\1/g, '\x1b[1m$2\x1b[0m');

	// Format italic text with * or _
	line = line.replace(/(\*|_)(.*?)\1/g, '\x1b[3m$2\x1b[0m');

	// Format variables like {var} with magenta for name and braces
	line = line.replace(/\{([^}]+)\}/g, '\x1b[35m{\x1b[95m$1\x1b[35m}\x1b[0m');

	// Format comments after semicolon with dim gray
	line = line.replace(/;(.*)$/, '\x1b[90m;$1\x1b[0m');

	// Format section headers in brackets
	line = line.replace(/\[(.*?)\]/g, '\x1b[36m[$1]\x1b[0m');

	// Format key-value pairs (like "Type: string")
	line = line.replace(/^(\s*?)([A-Za-z0-9_-]+):\s/g, '$1\x1b[1;33m$2\x1b[0m: ');

	// Replace list markers with different symbols based on depth
	line = line.replace(/^(\s*)[•-]\s/g, (match, spaces) => {
		const depth = spaces.length / 2;
		const bullets = ['•', '◦', '▪', '▫'];
		return `${spaces}\x1b[36m${bullets[depth % bullets.length]}\x1b[0m `;
	});

	// Format numbered lists
	line = line.replace(/^(\s*)\d+\.\s/g, (match, spaces) => {
		const depth = spaces.length / 2;
		const bullets = ['•', '◦', '▪', '▫'];
		return `${spaces}\x1b[36m${bullets[depth % bullets.length]}\x1b[0m `;
	});

	// Format headers (lines with = or - underneath)
	if (line.match(/^[=]+$/)) {
		return '\x1b[36m' + line.replace(/=/g, '═') + '\x1b[0m';
	}
	if (line.match(/^[-]+$/)) {
		return '\x1b[36m' + line.replace(/-/g, '─') + '\x1b[0m';
	}

	// Format code blocks (indented by 4 spaces or tab)
	if (line.match(/^(\s{4}|\t)/)) {
		line = line.replace(/^(\s{4}|\t)/, '\x1b[36m│\x1b[0m ');
		return '\x1b[90m' + line + '\x1b[0m';
	}

	// Format command examples (starting with $)
	if (line.trim().startsWith('$')) {
		line = '\x1b[32m' + line + '\x1b[0m'; // Green for commands
	}

	return line;
}

function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function renderContent(
	content: string[],
	cursor: CursorPosition,
	viewport: ViewportPosition,
) {
	// Only render visible content
	content
		.slice(viewport.start, viewport.start + viewport.size)
		.forEach((line, index) => {
			const actualIndex = index + viewport.start;
			const formattedLine = formatLine(line);

			if (actualIndex === cursor.row) {
				// Strip ANSI codes for cursor positioning
				const plainLine = stripAnsi(formattedLine);
				const visualCol = cursor.col;

				if (visualCol < plainLine.length) {
					let currentCol = 0;
					let visualCurrentCol = 0;
					let result = '';

					// Build the line with cursor
					for (let i = 0; i < formattedLine.length; i++) {
						if (formattedLine[i] === '\x1b') {
							// Copy ANSI escape sequence
							let escSeq = '\x1b';
							while (i < formattedLine.length && formattedLine[i] !== 'm') {
								i++;
								escSeq += formattedLine[i];
							}
							result += escSeq;
							continue;
						}

						if (visualCurrentCol === visualCol) {
							result += '\x1b[7m' + formattedLine[i] + '\x1b[0m';
						} else {
							result += formattedLine[i];
						}
						visualCurrentCol++;
					}
					console.log(result);
				} else {
					console.log(formattedLine + '\x1b[7m \x1b[0m');
				}
			} else {
				// Add some basic syntax highlighting
				if (line.match(/^[A-Za-z0-9].*[=]+$/)) {
					// Main headers (with === underneath)
					console.log(`\x1b[1;36m${formattedLine}\x1b[0m`);
				} else if (line.match(/^[A-Za-z0-9].*[-]+$/)) {
					// Sub headers (with --- underneath)
					console.log(`\x1b[1;34m${formattedLine}\x1b[0m`);
				} else if (line.trim().startsWith(':') && line.trim().endsWith(':')) {
					// Section headers
					console.log(`\x1b[1;35m${formattedLine}\x1b[0m`);
				} else if (line.match(/^(\s{4}|\t)/)) {
					// Code blocks
					console.log(`\x1b[90m${formattedLine}\x1b[0m`);
				} else {
					console.log(formattedLine);
				}
			}
		});

	// Add status line at bottom with more info
	console.log(
		`\x1b[7m ${t('docs.line', cursor.row + 1, content.length)}\x1b[0m`,
	);
}

export function getDocs() {
	const docsDir = join(__dirname, '..', 'docs');
	if (!existsSync(docsDir)) {
		throw new Error('Docs directory not found');
	}
	return readdirSync(docsDir).map((file) => file.replace('.txt', ''));
}

export function getDoc(command: string) {
	// Split command into filename and header parts
	const [fileName, headerName] = command.split('#');
	const docsDir = join(__dirname, '..', 'docs');

	if (!existsSync(docsDir)) {
		throw new Error('Docs directory not found');
	}

	// Get list of available docs
	const availableDocs = getDocs();
	if (!availableDocs.includes(fileName)) {
		throw new Error(
			`Document '${fileName}' not found. Available docs: ${availableDocs.join(', ')}`,
		);
	}

	const filePath = join(docsDir, `${fileName}.txt`);

	const context: TemplateContext = {
		vars,
		platform: process.platform,
		arch: process.arch,
		appName,
		version,
		locales: getLocales(),
		configPath: join(getConfigDir(), 'config.ini'),
		env: process.env,
	};

	const content = processTemplateDirectives(
		readFileSync(filePath, 'utf-8').split('\n'),
		context,
	);

	// If header is specified, verify it exists
	if (headerName) {
		const headerIndex = findHeader(content, headerName);
		if (headerIndex === -1) {
			// Get available headers for error message
			const headers = content
				.filter(
					(line) => line.trim().startsWith(':') && line.trim().endsWith(':'),
				)
				.map((line) => line.trim().replace(/:/g, '').trim());

			throw new Error(
				`Header '${headerName}' not found. Available headers: ${headers.join(', ')}`,
			);
		}
	}

	console.clear();

	startVimMode(content, headerName);
}
