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

Scrambled Seas only loads files made for its current save format. When an update changes it, change `FORMAT_VERSION` in `generator.js` and update the fixture in `fixtures/`. Also check that the update didn't change the save file's fields, the default spacing values or how archipelagos are placed, since the page copies those.
