# Tennisclub scraper

Node scripts for scraping replacement group data from
[tennisclub.fi](https://tennisclub.fi) and delivering them to a Telegram chat.
For now the program only supports fetching replacement groups for KirTe and
Smash Espoo. However, one can easily extend the script to fetch replacement
groups for their clubs.

## Running

Run the program with npm; this will fetch all available replacement slots and
send them to Telegram.

Before running, set env variables as shown in `.env.example.`.

Also create an empty `latestGroups.json` file that will be used for storing the
replacement groups found by the latest execution of the script.

```bash
npm start
```
