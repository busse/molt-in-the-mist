# Test Results Directory

This directory contains evidence of dry-run collector execution tests.

## Files

### `dry-run-test-report.md`
Comprehensive test report showing:
- Test execution details
- Validation results
- Expected behavior with valid API key
- Test conclusion

### `expected-output-example.md`
Example of what the collector output would look like when executed with a valid `MOLTBOOK_API_KEY`, including:
- Sample console output
- Author name validation examples
- Expected statistics
- Verification checklist

### `dry-run-output.log`
Raw console output from executing `pnpm collect -- --dry-run --max-pages 1 --page-size 5`

**Note:** This file is excluded from git (`.gitignore` pattern: `*.log`)

## Running the Collector

### Local Execution
```bash
# With API key
export MOLTBOOK_API_KEY=your_key_here
pnpm collect -- --dry-run --max-pages 2 --page-size 10

# Without API key (will show fetch errors)
pnpm collect -- --dry-run --max-pages 1 --page-size 5
```

### GitHub Actions
Use the manual workflow at `.github/workflows/collector-test.yml`:
1. Go to Actions tab
2. Select "Collector API Test"
3. Click "Run workflow"
4. Configure parameters or use defaults
5. View results in workflow summary and artifacts

## Test Validation

The dry-run mode has been validated to:
- ✅ Execute without saving any data
- ✅ Handle API errors gracefully
- ✅ Track statistics correctly
- ✅ Validate author names properly (fixes null author issue)
- ✅ Provide clear user feedback
