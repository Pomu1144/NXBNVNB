# Required UI Assets

## Missing Assets

The chakra gauge system requires the following PNG files:

### 1. Chakra Frame
**Path**: `assets/ui/frames/chakraholder_icon.png`

**Description**: The circular frame/border that goes around each unit portrait

**Specifications**:
- Size: 140px x 140px (for active units) / 100px x 100px (for bench units)
- Format: PNG with transparency
- Should be a circular ring/border
- Must have transparent center to show portrait underneath
- Used for:
  - Circular purple element frame
  - Golden outer frame
  - Any highlight/gloss layer

**Z-Index**: 10 (top layer, always visible)

---

### 2. Rotating Chakra Gauge
**Path**: `assets/ui/gauges/chakra.png`

**Description**: The blue arc segment that rotates to show chakra level

**Specifications**:
- Size: 128px x 128px (for active units) / 88px x 88px (for bench units)
- Format: PNG with transparency
- Should be a circular arc/segment (blue colored)
- Rotates from 0° (empty) to 360° (full chakra)
- Positioned inside the frame
- Partially covers the portrait

**Z-Index**: 2 (middle layer, above portrait but below frame)

---

## Current Asset Structure

```
assets/ui/
├── frames/
│   └── chakraholder_icon.png (MISSING - frame overlay)
└── gauges/
    └── chakra.png (MISSING - rotating arc segment)
```

## Integration

Once assets are provided:
1. Place `chakraholder_icon.png` in `assets/ui/frames/`
2. Place `chakra.png` in `assets/ui/gauges/`
3. The system will automatically load and apply them

The layering order is:
- **Bottom (z-index: 1)**: Unit portrait (circular clipped)
- **Middle (z-index: 2)**: Rotating chakra gauge (rotates based on chakra %)
- **Top (z-index: 10)**: Frame overlay (always on top)
