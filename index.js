import puppeteer from 'puppeteer';

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
}

async function getAvailableGroups(page) {
  // After switching clubs we need to load to group view twice, and visit some other page in
  // between. The first load always only displays 'Korvausjärjestelmä ei ole käytössä
  // valmennustasoillasi.'
  await page.goto('https://tennisclub.fi/pelaaja/kj-store/search');
  await page.waitForNetworkIdle({ idleTime: 500 });
  await page.goto('https://tennisclub.fi/pelaaja/group/index');
  await page.waitForNetworkIdle({ idleTime: 500 });
  await page.goto('https://tennisclub.fi/pelaaja/kj-store/search');
  await page.waitForNetworkIdle({ idleTime: 500 });

  const availableWeeks = await page.evaluate(() =>
    Array.from(
      document.querySelector('select[name="date_monday"]').children
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

async function main() {
  const browser = await puppeteer.launch({ headless: false });
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
  const smashGroups = await getAvailableGroups(page);

  const allGroups = [...kirteGroups, ...smashGroups];
  console.log(allGroups);

  await browser.close();
}

await main();
