# Collector API Testing Workflow

This directory contains the manual GitHub Actions workflow for testing the Moltbook API collector without saving data.

## Workflows

### `collector-test.yml` - Collector API Test

**Purpose:** Validates the collector's ability to fetch and process API responses without saving data.

**Trigger:** Manual only (`workflow_dispatch`)

**Important:** This workflow makes real API calls to Moltbook. Keep the `max_pages` parameter low to minimize API usage and respect rate limits.

## Usage

### Running the Test

1. Go to the **Actions** tab in the GitHub repository
2. Select **"Collector API Test"** from the workflows list
3. Click **"Run workflow"**
4. Configure the test parameters:
   - **Collection mode:** `influencer-first` (default) or `full`
   - **Max pages:** Number of pages to fetch (default: 2, recommended: keep ≤ 5)
   - **Page size:** Items per page (default: 10)
   - **Submolts:** Optional comma-separated list of submolts to test

5. Click **"Run workflow"** to start the test

### Viewing Results

**Workflow Summary:**
- After the workflow completes, view the summary by clicking on the workflow run
- The summary shows:
  - Configuration used
  - Collector output
  - Success/failure status

**Detailed Logs:**
- Download the `collector-test-logs-*` artifact for the complete console output
- Download the `collector-test-report-*` artifact for a formatted test report

**Artifacts are retained for 30 days**

## Example Scenarios

### Quick API Connectivity Test
```
Mode: influencer-first
Max pages: 1
Page size: 10
Submolts: (empty)
```
This makes minimal API calls to verify connectivity and authentication.

### Test Specific Submolt
```
Mode: influencer-first
Max pages: 2
Page size: 10
Submolts: ai-discussion
```
Tests collection from a specific submolt.

### Test Multiple Submolts
```
Mode: influencer-first
Max pages: 2
Page size: 10
Submolts: ai-discussion,announcements
```
Tests collection from multiple submolts.

## What Gets Tested

The workflow runs the collector with `--dry-run` flag, which:
- ✅ Fetches data from the Moltbook API
- ✅ Validates API responses
- ✅ Tests authentication with `MOLTBOOK_API_KEY` secret
- ✅ Validates data normalization (including author name handling)
- ✅ Tracks statistics (posts, comments, agents found)
- ❌ Does NOT save any data to disk
- ❌ Does NOT create output directories

## Requirements

**Secret:** `MOLTBOOK_API_KEY` must be configured in the repository secrets.

To add the secret:
1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Name: `MOLTBOOK_API_KEY`
4. Value: Your Moltbook API key
5. Click **"Add secret"**

## Interpreting Results

### Success
If the workflow completes successfully (green checkmark):
- API connectivity is working
- Authentication is valid
- All API responses are being processed correctly
- No errors in data normalization

### Failure
If the workflow fails (red X):
- Check the logs for specific error messages
- Common issues:
  - Missing or invalid `MOLTBOOK_API_KEY`
  - API rate limiting
  - Network connectivity issues
  - API response format changes

## Best Practices

1. **Minimize API calls:** Keep `max_pages` low (≤ 5) to respect API rate limits
2. **Test before major changes:** Run this test before making significant collector changes
3. **Regular validation:** Run periodically to ensure API compatibility
4. **Review logs:** Always check the artifacts for detailed output

## Security Note

This workflow uses the `MOLTBOOK_API_KEY` secret but does not expose it in logs. The dry-run mode ensures no data is persisted, making it safe for testing.
