import { t } from '../i18n';
import http from 'http';
import { status } from './status';
import { branch, BranchInfo } from './branch';
import { formatRepoInfo, getCommitActivity, getContributorStats } from './info';
import { getHooks, HookData } from '../hooks';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// Add these constants at the top level
const CACHE_DURATION = 60000; // 1 minute cache
let cachedHtml: { content: string; timestamp: number } | null = null;

/**
 * Converts ANSI color codes to HTML span elements with corresponding styles
 *
 * @param {string} text - Text containing ANSI color codes
 * @returns {string} HTML formatted text with color styles
 */
function ansiToHtml(text: string): string {
	const ansiToHtmlMap: Record<string, string> = {
		// Styles
		'\u001b[1m': '<span style="font-weight: bold;">',
		'\u001b[2m': '<span style="opacity: 0.7;">',
		'\u001b[3m': '<span style="font-style: italic;">',
		'\u001b[4m': '<span style="text-decoration: underline;">',
		'\u001b[9m': '<span style="text-decoration: line-through;">',

		// Regular colors
		'\u001b[30m': '<span style="color: #666666;">', // Black
		'\u001b[31m': '<span style="color: #ff5f57;">', // Red
		'\u001b[32m': '<span style="color: #28c841;">', // Green
		'\u001b[33m': '<span style="color: #f3f99d;">', // Yellow
		'\u001b[34m': '<span style="color: #57acf5;">', // Blue
		'\u001b[35m': '<span style="color: #ff6ac1;">', // Magenta
		'\u001b[36m': '<span style="color: #5fcde4;">', // Cyan
		'\u001b[37m': '<span style="color: #ffffff;">', // White

		// Bright colors
		'\u001b[90m': '<span style="color: #999999;">', // Bright Black
		'\u001b[91m': '<span style="color: #ff7b72;">', // Bright Red
		'\u001b[92m': '<span style="color: #50fa7b;">', // Bright Green
		'\u001b[93m': '<span style="color: #f1fa8c;">', // Bright Yellow
		'\u001b[94m': '<span style="color: #82aaff;">', // Bright Blue
		'\u001b[95m': '<span style="color: #ff92df;">', // Bright Magenta
		'\u001b[96m': '<span style="color: #8be9fd;">', // Bright Cyan
		'\u001b[97m': '<span style="color: #ffffff;">', // Bright White

		// Background colors
		'\u001b[40m': '<span style="background-color: #666666;">', // Black
		'\u001b[41m': '<span style="background-color: #ff5f57;">', // Red
		'\u001b[42m': '<span style="background-color: #28c841;">', // Green
		'\u001b[43m': '<span style="background-color: #f3f99d;">', // Yellow
		'\u001b[44m': '<span style="background-color: #57acf5;">', // Blue
		'\u001b[45m': '<span style="background-color: #ff6ac1;">', // Magenta
		'\u001b[46m': '<span style="background-color: #5fcde4;">', // Cyan
		'\u001b[47m': '<span style="background-color: #ffffff;">', // White

		// Bright background colors
		'\u001b[100m': '<span style="background-color: #999999;">', // Bright Black
		'\u001b[101m': '<span style="background-color: #ff7b72;">', // Bright Red
		'\u001b[102m': '<span style="background-color: #50fa7b;">', // Bright Green
		'\u001b[103m': '<span style="background-color: #f1fa8c;">', // Bright Yellow
		'\u001b[104m': '<span style="background-color: #82aaff;">', // Bright Blue
		'\u001b[105m': '<span style="background-color: #ff92df;">', // Bright Magenta
		'\u001b[106m': '<span style="background-color: #8be9fd;">', // Bright Cyan
		'\u001b[107m': '<span style="background-color: #ffffff;">', // Bright White

		// Resets
		'\u001b[0m': '</span>', // Reset all
		'\u001b[22m': '</span>', // Reset bold/dim
		'\u001b[23m': '</span>', // Reset italic
		'\u001b[24m': '</span>', // Reset underline
		'\u001b[29m': '</span>', // Reset strikethrough
		'\u001b[39m': '</span>', // Reset foreground color
		'\u001b[49m': '</span>', // Reset background color
	};

	// Create a single regex pattern for all ANSI codes
	const ansiPattern = new RegExp(
		Object.keys(ansiToHtmlMap)
			.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('|'),
		'g',
	);

	// Use a single regex replace instead of multiple string splits
	let html = text.replace(ansiPattern, (match) => ansiToHtmlMap[match]);

	// Handle any nested tags that might have been created
	html = html.replace(/<\/span><span[^>]*>/g, '');

	// Ensure all spans are closed
	const openTags = (html.match(/<span/g) || []).length;
	const closeTags = (html.match(/<\/span>/g) || []).length;
	html += '</span>'.repeat(Math.max(0, openTags - closeTags));

	return html;
}

