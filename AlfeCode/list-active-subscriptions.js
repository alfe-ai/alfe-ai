#!/usr/bin/env node

const https = require('https');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const shop = process.env.SHOPIFY_SHOP;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-01';
const mode = (process.env.SHOPIFY_LIST_MODE || 'contracts').toLowerCase();

function assertEnv() {
  if (!shop) {
    throw new Error('Missing SHOPIFY_SHOP in .env (example: your-store.myshopify.com)');
  }
  if (!token) {
    throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN in .env');
  }
}

function requestJson({ method, pathname, searchParams = null, body = null }) {
  return new Promise((resolve, reject) => {
    const pathWithQuery = searchParams ? `${pathname}?${new URLSearchParams(searchParams).toString()}` : pathname;

    const req = https.request(
      {
        hostname: shop,
        path: pathWithQuery,
        method,
        headers: {
          'X-Shopify-Access-Token': token,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) {
            return reject(new Error(`Shopify API ${res.statusCode}: ${data}`));
          }

          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (err) {
            reject(new Error(`Could not parse Shopify response as JSON: ${err.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function listCustomersFromSearch() {
  const query = process.env.SHOPIFY_CUSTOMER_QUERY || 'product_subscriber_status:subscribed';
  const response = await requestJson({
    method: 'GET',
    pathname: `/admin/api/${apiVersion}/customers/search.json`,
    searchParams: { query },
  });

  const customers = response.customers || [];
  if (!customers.length) {
    console.log(`No customers found for query: ${query}`);
    return;
  }

  console.table(
    customers.map((customer) => ({
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      state: customer.state,
      tags: customer.tags,
    }))
  );
}

async function listSubscriptionContracts() {
  const query = `
    query ListActiveSubscriptionContracts($first: Int!, $after: String) {
      subscriptionContracts(first: $first, after: $after, status: ACTIVE) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            status
            nextBillingDate
            customer {
              id
              firstName
              lastName
              email
            }
          }
        }
      }
    }
  `;

  const allContracts = [];
  let after = null;

  while (true) {
    const response = await requestJson({
      method: 'POST',
      pathname: `/admin/api/${apiVersion}/graphql.json`,
      body: { query, variables: { first: 100, after } },
    });

    if (response.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.errors, null, 2)}`);
    }

    const contracts = response.data?.subscriptionContracts;
    if (!contracts) {
      throw new Error(`Unexpected GraphQL payload: ${JSON.stringify(response, null, 2)}`);
    }

    for (const edge of contracts.edges) {
      allContracts.push(edge.node);
    }

    if (!contracts.pageInfo.hasNextPage) break;
    after = contracts.pageInfo.endCursor;
  }

  if (!allContracts.length) {
    console.log('No active subscription contracts found.');
    return;
  }

  console.table(
    allContracts.map((contract) => ({
      contract_id: contract.id,
      status: contract.status,
      next_billing_date: contract.nextBillingDate,
      customer_id: contract.customer?.id || '',
      customer_email: contract.customer?.email || '',
      customer_name: `${contract.customer?.firstName || ''} ${contract.customer?.lastName || ''}`.trim(),
    }))
  );
}

async function main() {
  assertEnv();

  if (mode === 'customers') {
    await listCustomersFromSearch();
    return;
  }

  await listSubscriptionContracts();
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
