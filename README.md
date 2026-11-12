# Scrambled Seas World Generator

Make [Scrambled Seas](https://github.com/NANDbrew/scrambled-seas) worlds bigger than the in-game world scale allows, up to the whole globe, so islands could be anywhere on your journey.

**[Open the World Generator](https://skeptic043.github.io/scrambled-seas-world-generator/)**

## Requirements

- [Scrambled Seas 7.3.1](https://github.com/NANDbrew/scrambled-seas/releases/tag/v7.3.1)
- [Border Expander](https://github.com/NANDbrew/BorderExpander/releases/latest)

## How it works

1. Open the [World Generator](https://skeptic043.github.io/scrambled-seas-world-generator/), choose your settings and select **Generate XML**.
2. Put the downloaded `scrambled-seas-<seed>.xml` in `BepInEx/plugins/ScrambledSeas` inside your Sailwind folder or mod profile.
3. In Sailwind, turn on Scrambled Seas on the new game screen, load the file from its file list and start a new game.

Scrambled Seas builds the world from the file's seed when the game starts. The same seed and settings always make the same world, so share them to share a world.

## Settings

| Setting | Default | Options |
| --- | --- | --- |
| Area limits | Whole globe | The world never goes outside these. Longitude −180° to 180°, latitude −70° to 70°, at least 44° wide and 20° tall. |
| World scale | `1x` | `1x` is Scrambled Seas' normal world with Border Expander. The world and the space between archipelagos grow together, like the in-game slider. Area limits trim the world where they're smaller, and the highest scale fills them. |
| Spread archipelagos out evenly | Off | Keeps archipelagos further apart so they don't bunch up. Distances still vary. |
| Island spread | `1x` | `0.5x` to `5.4x`. How far an archipelago's islands spread from its centre. |
| Seed | Random | Any whole number except 0. |

The preview shows how big the world and its archipelagos are. It doesn't show where the seed puts them.

When the area limits make the world too narrow for the spacing at that scale, the page lowers the spacing to the most that fits, so the game doesn't freeze while placing archipelagos.

## Compatibility

Files only work with the Scrambled Seas version listed above.

## Known issues

- Archipelagos either side of the 180° line can end up closer together than the spacing allows elsewhere

## AI Use

AI was used to write all of the code in this project. The original concept, design direction, testing, debugging, and release decisions are my own. If you prefer not to use tools developed with AI assistance, I understand and respect that choice.

## Links

[Report an issue](https://github.com/Skeptic043/scrambled-seas-world-generator/issues) · [Source code](https://github.com/Skeptic043/scrambled-seas-world-generator) · [Release notes](https://github.com/Skeptic043/scrambled-seas-world-generator/blob/main/CHANGELOG.md) · [Build instructions](https://github.com/Skeptic043/scrambled-seas-world-generator/blob/main/BUILDING.md) · [License](https://github.com/Skeptic043/scrambled-seas-world-generator/blob/main/LICENSE) · [Support on Ko-fi](https://ko-fi.com/skeptic043) · skeptic043
