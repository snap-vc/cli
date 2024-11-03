# Git Snap Hooks

Git Snap hooks are YAML-based configuration files that allow you to define and run custom commands at specific Git events.

## Hook Structure

Hooks are defined in YAML format with the following structure:

```yaml
name: "Hook Name"                # Required: Name of the hook
description: "Hook description"  # Optional: Description of what the hook does
run:                            # Required: Array of commands to execute
  - "command 1"
  - "command 2"
enabled: true                   # Optional: Enable/disable the hook (default: true)
failOnError: true              # Optional: Stop execution if command fails (default: true)
timeout: 30000                 # Optional: Timeout in milliseconds (default: 30000)
parallel: false                # Optional: Run commands in parallel (default: false)
workingDir: "./some/path"      # Optional: Working directory for commands (default: current directory)
env:                           # Optional: Additional environment variables
  KEY: "value"
  ANOTHER_KEY: "value"
onlyIf:                        # Optional: Conditional execution
  files:                       # Optional: Only run if these files exist (glob patterns)
    - "*.js"
    - "src/**/*.ts"
  env:                         # Optional: Only run if these environment variables exist
    - "NODE_ENV"
    - "CI"
  commands:                    # Optional: Only run if these commands succeed
    - "which docker"
  branches:                    # Optional: Only run on specific branches
    - "main"
    - "develop"
```

## Environment Variables

The following environment variables are automatically available in your hooks:

- `SNAP_HOOK_NAME`: The name of the current hook
- `SNAP_HOOK_NODE_VERSION`: The Node.js version being used
- All system environment variables are also available

They are in the following format:

```yaml
run:
  - "echo $SNAP_HOOK_NAME"
  - "echo Current user: $USER"
```

## Examples

### Basic Hook
```yaml
name: "Lint"
description: "Run ESLint on staged files"
run:
  - "eslint ."
```

### Advanced Hook with Conditions
```yaml
name: "Docker Build"
description: "Build Docker image on main branch"
run:
  - "docker build -t myapp ."
onlyIf:
  branches:
    - "main"
  commands:
    - "which docker"
failOnError: true
timeout: 300000
```

### Parallel Execution
```yaml
name: "Test Suite"
description: "Run different test suites in parallel"
parallel: true
run:
  - "npm run test:unit"
  - "npm run test:integration"
  - "npm run test:e2e"
```

## Hook Location

Hooks should be placed in the `.snap/hooks/` directory of your repository. The filename should match the Git hook name you want to trigger (e.g., `pre-commit`, `pre-push`, etc.).

## Common Git Hooks

- `pre-commit`: Runs before committing changes
- `prepare-commit-msg`: Runs before the commit message editor is launched
- `commit-msg`: Runs to validate commit messages
- `post-commit`: Runs after a commit is created
- `pre-push`: Runs before pushing changes
- `post-merge`: Runs after a merge is completed
- `pre-rebase`: Runs before rebasing

## Error Handling

- If `failOnError` is true (default), the hook will stop execution when a command fails
- If `failOnError` is false, the hook will continue execution even if a command fails
- Error messages and stack traces will be displayed in the console

## Best Practices

1. Keep hooks focused and simple
2. Use descriptive names and descriptions
3. Set appropriate timeouts for long-running commands
4. Use conditional execution to prevent unnecessary runs
5. Consider using parallel execution for independent tasks
6. Add proper error handling with `failOnError`
7. Use environment variables for sensitive information