/**
 * Formats branch information into a human-readable HTML string
 *
 * @param {BranchInfo[]} branches - Array of branch information
 * @returns {string} Formatted HTML string showing branch status
 */
function formatBranchesHtml(branches: BranchInfo[]): string {
	if (branches.length === 0) {
		return t('web.no_branches');
	}

	return branches
		.map(
			(b) =>
				`${b.current ? '* ' : '  '}${b.name}${
					b.upstream ?
						` [${b.upstream}${b.ahead ? ` ahead ${b.ahead}` : ''}${
							b.behind ? ` behind ${b.behind}` : ''
						}]`
					:	''
				}`,
		)
		.join('\n');
}

/**
 * Formats hooks information into a human-readable HTML string
 *
 * @param {HookData[]} hooks - Array of hook data
 * @returns {string} Formatted HTML string showing hook status
 */
function formatHooksHtml(hooks: HookData[]): string {
	const enabledIcon = '🟢';
	const disabledIcon = '🔴';

	return hooks
		.map(
			(hook) =>
				`${hook.enabled ? enabledIcon : disabledIcon} ${hook.name} (${hook.type})`,
		)
		.join('\n');
}

/**
 * Generates the HTML page for the web interface
 *
 * @returns {Promise<string>} Complete HTML document as a string
 * @throws {Error} If status or branch information cannot be retrieved
 */
