import puppeteer from 'puppeteer';

async function waitAndClick(page, selector) {
  await page.waitForSelector(selector);
  await page.click(selector);
}

function getDataFromGroupText(groupText) {
  const [, locationRaw, playersRaw] = groupText.split('\n');
  const [, location] = locationRaw.match(/\s*(.*)varaa/);
  const [, players] = playersRaw.match(/\s*(.*)/);
  return { location, players };
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

  await page.goto('https://tennisclub.fi/pelaaja/kj-store/search');

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

  console.log(availableGroups);

  await browser.close();
}

await main();
