// Drawing primitives extracted from the approved classGame map handoff.
// Units are CSS pixels. Tree coordinates anchor at the trunk base.
export const REFERENCE_PALETTE = Object.freeze({
  paper: '#f7f8f2',
  panel: '#fffef7',
  ink: '#233d32',
  muted: '#62766b',
  line: '#dce5d8',
  brand: '#32624a',
  'on-brand': '#fffef7',
  soft: '#e9f0e4',
  map: '#deedcb',
  path: '#fbebbd',
  'path-edge': '#b9bc8c',
  sky: '#cce5eb',
  water: '#93cbd4',
  foam: '#d7f3ed',
  leaf: '#58865b',
  'leaf-hi': '#8db67b',
  'leaf-dark': '#366947',
  trunk: '#977b56',
  rock: '#b7c2b0',
  snow: '#eff4e9',
  sand: '#efdfae',
  shadow: '#7895683d',
  gold: '#d9ac52'
});

export function createMapPrimitives(overrides = {}) {
  const palette = { ...REFERENCE_PALETTE, ...overrides };
  function oval(c, x, y, rx, ry, color) {
    c.beginPath();
    c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }
  function polygon(c, points, color) {
    c.beginPath();
    points.forEach((point, index) => (
      index ? c.lineTo(...point) : c.moveTo(...point)
    ));
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }
  function tree(c, x, y, scale, type = 'forest') {
    oval(c, x + 2 * scale, y + 2 * scale, 16 * scale, 5 * scale, palette.shadow);
    c.fillStyle = palette.trunk;
    c.fillRect(x - 3 * scale, y - 33 * scale, 6 * scale, 34 * scale);
    if (type === 'snow' || type === 'mountain' || type === 'ice') {
      polygon(c, [
        [x, y - 65 * scale],
        [x - 21 * scale, y - 13 * scale],
        [x + 21 * scale, y - 13 * scale]
      ], palette['leaf-dark']);
      polygon(c, [
        [x, y - 57 * scale],
        [x - 16 * scale, y - 26 * scale],
        [x + 16 * scale, y - 26 * scale]
      ], type === 'snow' || type === 'ice' ? palette.snow : palette['leaf-hi']);
      return;
    }
    const leaf = type === 'orchard' ? palette.gold : palette.leaf;
    oval(c, x, y - 36 * scale, 21 * scale, 25 * scale, leaf);
    oval(c, x - 10 * scale, y - 31 * scale, 15 * scale, 17 * scale, leaf);
    oval(
      c,
      x + 7 * scale,
      y - 45 * scale,
      13 * scale,
      16 * scale,
      type === 'orchard' ? palette.sand : palette['leaf-hi']
    );
  }
  function rock(c, x, y, scale) {
    oval(c, x, y + 4 * scale, 17 * scale, 5 * scale, palette.shadow);
    polygon(c, [
      [x - 15 * scale, y + 3 * scale],
      [x - 11 * scale, y - 13 * scale],
      [x + 4 * scale, y - 22 * scale],
      [x + 18 * scale, y - 5 * scale],
      [x + 13 * scale, y + 5 * scale]
    ], palette.rock);
    polygon(c, [
      [x - 11 * scale, y - 13 * scale],
      [x + 4 * scale, y - 22 * scale],
      [x + 8 * scale, y - 8 * scale],
      [x - 3 * scale, y - 4 * scale]
    ], palette.snow);
  }
  function cloud(c, x, y, scale) {
    oval(c, x, y, 35 * scale, 9 * scale, palette.panel);
    oval(c, x - 13 * scale, y - 5 * scale, 16 * scale, 11 * scale, palette.panel);
    oval(c, x + 5 * scale, y - 10 * scale, 18 * scale, 15 * scale, palette.panel);
  }
  return { oval, polygon, tree, rock, cloud };
}