async function generateHtml(): Promise<string> {
	// Use cached version if available and not expired
	if (cachedHtml && Date.now() - cachedHtml.timestamp < CACHE_DURATION) {
		return cachedHtml.content;
	}

	// Fetch data concurrently instead of sequentially
	const [
		statusOutput,
		branches,
		repoInfo,
		hooks,
		contributorStats,
		commitActivity,
	] = await Promise.all([
		status(),
		branch(true),
		formatRepoInfo(),
		getHooks(),
		getContributorStats(),
		getCommitActivity(),
	]);

	const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${t('web.title')}</title>
            <style>
                body {
                    font-family: monospace;
                    background: #1e1e1e;
                    color: #d4d4d4;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .container {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                }
                .section {
                    background: #252526;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                h2 {
                    margin-top: 0;
                    color: #569cd6;
                    border-bottom: 1px solid #569cd6;
                    padding-bottom: 10px;
                }
                pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin: 0;
                }
                .refresh-button {
                    background: #0e639c;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-bottom: 20px;
                }
                .refresh-button:hover {
                    background: #1177bb;
                }
                .last-updated {
                    color: #858585;
                    font-size: 0.9em;
                    margin-bottom: 20px;
                }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
            <button class="refresh-button" onclick="window.location.reload()">
                ${t('web.refresh')}
            </button>
            <div class="last-updated">
                ${t('web.last_updated', new Date().toLocaleString())}
            </div>
            <div class="container">
                <div class="section">
                    <h2>${t('web.status')}</h2>
                    <pre>${ansiToHtml(statusOutput)}</pre>
                </div>
                <div class="section">
                    <h2>${t('web.branches')}</h2>
                    <pre>${ansiToHtml(formatBranchesHtml(branches))}</pre>
                </div>
                <div class="section">
                    <h2>${t('info.title')}</h2>
                    <pre>${ansiToHtml(repoInfo)}</pre>
                </div>
				<div class="section">
					<h2>${t('web.hooks')}</h2>
					<pre>${ansiToHtml(formatHooksHtml(hooks))}</pre>
				</div>
                <div class="section">
                    <h2>${t('web.commit_activity')}</h2>
                    <canvas id="commitChart"></canvas>
                </div>
                <div class="section">
                    <h2>${t('web.contributors')}</h2>
                    <canvas id="contributorChart"></canvas>
                </div>
            </div>
            <script>
                // Auto-refresh every 30 seconds
                setTimeout(() => window.location.reload(), 30000);

                // Contributor data
                const contributorData = {
                    names: ${JSON.stringify(contributorStats.names)},
                    commits: ${JSON.stringify(contributorStats.commits)}
                };

                // Create contributor chart
                if (contributorData.names.length > 0) {
                    new Chart(document.getElementById('contributorChart'), {
                        type: 'bar',
                        data: {
                            labels: contributorData.names,
                            datasets: [{
                                label: '${t('web.commits')}',
                                data: contributorData.commits,
                                backgroundColor: '#569cd6',
                                borderColor: '#569cd6',
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        stepSize: 1,
                                        color: '#d4d4d4'
                                    },
                                    grid: {
                                        color: '#333333'
                                    }
                                },
                                x: {
                                    ticks: {
                                        color: '#d4d4d4'
                                    },
                                    grid: {
                                        color: '#333333'
                                    }
                                }
                            }
                        }
                    });
                } else {
                    document.getElementById('contributorChart').parentElement.innerHTML += 
                        '<div style="text-align: center; color: #858585;">${t('web.contributor_data_not_available')}</div>';
                }

                // Commit activity data
                const commitData = {
                    dates: ${JSON.stringify(commitActivity.dates)},
                    commits: ${JSON.stringify(commitActivity.commits)}
                };

                // Create commit activity chart
                if (commitData.dates.length > 0) {
                    new Chart(document.getElementById('commitChart'), {
                        type: 'line',
                        data: {
                            labels: commitData.dates,
                            datasets: [{
                                label: '${t('web.commits')}',
                                data: commitData.commits,
                                borderColor: '#569cd6',
                                backgroundColor: 'rgba(86, 156, 214, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        stepSize: 1,
                                        color: '#d4d4d4'
                                    },
                                    grid: {
                                        color: '#333333'
                                    }
                                },
                                x: {
                                    ticks: {
                                        color: '#d4d4d4',
                                        maxRotation: 45,
                                        minRotation: 45
                                    },
                                    grid: {
                                        color: '#333333'
                                    }
                                }
                            }
                        }
                    });
                } else {
                    document.getElementById('commitChart').parentElement.innerHTML += 
                        '<div style="text-align: center; color: #858585;">${t('web.commit_activity_not_available')}</div>';
                }

            </script>
        </body>
        </html>
    `;

	// Cache the result
	cachedHtml = { content: html, timestamp: Date.now() };
	return html;
}

/**
 * Sets up graceful shutdown handlers for the HTTP server
 *
 * @param {http.Server} server - HTTP server instance
 */
function setupGracefulShutdown(server: http.Server) {
	const shutdown = () => {
		server.close(() => {
			console.log(`\n${t('web.server_stopped')}`);
			process.exit(0);
		});
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}

/**
 * Finds a random available port
 *
 * @returns {Promise<number>} Available port number
 */
const rndPort = (): Promise<number> => {
	return new Promise((resolve) => {
		const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
		const server = http.createServer();

		server.listen(port, () => {
			server.close(() => {
				resolve(port);
			});
		});

		server.on('error', () => {
			resolve(rndPort());
		});
	});
};

/**
 * Starts the web interface server
 *
 * @param {number} [port] - Port to listen on (random if not specified)
 * @throws {Error} If server fails to start
 */
export async function startServer(
	port: number | undefined = undefined,
): Promise<void> {
	const finalPort = port || (await rndPort());

	const server = http.createServer(async (req, res) => {
		// Add ETag support for caching
		const etag = `W/"${Date.now()}"`;
		res.setHeader('ETag', etag);

		if (req.headers['if-none-match'] === etag) {
			res.writeHead(304);
			res.end();
			return;
		}

		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		try {
			const html = await generateHtml();
			res.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
				'X-XSS-Protection': '1; mode=block',
			});
			res.end(html);
		} catch (error) {
			console.error(`${t('web.server_error')}: ${error}`);
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end(
				`${t('web.server_error')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	});

	server.on('error', (error: NodeJS.ErrnoException) => {
		if (error.code === 'EADDRINUSE') {
			console.error(`${t('web.port_in_use')}: ${finalPort}`);
		} else {
			console.error(`${t('web.server_error')}: ${error}`);
		}
		process.exit(1);
	});

	setupGracefulShutdown(server);

	server.listen(finalPort, () => {
		console.log(`${t('web.server_running', finalPort)}`);
	});
}
