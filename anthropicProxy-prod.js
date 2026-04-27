/**
 * FSP Sales Brief Tool — Azure Function Proxy
 * Version 3.0 — Apollo.io + Anthropic integration
 * Rewritten for Azure Functions v4 programming model
 *
 * Environment variables required:
 *   ANTHROPIC_API_KEY   — Anthropic API key
 *   APOLLO_API_KEY      — Apollo.io API key
 *   POWER_AUTOMATE_URL  — Power Automate HTTP trigger URL
 */

const { app } = require('@azure/functions');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ── APOLLO: SEARCH FOR PERSON ──
async function apolloSearchPerson(apiKey, firstName, lastName, companyName) {
  try {
    const resp = await fetch(`${APOLLO_BASE}/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        organization_name: companyName,
        reveal_personal_emails: false
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Apollo person match failed: ${resp.status} — ${err}`);
      return null;
    }

    const data = await resp.json();
    return data.person || null;

  } catch (err) {
    console.error(`Apollo person search error: ${err.message}`);
    return null;
  }
}

// ── APOLLO: SEARCH FOR ORGANIZATION ──
async function apolloSearchOrganization(apiKey, companyName) {
  try {
    const searchResp = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        q_organization_name: companyName,
        per_page: 1
      })
    });

    if (!searchResp.ok) return null;
    const data = await searchResp.json();
    const orgs = data.organizations || data.accounts || [];
    return orgs.length > 0 ? orgs[0] : null;

  } catch (err) {
    console.error(`Apollo org search error: ${err.message}`);
    return null;
  }
}

// ── FORMAT APOLLO DATA AS PROMPT CONTEXT ──
function formatApolloContext(person, organization) {
  const lines = [
    'APOLLO.IO VERIFIED INTELLIGENCE — USE THIS DATA PREFERENTIALLY OVER ASSUMPTIONS:',
    'Source: Apollo.io live database — verified professional data',
    ''
  ];

  if (person) {
    lines.push('CONTACT — APOLLO VERIFIED:');

    const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
    if (name) lines.push(`  Full name: ${name}`);
    if (person.title) lines.push(`  Verified title: ${person.title}`);
    if (person.headline) lines.push(`  Headline: ${person.headline}`);
    if (person.seniority) lines.push(`  Seniority level: ${person.seniority}`);

    if (person.departments && person.departments.length > 0) {
      lines.push(`  Department: ${person.departments.join(', ')}`);
    }
    if (person.subdepartments && person.subdepartments.length > 0) {
      lines.push(`  Sub-department: ${person.subdepartments.join(', ')}`);
    }

    if (person.email) lines.push(`  Verified email: ${person.email}${person.email_status ? ` (status: ${person.email_status})` : ''}`);
    if (person.phone) lines.push(`  Phone: ${person.phone}`);

    const location = [person.city, person.state, person.country].filter(Boolean).join(', ');
    if (location) lines.push(`  Location: ${location}`);
    if (person.time_zone) lines.push(`  Time zone: ${person.time_zone}`);

    if (person.linkedin_url) lines.push(`  LinkedIn: ${person.linkedin_url}`);

    if (person.employment_history && person.employment_history.length > 0) {
      const current = person.employment_history.find(j => j.current);
      const prior = person.employment_history.filter(j => !j.current).slice(0, 4);

      if (current) {
        const since = current.start_date ? ` (since ${current.start_date.substring(0, 7)})` : '';
        lines.push(`  Current role: ${current.title || 'Unknown title'} at ${current.organization_name || 'Unknown company'}${since}`);
      }

      if (prior.length > 0) {
        lines.push('  Prior roles (verified career history):');
        prior.forEach(job => {
          const start = job.start_date ? job.start_date.substring(0, 7) : '';
          const end = job.end_date ? job.end_date.substring(0, 7) : 'current';
          const period = start || end ? ` (${start}–${end})` : '';
          lines.push(`    • ${job.title || 'Unknown title'} at ${job.organization_name || 'Unknown company'}${period}`);
        });
      }
    }

    lines.push('');
  } else {
    lines.push('CONTACT: Not found in Apollo database — use context and best-judgment profiling.');
    lines.push('');
  }

  if (organization) {
    lines.push('COMPANY — APOLLO VERIFIED:');

    if (organization.name) lines.push(`  Company name: ${organization.name}`);
    if (organization.website_url) lines.push(`  Website: ${organization.website_url}`);
    if (organization.industry) lines.push(`  Industry: ${organization.industry}`);

    if (organization.estimated_num_employees) {
      lines.push(`  Employees: ${Number(organization.estimated_num_employees).toLocaleString()}`);
    }
    if (organization.annual_revenue || organization.organization_revenue) {
      const rev = organization.annual_revenue || organization.organization_revenue;
      const revPrinted = organization.annual_revenue_printed || organization.organization_revenue_printed;
      lines.push(`  Revenue: ${revPrinted ? '$' + revPrinted : '$' + Number(rev).toLocaleString()}`);
    }

    if (organization.founded_year) lines.push(`  Founded: ${organization.founded_year}`);
    if (organization.publicly_traded_symbol) {
      lines.push(`  Publicly traded: ${organization.publicly_traded_symbol} (${organization.publicly_traded_exchange || 'exchange unknown'})`);
    }
    if (organization.owned_by_organization && organization.owned_by_organization.name) {
      lines.push(`  Owned by: ${organization.owned_by_organization.name}`);
    }

    const orgLocation = [organization.city, organization.state, organization.country].filter(Boolean).join(', ');
    if (orgLocation) lines.push(`  Headquarters: ${orgLocation}`);

    if (organization.short_description) {
      const desc = organization.short_description.substring(0, 300);
      lines.push(`  Description: ${desc}${organization.short_description.length > 300 ? '...' : ''}`);
    }

    if (organization.technology_names && organization.technology_names.length > 0) {
      const allTech = organization.technology_names.slice(0, 20).join(', ');
      lines.push(`  Technology stack: ${allTech}`);

      const hvacTech = organization.technology_names.filter(t =>
        /hvac|facility|facilities|building|bms|bac|energy|maintenance|cmms/i.test(t)
      );
      if (hvacTech.length > 0) {
        lines.push(`  ⚡ HVAC/Facilities technology detected: ${hvacTech.join(', ')} — mention compatibility in the brief`);
      }
    }

    if (organization.organization_headcount_six_month_growth !== undefined) {
      const growth6m = (organization.organization_headcount_six_month_growth * 100).toFixed(1);
      const growth12m = organization.organization_headcount_twelve_month_growth !== undefined
        ? (organization.organization_headcount_twelve_month_growth * 100).toFixed(1) : null;
      const signal = parseFloat(growth6m) > 2 ? 'Growing' : parseFloat(growth6m) < -2 ? 'Contracting' : 'Stable';
      lines.push(`  Headcount trend: ${signal} (6-month: ${growth6m > 0 ? '+' : ''}${growth6m}%${growth12m ? `, 12-month: ${growth12m > 0 ? '+' : ''}${growth12m}%` : ''})`);
    }

    if (organization.suborganizations && organization.suborganizations.length > 0) {
      const subs = organization.suborganizations.map(s => s.name).join(', ');
      lines.push(`  Subsidiaries: ${subs}`);
    }

    lines.push('');
  } else {
    lines.push('COMPANY: Not found in Apollo database — use context and best-judgment profiling.');
    lines.push('');
  }

  lines.push('INSTRUCTION: Where Apollo provides verified data, use it directly in the brief rather than generating assumptions.');
  lines.push('Verified email, LinkedIn URL, career history, company revenue, employee count, and tech stack should be treated as facts.');
  lines.push('When Apollo data is not available for a field, use context and best-judgment as normal.');
  lines.push('Do NOT mention "Apollo" or "Apollo.io" anywhere in the generated brief — use "verified" or "confirmed" instead.');

  return lines.join('\n');
}

