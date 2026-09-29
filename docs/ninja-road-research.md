# Ninja Road — research notes

What the mode was in *Naruto Shippuden: Ultimate Ninja Blazing* (mobile, service ended Feb 2021), and how this game's version maps to it.

## The original

- **Structure:** a repeatable gauntlet of consecutive battles across a fixed set of maps. The fan wiki gives 10 maps; a 2017 guide describes 20 stages. A boss appeared every 5 stages.
- **Teams:** up to 3 teams of 6 (18 units). The same character could not be placed in more than one team. No team cost limit.
- **Carry-over:** HP did not recover between battles. A team that reached 0 HP could not be used again for the rest of the run, and the run was lost once all three teams fell. Buff durations paused while a team was not fighting.
- **Boss boosts:** defeating a boss granted a temporary power boost that lasted for a set number of turns ("gain as much ground as you can before the effect runs out").
- **Rare maps:** special stages appeared at random. They gave extra rewards and were sometimes easier (one source gives bonus Granny Coins on maps 4, 7, 14 and 18: 100 / 400 / 1800 / 2600).
- **Entry and cycle:** a timed event of up to two weeks. Each run cost stamina (sources give 10 or 20).
- **Rewards:** Granny Cat Coins, spent in Granny Cat's shop on exclusive ninjas and items; milestone rewards for reaching a given number of maps; an Acquisition Stone for clearing every map, once per event.

## Sources

- Naruto Blazing fan wiki, "Ninja Road": https://naruto-blazing.fandom.com/wiki/Ninja_Road (quoted in search results; the page itself returned HTTP 402 to the fetcher)
- UrGameTips, "Ninja Road and Team Building": https://www.urgametips.com/2017/04/naruto-blazing-ninja-road-granny-cat-coins.html
- Naruto Blazing fan wiki, "Health Recovery": https://naruto-blazing.fandom.com/wiki/Health_Recovery (search snippet only)
- Video guide, "How to beat all 20 maps of Ninja Road": https://www.youtube.com/watch?v=9b5mDl_jmPs (title only)

## This game's version (simplified)

| Original | Here |
|---|---|
| 10–20 maps, boss every 5 | 10 floors; bosses on floors 5 (Nine-Tailed Fox) and 10 (Perfect Susanoo), using the Boss Battle giants |
| 3 teams of 6, no shared units | 3 squads picked from saved teams 1–8; a team that shares a unit with another squad can't be picked |
| HP carries over; a wiped team is out | Each unit's HP, chakra and jutsu/ultimate cooldowns carry over. Fallen units stay down, and a squad with no one left is out. The run ends when all 3 are out |
| Temporary boss boost | Beating the floor 5 boss gives +20% ATK for the next 2 floors |
| Random rare maps with bonus coins | Up to 2 random rare floors per run: 3× coins, enemies a little weaker |
| Granny Cat Coins + shop | Granny Coins (`granny_coin`, already sold for in the Shop's Granny Cat tab) and Ryo per floor |
| Milestone rewards; Acquisition Stone once per event | Floor 3 / 5 / 8 milestones; clearing floor 10 gives an Acquisition Stone once per 14-day cycle (5 Ninja Pearls after that) |
| 2-week event | The road resets every 14 days. It can also be reset by hand at any time |
| Stamina entry cost | None. This game has no spendable stamina yet |

Not modelled: stage-specific status effects, a retreat penalty (leaving a floor before it ends just leaves it open), and more than one difficulty.
