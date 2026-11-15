# Scrambled Seas World Generator

Make [Scrambled Seas](https://github.com/NANDbrew/scrambled-seas) worlds bigger than the in-game world scale allows, up to the whole globe, so islands could be anywhere on your journey.

[Open the World Generator](https://skeptic043.github.io/scrambled-seas-world-generator/)

## How it works

1. Open the [World Generator](https://skeptic043.github.io/scrambled-seas-world-generator/), pick a scenario or choose your own settings, and select `Generate XML`.
2. Put the downloaded `scrambled-seas-…xml` file in `BepInEx/plugins/ScrambledSeas` inside your Sailwind folder or mod profile.
3. In Sailwind, turn on Scrambled Seas on the new game screen, load the file from its file list and start a new game.

Scrambled Seas builds the world from the file's seed when the game starts. The same seed and settings always make the same world, so share them to share a world. `Copy link` gives you a link that opens the page with everything filled in. Spacing never goes past what fits, so the game doesn't freeze while placing archipelagos or islands. When the area limits make the world too narrow for the spacing at that scale, the page lowers the spacing to the most that fits.

## Scenarios

A scenario rolls the settings within its own ranges and picks a seed, and you can still change anything afterwards. `Roll` tries again. `Lock` next to a setting keeps it where it is, both when you roll and when you move other settings.

| Scenario | What it is |
| --- | --- |
| Sprawling Isles | A small world where every archipelago spreads its islands as far as it can |
| Lonely Specks | A huge world with tight little archipelagos far apart |
| Crowded Harbours | Islands packed close together inside each archipelago |
| Trade Route Ribbon | A long, thin band of sea stretched around the globe at a random latitude |
| Chaos | Fully random generation |

## Settings

| Setting | Default | Options |
| --- | --- | --- |
| Area limits | Whole globe | The world never goes outside these. Longitude −180° to 180°, latitude −70° to 70°, at least 44° wide and 20° tall. |
| World scale | `1x` | `0.5x` and up. `1x` is Scrambled Seas' normal world with Border Expander. |
| Island spread | `1x` | `0.5x` to `5.4x`. How far an archipelago's islands spread from its centre. |
| Shape | Auto (44:30) | Width to height, from `1:3.3` to `18:1`. The world is never smaller than 22° by 15°. |
| Centre | Auto (10°E 36°N) | Where the world sits. It shifts to stay inside the area limits. |
| Archipelago spacing | Auto | `0.3x` up to the most that fits. The closest two archipelago centres can be. Auto follows the world scale. |
| Island spacing | Auto | `0.5x` up to the island spread. The closest two islands in an archipelago can be. Auto follows the spread. |
| Seed rules | Keep islands apart | `New seed` and `Roll` keep trying seeds until islands from different archipelagos stay apart, and until your starting archipelago is as far from the others as you specify (if a distance is set). |
| Reset to defaults | | Reset all settings to defaults. |
| Seed | Random | Any whole number except 0. |

## Compatibility

Requires [Scrambled Seas 7.3.1](https://github.com/NANDbrew/scrambled-seas/releases/tag/v7.3.1). [Border Expander](https://github.com/NANDbrew/BorderExpander/releases/latest) isn't required but is highly recommended, because without it the game's border keeps you near the normal map, which heavily limits where a world can be placed.

## Known issues

- Archipelagos either side of the 180° line can end up closer together than the spacing allows elsewhere

## AI Use

AI was used to write all of the code in this project. The original concept, design direction, testing, debugging, and release decisions are my own. If you prefer not to use tools developed with AI assistance, I understand and respect that choice.

## Links

[Report an issue](https://github.com/Skeptic043/scrambled-seas-world-generator/issues) · [Source code](https://github.com/Skeptic043/scrambled-seas-world-generator) · [Release notes](https://github.com/Skeptic043/scrambled-seas-world-generator/blob/main/CHANGELOG.md) · [Build instructions](https://github.com/Skeptic043/scrambled-seas-world-generator/blob/main/BUILDING.md) · [License](https://github.com/Skeptic043/scrambled-seas-world-generator/blob/main/LICENSE) · [Support on Ko-fi](https://ko-fi.com/skeptic043) · skeptic043
