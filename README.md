# Org Generator

A standalone web tool for generating enterprise organization charts from simple tabular data.

## Features

- Paste or upload org data (Excel)
- Live preview with zoom, pan, collapse/expand
- Theme switcher
- Export to PNG, PDF, and PPTX
- UI language toggle and document language toggle

## Quick Start

1. Open [index.html](index.html) in a modern browser.
2. Load sample data or upload an Excel file.
3. Adjust theme and layout.
4. Export to the required format.

## Data Format

Each row should follow:

`Level, Dept, Name, Title[, Color]`

Example:

```text
1, HQ, John Doe, CEO
2, Technology, Jane Smith, CTO
3, Software Dev, Bob Lee, Manager
```

## File Structure

- `index.html`: Main application (single-file app)
- `CHANGELOG.md`: Versioned change notes
- `CONTRIBUTING.md`: Contribution guidelines
- `SECURITY.md`: Vulnerability reporting policy

## Deployment

This project is intended for GitHub Pages deployment.

- Production URL (after Pages is enabled):
  `https://glen200392.github.io/org-gererator/`

## Automation

GitHub Actions included:

- `CI` (`.github/workflows/ci.yml`)
  - Runs on push/pull_request
  - Validates required files
  - Lints `index.html` with HTMLHint
  - Runs a Playwright smoke test against local server

- `Pages Healthcheck` (`.github/workflows/pages-healthcheck.yml`)
  - Runs daily and can be triggered manually
  - Verifies deployed GitHub Pages URL is reachable
  - Checks key HTML content markers

## Validation Notes

Recommended smoke checks before each release:

- Load sample data in both document languages
- Upload Excel and verify parsing
- Export PNG/PDF/PPTX and open the files
- Verify mobile and desktop layout behavior

## License

MIT. See [LICENSE](LICENSE).
