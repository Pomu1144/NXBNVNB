# Ink style: missing art, prompts to generate

A running list. Each entry is a spot in the Ink style that is still drawn with
plain CSS shapes or borrowed art where a hand-painted piece belongs, plus a
prompt to generate it. Generate a batch, drop the sheet in `tools/ui/src/`,
and it gets sliced like `commander_sheet.py` / `team_sheet.py`.

Status: `open` = not generated yet · `done` = in the game.

## Style block (paste before any prompt)

> Traditional Japanese sumi-e ink brushwork on a fully transparent background.
> Black ink with natural dry-brush texture, ragged bristle edges, ink pooling
> where the stroke starts, fine splatter. Accent colour only where stated:
> vermilion red (#b8322a) or muted indigo (#3d6aa6). No text, no letters, no
> kanji, no logos, no borders, no drop shadows, no glow, no gradients, no
> paper texture behind the pieces. Each piece separate with clear empty space
> around it. High resolution, crisp edges.

---

## 1. Teams: empty slot frame (`open`)
Where: Team Formation, the empty front/back-row slots (now a hairline box with
空 / EMPTY text).

> An upright rectangular frame painted with four quick dry-brush strokes, the
> corners overlapping loosely, about 2:3 tall, hollow in the middle, ink thin
> and grey-black like a faint first sketch. Make two variations.

## 2. Ninja Road: floor nodes (`open`)
Where: the ten-floor road on Ninja Road (now plain hairline squares; boss
floors are a red square with a skull glyph).

> A set of five small ink seals, each a roughly square brush-drawn tile about
> the same size, hollow centre: (a) plain black outline, (b) the same filled
> solid black, (c) outline in vermilion with a heavier stroke for a rare
> floor, (d) a thick vermilion seal with a rough brushed skull mark inside
> for a boss floor, (e) a black tile crossed by one confident diagonal stroke
> for a cleared floor. Plus one long thin horizontal brush line, slightly
> uneven, to join the nodes.

## 3. Settings: Interface Style preview tiles (`open`)
Where: Settings → Display → Style (Classic / Glass / Ink cards; the small
previews are drawn with CSS bars).

> Three tiny square thumbnails of a game menu screen, painted in ink as
> abstract layouts, about 1:1: (a) bold blocky panels with a red top bar,
> (b) soft rounded translucent panels, (c) a single sweeping black brush
> stroke across cream space with a small vermilion seal. Simple, iconic,
> readable at 40px.

## 4. Village: news thumbnail (`open`)
Where: the News card on the Ink home screen (now borrows a mission banner,
`assets/missions/banners/arc_academy.webp`).

> A small landscape vignette in sumi-e: a hidden ninja village of tiled roofs
> under a mountain with carved faces, painted in loose black ink washes with
> one vermilion lantern, edges fading to transparent. About 16:10.

---

## Done
- Commander banner, cut-in band, seal, drops (`tools/ui/src/commander_ink_sheet.webp`)
- Team card strokes, washi, brush-line gauges, round seal, tick, splash (`tools/ui/src/team_ink_sheet.webp`)

## One-sheet prompt for everything still `open`

> [Style block above.] One sprite sheet, transparent background, pieces laid
> out in rows with generous space between them:
> Row 1: two upright hollow rectangular frames, four loose dry-brush strokes
> each, faint grey-black (2:3).
> Row 2: five small square brush seals: black outline; solid black; vermilion
> outline (heavier); thick vermilion seal with a rough brushed skull inside;
> black tile with one diagonal stroke. Then one long thin uneven horizontal
> brush line.
> Row 3: three tiny square abstract menu thumbnails: blocky panels with a red
> top bar; soft rounded translucent panels; one black sweep across cream with
> a small vermilion seal.
> Row 4: a small 16:10 ink-wash vignette of a ninja village with tiled roofs
> under a mountain with carved faces, one vermilion lantern, edges fading out.
