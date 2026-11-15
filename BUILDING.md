# Building Scrambled Seas World Generator

## Requirements

- A web browser
- [Node.js](https://nodejs.org/) 20 or later, for the tests only

There is no build step and nothing to install.

## Run

Open `index.html` in a browser.

## Test

```bash
node --test generator.test.mjs
```

The tests check the settings limits and the XML file the page writes. Any failure makes the command fail.

## Updating for a new Scrambled Seas version

Scrambled Seas only loads files made for its current save format. When an update changes it, change `FORMAT_VERSION` in `generator.js` and update the fixture in `fixtures/`. Also check that the update didn't change the save file's fields, the default spacing values, how archipelagos and islands are placed, or which islands belong to which archipelago (`GenerateDefs`), since the page copies those. The preview copies Scrambled Seas' placement exactly, and the tests check it against values the game logged, so a placement change makes them fail.
