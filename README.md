# Snap CLI

> **⚠️ Warning**
> 
> This codebase is being rewritten in C#. The current implementation is in TypeScript, but the transition to C# aims to improve performance, enhance scalability, and expand functionality. In future updates, expect significant changes in the project structure, dependencies, and installation instructions. Stay tuned!


This is a powerful Git workflow enhancement tool designed to streamline your version control experience with intuitive commands and additional features.

## Features

- **Smart Commit Management**
  - Push to branches with custom messages
  - Support for signed commits
  - Commit amending capabilities
  - Pre-commit hook integration

- **Branch Operations**
  - Create and delete branches
  - List local and remote branches
  - Easy branch switching
  - Force checkout options

- **Configuration Management**
  - Edit configuration via CLI
  - Support for multiple locales
  - Customizable editor preferences

- **Web Interface**
  - Real-time repository status
  - Branch visualization
  - Repository statistics
  - Auto-refresh capabilities

- **Enhanced Status Display**
  - Colorized output
  - Detailed file tracking
  - Branch status information
  - Commit statistics

## Installation

Install globally using npm:

```bash
npm install -g @chocodev/sn
```

Or yarn:

```bash
yarn global add @chocodev/sn
```

## Configuration

Configuration file is automatically created at:
- Windows: `%APPDATA%\snap-cli\config.ini`
- Unix/Mac: `~/.snap-cli/config.ini`

### Available Settings

```ini
[i18n]
locale = "en-US"  # default locale
```

## Internationalization

Snap CLI supports multiple languages. Set your preferred language in the configuration file:

```bash
snap config i18n.locale=es_ES
```

**Note:** To view the available locales, look in the [src/translations](src/translations) directory.

## License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for details.

## Author

Created by [chocoOnEstrogen](https://github.com/chocoOnEstrogen)
Inspired by [GIT](https://git-scm.com/)
