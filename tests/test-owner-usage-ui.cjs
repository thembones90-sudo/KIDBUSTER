'use strict';
// Owner Usage & Costs UI regression: collapsed, compact, owner-authenticated,
// estimate labeling, time switch, no unsafe rendering or external calls.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run() {
  const { check, getFailures } = createChecker();
  console.log('\n=== test-owner-usage-ui.cjs ===');
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await puppeteer.launch({ headless:true, ...(executablePath ? {executablePath} : {}), args:['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href, {waitUntil:'load'});
    check('owner stats added only once, collapsed', await page.evaluate(() => {
      const panel = document.getElementById('ownerUsage');
      return !!panel && !panel.open && document.querySelectorAll('#ownerUsage').length === 1;
    }));
    check('only three visible headline metrics', await page.$$eval('#ownerUsage .owner-usage-metric', els => els.length === 3));
    check('not a full-page dashboard', await page.$eval('#ownerUsage', el => !!el.closest('#accountOwnerTools')));

    const api = {
      schema:'pathfinder-usage-stats-v1',
      baseline:{firstRecordedAt:'2026-10-19T10:12:00.000Z'},
      lifetime:{
        reports:1234,
        allModelCalls:{knownNanoUsd:6420000000,unknownCalls:2,undeliveredRuns:3},
        deliveredSpend:{avgKnownNanoUsdPerReport:4800000,unknownCalls:1},
        byProtocol:{MA:{reports:900,apiSpend:{knownNanoUsd:3600000000,unknownCalls:0},deliveredSpend:{knownNanoUsd:3400000000,unknownCalls:0}},PREPLY:{reports:334,apiSpend:{knownNanoUsd:2500000000,unknownCalls:1},deliveredSpend:{knownNanoUsd:2100000000,unknownCalls:1}}}
      },
      currentMonth:{
        reports:57,
        allModelCalls:{knownNanoUsd:400000000,unknownCalls:0,undeliveredRuns:0},
        deliveredSpend:{avgKnownNanoUsdPerReport:6000000,unknownCalls:0},
        byProtocol:{MA:{reports:57,apiSpend:{knownNanoUsd:400000000,unknownCalls:0},deliveredSpend:{knownNanoUsd:350000000,unknownCalls:0}}}
      }
    };
    await page.evaluate(data => {
      window.getStoredAccessKey = () => 'owner_test_key';
      window.__usageRequests = [];
      window.fetch = async (url, options) => {
        window.__usageRequests.push({ url:String(url), key:options?.headers?.['x-app-key'] });
        return {ok:true,json:async()=>data};
      };
      document.getElementById('accountPanel').style.display = 'block';
      document.getElementById('accountOwnerTools').style.display = 'block';
      document.querySelector('#accountOwnerTools > details.owner-fold').open = true;
      document.getElementById('ownerUsage').open = true;
    }, api);
    await page.waitForFunction(() => document.querySelector('#ownerUsage .owner-usage-number')?.textContent.includes('1,234'), {timeout:10000});
    check('lifetime usage, cost and estimate visible', await page.evaluate(() => {
      const el = document.getElementById('ownerUsage');
      return el.textContent.includes('1,234') && el.textContent.includes('$6.42') && el.textContent.includes('estimate') && el.textContent.includes('lower bound');
    }));
    check('endpoint uses owner key and no-store request', await page.evaluate(() =>
      window.__usageRequests.length === 1 &&
      window.__usageRequests[0].url === '/api/admin-license-lookup?action=usage-stats' &&
      window.__usageRequests[0].key === 'owner_test_key'));
    await page.$eval('#ownerUsage .owner-usage-period button:last-child', el => el.click());
    check('month toggle changes data without refetching', await page.evaluate(() =>
      document.querySelector('#ownerUsage .owner-usage-number')?.textContent === '57' &&
      window.__usageRequests.length === 1));
    check('protocol display stays at seven fixed rows', await page.$$eval('#ownerUsage tbody tr', rows => rows.length === 7));
    check('no extra reports are invented for omitted protocols', await page.evaluate(() =>
      [...document.querySelectorAll('#ownerUsage tbody tr')].some(tr => tr.textContent.includes('Blitz') && tr.textContent.includes('0'))));
    await page.setViewport({width:320,height:760});
    check('visible stats panel stays within 320px viewport', await page.$eval('#ownerUsage', el => el.clientWidth > 0 && el.scrollWidth <= el.clientWidth + 1));
    await page.close();
  } catch(error) {
    console.error('Owner usage UI test error:', error.message);
    check('browser owner usage test completes', false);
  } finally { await browser.close(); }
  return getFailures();
};
