import * as fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import * as constants from './constants.js';

async function waitAndClick(page, selector) {
  await page.waitForSelector(selector);
  await page.click(selector);
}

function getDataFromGroupText(groupText) {
  const [, timeAndLocationRaw, playersRaw] = groupText.split('\n');
  const [, timeAndLocation] = timeAndLocationRaw.match(/\s*(.*)varaa/);
  const [, players] = playersRaw.match(/\s*(.*)/);
  return { timeAndLocation, players };
}

async function switchToClub(page, club) {
  const clubToOptionValue = {
    kirte: '3071031',
    smash: '3068439',
  };

  await page.goto('https://tennisclub.fi/pelaaja/site/user-club');

  const optionValue = clubToOptionValue[club];
  await page.select('#selectclubform-person_id', optionValue);

  await page.click('.btn-primary');

  await page.waitForNetworkIdle({ idleTime: 2000 });

  // After switching clubs we need to load the replacement page and some other page to make
  // replacement options visible. Otherwise we'll only get 'Korvausjärjestelmä ei ole käytössä
  // valmennustasoillasi.' text. This seems to be a bug with tennisclub.
  await page.goto('https://tennisclub.fi/pelaaja/kj-store/search');
  await page.waitForNetworkIdle({ idleTime: 500 });
  await page.goto('https://tennisclub.fi/pelaaja/group/index');
  await page.waitForNetworkIdle({ idleTime: 500 });
}

async function switchReplacementLocation(page, locationOption) {
  await page.goto('https://tennisclub.fi/pelaaja/kj-store/list');
  await page.waitForNetworkIdle({ idleTime: 500 });
  await page.select('select[name="level_id"]', locationOption);
  await page.waitForNetworkIdle({ idleTime: 500 });
}

async function getAvailableGroups(page) {
  await page.goto('https://tennisclub.fi/pelaaja/kj-store/search');
  await page.waitForNetworkIdle({ idleTime: 500 });

  const availableWeeks = await page.evaluate(() =>
    Array.from(
      document.querySelector('select[name="date_monday"]')?.children ?? []
    ).map((optionElement) => optionElement.value)
  );

  const availableGroups = [];

  for (const week of availableWeeks) {
    const weekUrl = `https://tennisclub.fi/pelaaja/kj-store/search?date_monday=${week}`;
    await page.goto(weekUrl);
    await page.waitForNetworkIdle({ idleTime: 2000 });

    const groupTexts = await page.evaluate(() =>
      Array.from(document.querySelector('form>ul').children).map(
        (child) => child.textContent
      )
    );

    const weekAvailableGroups = groupTexts.map(getDataFromGroupText);

    availableGroups.push(...weekAvailableGroups);
  }

  return availableGroups;
}

async function sendToTelegram(replacementGroups) {
  if (replacementGroups.length == 0) {
    return;
  }

  const token = process.env.TELEGRAM_TOKEN;

  const groupText = replacementGroups
    .map((group) => `${group.timeAndLocation}\n${group.players}`)
    .join('\n\n');
  const text = `Moro! Taas olis uusia ryhmiä:)\n\n${groupText}`;

  const params = new URLSearchParams({
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text,
  });

  await fetch(`https://api.telegram.org/bot${token}/sendMessage?${params}`);
}

async function removeSeenGroups(groups) {
  const fileName = path.join(process.cwd(), 'latestGroups.json');
  const groupsFile = await fs.readFile(fileName, {
    encoding: 'utf8',
  });

  const seenGroups = JSON.parse(groupsFile);

  return groups.filter(
    (group) =>
      !seenGroups.some(
        (seenGroup) =>
          seenGroup.timeAndLocation === group.timeAndLocation &&
          seenGroup.players === group.players
      )
  );
}

async function saveGroupsToFile(groups) {
  const fileName = path.join(process.cwd(), 'latestGroups.json');
  await fs.writeFile(fileName, JSON.stringify(groups), {
    encoding: 'utf8',
  });
}

async function main() {
  console.log('Looking for new replacement groups');

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://tennisclub.fi');

  const playerButtonSelector = 'a[href="/pelaaja"]';
  await waitAndClick(page, playerButtonSelector);

  await page.waitForSelector('#loginformfront-username');
  await page.type('#loginformfront-username', process.env.USERNAME, {
    delay: 50,
  });
  await page.type('#loginformfront-password', process.env.PASSWORD, {
    delay: 50,
  });
  await page.click('.btn-success');

  await page.waitForNetworkIdle({ idleTime: 2000 });

  await switchToClub(page, 'kirte');
  const kirteGroups = await getAvailableGroups(page);

  await switchToClub(page, 'smash');

  await switchReplacementLocation(page, constants.smashEspooLocationOption);
  const smashEspooGroups = await getAvailableGroups(page);

  await switchReplacementLocation(page, constants.smashHelsinkiLocationOption);
  const smashHelsinkiGroups = await getAvailableGroups(page);

  await browser.close();

  const allGroups = [
    ...kirteGroups,
    ...smashEspooGroups,
    ...smashHelsinkiGroups,
  ];

  const newGroups = await removeSeenGroups(allGroups);
  if (0 < newGroups.length) {
    await sendToTelegram(newGroups);
  }

  console.log(
    `Found ${allGroups.length} groups, ${newGroups.length} of which were new.`
  );

  await saveGroupsToFile(allGroups);
}

await main();
