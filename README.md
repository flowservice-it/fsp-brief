# FSP Sales Intelligence Brief
**Version 3.0 — Apollo.io + Anthropic AI Integration**

AI-powered pre-call sales intelligence for Flow Service Partners salespeople. Generates detailed, contact-enriched briefs using verified data from Apollo.io and AI analysis from Anthropic Claude.

**Live URL:** [salesbrief.flowservice.com](https://salesbrief.flowservice.com)

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Repository Structure](#repository-structure)
3. [Environment Variables](#environment-variables)
4. [Deployment Guide](#deployment-guide)
5. [Dev / Staging Environment](#dev--staging-environment)
6. [How Updates Work](#how-updates-work)
7. [Known Bugs & Fixes](#known-bugs--fixes)
8. [Troubleshooting](#troubleshooting)
9. [Contacts](#contacts)

---

## System Architecture

```
Browser (salesbrief.flowservice.com)
        │
        │  POST /api/anthropicProxy
        ▼
Azure Function App (fsp-brief-proxy)
  fsp-brief-proxy-czczcdejf9d9dvdv.centralus-01.azurewebsites.net
        │
        ├──► Apollo.io API (contact + company enrichment)
        │
        └──► Anthropic API (Claude AI brief generation)
                │
                └──► Power Automate HTTP trigger
                            │
                            └──► SharePoint List (FSP Brief Usage Log)
```

### Components

| Component | Resource | Notes |
|-----------|----------|-------|
| **Frontend** | Azure Static Web App (`fsp-brief`) | Auto-deploys from GitHub on push to main |
| **Proxy / Backend** | Azure Function App (`fsp-brief-proxy`) | Node.js, Consumption plan, Central US |
| **Custom Domain** | `salesbrief.flowservice.com` | Standard plan required for password protection |
| **Usage Logging** | Power Automate → SharePoint | List: FSP Brief Usage Log |
| **Resource Group** | `fsp-tools-rg` | All resources live here |

### Runtime Details

- Azure Functions **v4 programming model** — functions register via code (`app.http()`), not `function.json`
- Node.js 20 LTS
- `@azure/functions` v4 package required
- `AzureWebJobsFeatureFlags = EnableWorkerIndexing` environment variable required for v4

---

## Repository Structure

### Azure Function Repo (this repo)

```
/
├── src/
│   └── functions/
│       └── anthropicProxy.js    ← Main function file
├── host.json                    ← Azure Functions host config
├── package.json                 ← Node dependencies
└── package-lock.json            ← Auto-generated, do not edit
```

### Static Web App Repo (`fsp-brief`)

```
/
└── index.html                   ← The HTML tool (deployed to salesbrief.flowservice.com)
```

---

## Environment Variables

Set in Azure Portal → `fsp-brief-proxy` → Settings → Environment Variables.

| Variable | Description | Who Provides It |
|----------|-------------|-----------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Scott Gugenheim |
| `APOLLO_API_KEY` | Apollo.io API key | Scott Gugenheim |
| `POWER_AUTOMATE_URL` | Power Automate HTTP trigger URL for usage logging | John Jessee |
| `AzureWebJobsFeatureFlags` | Must be set to `EnableWorkerIndexing` for v4 runtime | John Jessee |

> ⚠️ **Never delete or modify `ANTHROPIC_API_KEY` or `POWER_AUTOMATE_URL` during updates. Only add new variables.**

---

## Deployment Guide

### Prerequisites

- Access to [portal.azure.com](https://portal.azure.com) with Flow Service Partners account
- Access to the GitHub repositories (`flowservice-it/fsp-brief` and the Function App repo)
- The updated files from Scott Gugenheim

---

### STEP 1 — Add New Environment Variables (if any)

1. Go to **portal.azure.com**
2. Search for **fsp-brief-proxy** and open the Function App
3. Left sidebar → **Settings → Environment variables**
4. Add any new variables (e.g. `APOLLO_API_KEY`)
5. Click **Apply** → **Save**
6. Wait ~90 seconds for the Function App to restart

---

### STEP 2 — Deploy Updated Azure Function (`anthropicProxy.js`)

The function file lives at `src/functions/anthropicProxy.js` in the Function App GitHub repo.

**Via GitHub (preferred):**
1. Open the Function App GitHub repository
2. Navigate to `src/functions/anthropicProxy.js`
3. Click the pencil (Edit) icon
4. Replace the entire file contents with the new version
5. Commit with a descriptive message (e.g. `v3.0 Apollo integration`)
6. Push to `main` — Azure auto-deploys within 2-3 minutes

**Via Kudu ZIP Deploy:**

> Use this method only if GitHub auto-deploy is not configured.

Prepare the ZIP with this exact structure (files at root, no wrapper folder):
```
yourfile.zip
├── host.json
├── package.json
└── src/
    └── functions/
        └── anthropicProxy.js
```

> ⚠️ **Mac users:** Do NOT zip the folder itself. Open the folder, select all files inside, then compress. Otherwise Mac adds a `__MACOSX` folder and an extra wrapper directory that breaks the deployment.

Deploy:
1. Go to **fsp-brief-proxy** → **Advanced Tools → Go** (opens Kudu)
2. **Tools → Zip Push Deploy**
3. Drag and drop the ZIP file
4. Wait for success confirmation
5. In Kudu **Debug Console → CMD**, run:
   ```
   cd site\wwwroot
   npm install
   ```
6. Wait for `found 0 vulnerabilities`

After deploying, verify the function registered:
- Go to **fsp-brief-proxy** → **Functions**
- Confirm `anthropicProxy` appears in the list

---

### STEP 3 — Deploy Updated HTML Tool (`index.html`)

1. Open the **fsp-brief** GitHub repository
2. Navigate to `index.html` at the root
3. Click the pencil (Edit) icon
4. Replace the entire file contents with the new version
5. Commit and push to `main`
6. Azure Static Web App auto-deploys within 2-3 minutes

---

### STEP 4 — Verify

1. Go to [salesbrief.flowservice.com](https://salesbrief.flowservice.com)
2. Confirm the new design loads
3. Generate a test brief using:
   - **Contact:** Alex Bristol
   - **Title:** Facilities Manager
   - **Company:** Genesis Healthcare
   - **City:** Rosedale, MD
   - Any OpCo, First Call / Discovery, On-Site
4. Verify the loading animation appears during generation
5. Verify the brief generates successfully

**Check Azure Function logs:**
- Go to **fsp-brief-proxy** → **Monitor → Log stream**
- After generating, you should see:
  ```
  Apollo: looking up "Alex Bristol" at "Genesis Healthcare"
  Apollo: enrichment complete. Contact found: true. Org found: true.
  ```

---

## Dev / Staging Environment

Always test updates in the dev environment before touching production.

### Dev Resources

| Component | Resource |
|-----------|----------|
| **Dev Function App** | `fsp-brief-proxy-dev` |
| **Dev Function URL** | `https://fsp-brief-proxy-dev-ebhygsbvd2ekb0g2.centralus-01.azurewebsites.net/api/anthropicProxy` |
| **Dev HTML** | Local file — swap proxy URL to dev URL for testing |

### Dev Environment Setup

The dev Function App (`fsp-brief-proxy-dev`) is already configured in `fsp-tools-rg` on the Consumption plan.

**Environment variables required on dev:**
- `ANTHROPIC_API_KEY` — same value as prod
- `APOLLO_API_KEY` — same value as prod
- `POWER_AUTOMATE_URL` — same value as prod (or omit to skip usage logging during tests)
- `AzureWebJobsFeatureFlags` = `EnableWorkerIndexing`

**CORS on dev:** Delete all entries from the Azure Portal CORS settings for `fsp-brief-proxy-dev`. The function code handles CORS itself — portal CORS settings conflict with it.

### Testing Locally

To test against the dev function from a local HTML file:

1. Open `index.html` (or `hvac-sales-prep.html`) in a text editor
2. Find the `PROXY_URL` constant (around line 812) and the fetch call (around line 1260)
3. Replace both instances of the production URL with the dev URL:
   ```
   https://fsp-brief-proxy-dev-ebhygsbvd2ekb0g2.centralus-01.azurewebsites.net/api/anthropicProxy
   ```
4. Save and open the file in Edge or Chrome
5. The browser will show a `file:// origin 'null'` warning in the console — this is harmless and expected
6. Generate a test brief and check the dev function logs

> ⚠️ Always swap the URL back to production before deploying to the Static Web App.

---

## How Updates Work

Scott Gugenheim (CRO) develops the HTML tool and provides updated files. John Jessee (IT) deploys them.

### Scott's Responsibilities
- Developing and testing the HTML tool locally
- Providing updated `hvac-sales-prep.html` / `index.html` files
- Managing the Anthropic and Apollo API keys
- Writing and updating the AI system prompt inside the HTML

### John's Responsibilities
- Deploying files to Azure (Function App and Static Web App)
- Managing Azure environment variables
- Managing the dev environment
- Monitoring usage logs in SharePoint

### Important Notes for Scott

When providing updated HTML files, ensure the following are NOT present:

1. **No duplicate `</html>` tags** — the file must have exactly one `</html>` at the very end. Any JavaScript after the closing `</html>` tag will be ignored by browsers.

2. **No unclosed block comments in `<script>` tags** — a `/*` without a matching `*/` will comment out all JavaScript below it, silently breaking the tool. The decorative comment block at the top of the `<script>` section must open and close within a few lines.

3. **No inline `style="display:none"` on `#loadingState` or `#errorMsg`** — these elements are controlled by CSS classes (`.visible`). Inline styles override CSS classes and will prevent the loading animation and error messages from appearing.

4. **Proxy URL** — the HTML file must reference the Azure Function proxy URL, not the Anthropic API directly. The proxy URL is:
   ```
   https://fsp-brief-proxy-czczcdejf9d9dvdv.centralus-01.azurewebsites.net/api/anthropicProxy
   ```

5. **Azure Function runtime** — `anthropicProxy.js` must use the **Azure Functions v4 programming model**. This means:
   ```javascript
   // ✅ CORRECT — v4 style
   const { app } = require('@azure/functions');
   app.http('anthropicProxy', {
     methods: ['GET', 'POST', 'OPTIONS'],
     authLevel: 'anonymous',
     handler: async (request, context) => { ... }
   });

   // ❌ WRONG — old v1/v2 style (will not work)
   module.exports = async function (context, req) { ... }
   ```

---

## Known Bugs & Fixes

These bugs were found in the v3.0 files provided by Scott and fixed during the April 2026 deployment. Scott has been informed.

### Bug 1 — Duplicate `</html>` Tags
**File:** `hvac-sales-prep.html`
**Problem:** The file contained `</body></html>` followed by additional JavaScript, then another `</body></html>`. Browsers rendered the page as plain text.
**Fix:** Truncated the file at the first `</html>` tag.

### Bug 2 — Unclosed Block Comment
**File:** `hvac-sales-prep.html`
**Problem:** The `<script>` section opened with `/* ════` — a block comment that was never closed until line 806. This silently commented out `loadingMessages`, `buildCustomerContext`, and `showError`, breaking brief generation entirely.
**Fix:** Replaced the broken comment opener with a properly formed and closed block comment.

### Bug 3 — Inline Style Overriding Loading Animation
**File:** `hvac-sales-prep.html`
**Problem:** `#loadingState` and `#errorMsg` had `style="display:none;"` as inline attributes. When JavaScript added the `.visible` CSS class, the inline style took precedence and the elements never appeared.
**Fix:** Removed the inline `style` attributes. The CSS already handles hide/show via `#loadingState { display:none; }` and `#loadingState.visible { display:block; }`.

### Bug 4 — Wrong Azure Functions Runtime Version
**File:** `azure-function-index.js`
**Problem:** Scott's file used the old v1/v2 export style (`module.exports = async function(context, req)`). The production Function App runs v4, which uses `app.http()` registration. The function appeared in Azure but never registered and could not be invoked.
**Fix:** Rewrote `anthropicProxy.js` using the v4 `app.http()` pattern.

### Bug 5 — Stray Apollo API Call
**File:** `azure-function-index.js`
**Problem:** `apolloSearchOrganization()` made an extra GET request to `/organizations/enrich` with no parameters before the actual search. This always failed silently but consumed an Apollo API credit on every brief generation.
**Fix:** Removed the stray GET call. Only the `mixed_companies/search` POST is made.

---

## Troubleshooting

### Tool loads but brief doesn't generate — no error shown
- Open browser DevTools (F12) → Console tab
- Click Generate and check for red errors
- Common causes: missing required form fields, JavaScript error in rendering

### CORS error in browser console
- Do NOT add entries to the Azure Portal CORS settings — this conflicts with the function code
- Delete all entries from **fsp-brief-proxy → API → CORS** and let the function handle it
- Restart the Function App after making CORS changes

### `anthropicProxy` not appearing in Functions list
- Confirm `AzureWebJobsFeatureFlags = EnableWorkerIndexing` is set in environment variables
- Confirm the function file is at `src/functions/anthropicProxy.js` (not at root)
- Run `npm install` in Kudu after every ZIP deploy
- Check Kudu → Debug Console → CMD → `dir site\wwwroot` to confirm folder structure

### Apollo enrichment not working
- Confirm `APOLLO_API_KEY` is saved in environment variables (not just entered — must be saved)
- Confirm Function App restarted after adding the variable
- Check Log stream for `Apollo enrichment failed` messages and the error text

### Brief generates but looks like old design
- Clear browser cache: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Confirm the HTML file was pushed to the correct repo (Static Web App repo, not Function App repo)
- Wait 3-5 minutes — Static Web App deployments can be slower than Function deployments

### npm install fails with `package.json not found`
- The ZIP structure is wrong — files landed in a subfolder instead of at root
- In Kudu CMD, run `dir site\wwwroot` to see what's there
- Delete the wrong folders, rebuild the ZIP correctly, and redeploy
- See [STEP 2 — Deploy Updated Azure Function](#step-2--deploy-updated-azure-function) for correct ZIP structure

### Function App shows Flex Consumption plan (no Kudu)
- Kudu is not available on Flex Consumption — delete and recreate on **Consumption (Serverless)** plan
- Consumption plan is correct for this use case and costs nothing when idle

---

## Contacts

| Role | Name | Responsibility |
|------|------|----------------|
| **CRO / Tool Developer** | Scott Gugenheim | HTML tool development, API keys, system prompt |
| **IT / Azure** | John Jessee | Azure deployment, environment variables, dev environment |

> Questions about deployment: contact John Jessee directly.
> Questions about the tool or API keys: contact Scott Gugenheim directly.
> Do NOT contact Apollo.io support — the API key is Scott's account.

---

*Last updated: April 27, 2026 — v3.0 Apollo.io integration deployment*