// ── MAIN HANDLER (Azure Functions v4) ──
app.http('anthropicProxy', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, anthropic-version',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return { status: 200, headers: corsHeaders, body: '' };
    }

    try {
      const body = await request.json();
      const { model, max_tokens, system, messages } = body;

      if (!messages || !messages.length) {
        return {
          status: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing messages' })
        };
      }

      const contactName = (body.contactName || '').trim();
      const companyName = (body.companyName || '').trim();
      const jobTitle    = (body.jobTitle    || '').trim();

      let apolloContext = '';
      const apolloKey = process.env.APOLLO_API_KEY;

      // ── APOLLO ENRICHMENT ──
      if (apolloKey && contactName && companyName) {
        try {
          context.log(`Apollo: looking up "${contactName}" at "${companyName}"`);

          const nameParts = contactName.trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          const [person, organization] = await Promise.all([
            apolloSearchPerson(apolloKey, firstName, lastName, companyName),
            apolloSearchOrganization(apolloKey, companyName)
          ]);

          const personFound = !!(person && (person.email || person.title || person.linkedin_url));
          const orgFound = !!(organization && (organization.name || organization.industry));

          apolloContext = formatApolloContext(person, organization);

          context.log(`Apollo: enrichment complete. Contact found: ${personFound}. Org found: ${orgFound}. Email: ${person?.email || 'none'}`);

        } catch (apolloErr) {
          context.warn(`Apollo enrichment failed (non-fatal): ${apolloErr.message}`);
          apolloContext = 'APOLLO: Enrichment unavailable for this request — use context and best-judgment profiling.';
        }
      }

      // ── INJECT APOLLO CONTEXT INTO MESSAGES ──
      let enrichedMessages = messages;
      if (apolloContext) {
        enrichedMessages = messages.map((msg, idx) => {
          if (idx === messages.length - 1 && msg.role === 'user') {
            return {
              ...msg,
              content: `${apolloContext}\n\n---\n\n${msg.content}`
            };
          }
          return msg;
        });
      }

      // ── ANTHROPIC API CALL ──
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return {
          status: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Anthropic API key not configured' })
        };
      }

      const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: max_tokens || 8000,
          system,
          messages: enrichedMessages
        })
      });

      const anthropicData = await anthropicResp.json();

      context.log(`Brief generated — OpCo: ${body.opco || 'unknown'} — Tokens: ${JSON.stringify(anthropicData.usage)} — Apollo enriched: ${!!apolloContext}`);

      // ── POWER AUTOMATE LOGGING (fire and forget) ──
      const paUrl = process.env.POWER_AUTOMATE_URL;
      if (paUrl) {
        fetch(paUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            salesperson: body.salesperson || '',
            contact: contactName,
            company: companyName,
            opco: body.opco || '',
            callType: body.callType || '',
            apolloEnriched: !!(apolloContext && !apolloContext.includes('unavailable')),
            tokensUsed: anthropicData.usage?.output_tokens || 0
          })
        }).catch(e => context.warn(`Power Automate logging failed: ${e.message}`));
      }

      return {
        status: anthropicResp.status,
        headers: corsHeaders,
        body: JSON.stringify(anthropicData)
      };

    } catch (err) {
      context.error(`Function error: ${err.message}`);
      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message })
      };
    }
  }
});
