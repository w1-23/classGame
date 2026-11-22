import { createMapPrimitives } from './map-primitives.js';

const TREE_KIND = {
  forest: 'forest',
  stream: 'forest',
  mountain: 'mountain',
  orchard: 'orchard',
  coast: 'coast',
  snow: 'snow'
};

const TREE_PLACEMENTS = [
  [.06, .94, .75], [.09, .72, .7], [.26, .95, .9], [.52, .94, .8],
  [.89, .88, 1], [.95, .79, .8], [.98, .57, .62], [.72, .54, .55],
  [.47, .71, .6], [.07, .54, .7], [.07, .31, .6], [.41, .22, .6],
  [.91, .14, .6], [.75, .12, .7], [.45, .49, .48]
];

const WATER_SEGMENTS = [
  {
    from: [-.05, .36],
    control1: [.27, .45],
    control2: [.41, .50],
    to: [.64, .49]
  },
  {
    from: [.64, .49],
    control1: [.85, .48],
    control2: [.85, .65],
    to: [1.05, .72]
  }
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function prepareCanvas(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 1 || height < 1) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function catmullRom(points, steps = 32) {
  if (points.length < 2) return points;
  const result = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push([0, 1].map(axis => (
        .5 * (
          (2 * current[axis]) +
          (-previous[axis] + next[axis]) * t +
          (2 * previous[axis] - 5 * current[axis] + 4 * next[axis] - after[axis]) * t2 +
          (-previous[axis] + 3 * current[axis] - 3 * next[axis] + after[axis]) * t3
        )
      )));
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function cubicPoint(start, control1, control2, end, ratio) {
  const inverse = 1 - ratio;
  return [0, 1].map(axis => (
    inverse ** 3 * start[axis] +
    3 * inverse * inverse * ratio * control1[axis] +
    3 * inverse * ratio * ratio * control2[axis] +
    ratio ** 3 * end[axis]
  ));
}

function waterSamples(width, height) {
  const samples = [];
  WATER_SEGMENTS.forEach(segment => {
    const start = [segment.from[0] * width, segment.from[1] * height];
    const control1 = [segment.control1[0] * width, segment.control1[1] * height];
    const control2 = [segment.control2[0] * width, segment.control2[1] * height];
    const end = [segment.to[0] * width, segment.to[1] * height];
    for (let step = samples.length ? 1 : 0; step <= 24; step += 1) {
      samples.push(cubicPoint(start, control1, control2, end, step / 24));
    }
  });
  return samples;
}

function tracePolyline(context, points) {
  context.beginPath();
  points.forEach((point, index) => (
    index ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1])
  ));
}

function strokeRoute(context, width, height, color, lineWidth, route) {
  context.beginPath();
  route.forEach((point, index) => {
    const x = point[0] * width;
    const y = point[1] * height;
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

function drawTerrain(context, width, height, theme, palette, primitives) {
  context.fillStyle = theme.ground;
  context.fillRect(0, 0, width, height);
  primitives.oval(context, width * .08, height * .80, width * .45, height * .34, palette['leaf-hi']);
  primitives.oval(context, width * .87, height * .13, width * .60, height * .28, palette.soft);
  primitives.oval(context, width * .60, height * .96, width * .38, height * .15, palette.soft);
}

function drawWater(context, width, height, samples, scale, palette, theme) {
  const widthBoost = theme.id === 'stream' || theme.id === 'coast' ? 1.45 : 1;
  tracePolyline(context, samples);
  context.strokeStyle = palette.foam;
  context.lineWidth = 62 * scale * widthBoost;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();
  tracePolyline(context, samples);
  context.strokeStyle = palette.water;
  context.lineWidth = 48 * scale * widthBoost;
  context.stroke();
  tracePolyline(context, samples);
  context.strokeStyle = 'rgba(255,255,255,.34)';
  context.lineWidth = Math.max(1, 1.5 * scale);
  context.setLineDash([8 * scale, 13 * scale]);
  context.stroke();
  context.setLineDash([]);
}

function drawSnow(context, width, height, palette, primitives) {
  for (let index = 0; index < 24; index += 1) {
    primitives.oval(
      context,
      width * ((index * .137) % 1),
      height * ((index * .219) % 1),
      1.7,
      1.7,
      palette.panel
    );
  }
}

function drawMountains(context, width, height, scale, palette, primitives) {
  const mountainY = height * .085;
  [[.07, .8], [.18, 1.1], [.92, 1]].forEach(([x, size]) => {
    const mountainScale = size * scale;
    primitives.polygon(context, [
      [width * x - 35 * mountainScale, mountainY + 56 * mountainScale],
      [width * x, mountainY - 25 * mountainScale],
      [width * x + 44 * mountainScale, mountainY + 56 * mountainScale]
    ], palette.rock);
    primitives.polygon(context, [
      [width * x - 11 * mountainScale, mountainY + mountainScale],
      [width * x, mountainY - 25 * mountainScale],
      [width * x + 15 * mountainScale, mountainY + 3 * mountainScale]
    ], palette.snow);
  });
}

function drawScenery(context, width, height, theme, scale, palette, primitives) {
  const kind = TREE_KIND[theme.id] || 'forest';
  TREE_PLACEMENTS.forEach(([x, y, size], index) => {
    if (theme.id === 'mountain' && index % 5 === 2) {
      primitives.rock(context, width * x, height * y, size * scale * 1.2);
      return;
    }
    primitives.tree(context, width * x, height * y, size * scale, kind);
  });

  if (theme.id === 'coast') {
    primitives.rock(context, width * .08, height * .93, .4 * scale);
    primitives.rock(context, width * .92, height * .84, .45 * scale);
  }
  if (theme.id === 'snow') drawSnow(context, width, height, palette, primitives);
  if (theme.id === 'orchard') {
    for (let index = 0; index < 8; index += 1) {
      primitives.oval(context, width * (.08 + index * .022), height * (.47 - index * .003), 2.1, 1.5, palette.gold);
      primitives.oval(context, width * (.82 + index * .019), height * (.37 + index * .004), 2.1, 1.5, palette.gold);
    }
  }
}

function waterYAt(samples, x) {
  if (!samples.length) return 0;
  if (x <= samples[0][0]) return samples[0][1];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (current[0] < x) continue;
    const span = current[0] - previous[0];
    const ratio = span ? (x - previous[0]) / span : 0;
    return previous[1] + (current[1] - previous[1]) * ratio;
  }
  return samples[samples.length - 1][1];
}

function findBridge(route, width, height, samples) {
  let previous = null;
  for (let index = 0; index < route.length; index += 1) {
    const x = route[index][0] * width;
    const y = route[index][1] * height;
    const delta = y - waterYAt(samples, x);
    if (previous && previous.delta * delta <= 0) {
      return {
        index,
        ratio: Math.abs(previous.delta) /
          Math.max(.001, Math.abs(previous.delta) + Math.abs(delta))
      };
    }
    previous = { delta };
  }
  return null;
}

function drawBridge(context, route, crossing, width, height, scale, palette) {
  if (!crossing) return;
  const radius = Math.max(2, Math.round(2.5 * scale));
  const start = Math.max(0, crossing.index - radius);
  const end = Math.min(route.length - 1, crossing.index + radius);
  const deck = route.slice(start, end + 1);
  strokeRoute(context, width, height, palette.trunk, 25 * scale, deck);
  strokeRoute(context, width, height, palette.sand, 18 * scale, deck);

  for (let index = 1; index < deck.length - 1; index += 2) {
    const point = deck[index];
    const next = deck[index + 1];
    const x = point[0] * width;
    const y = point[1] * height;
    const dx = (next[0] - point[0]) * width;
    const dy = (next[1] - point[1]) * height;
    const length = Math.hypot(dx, dy) || 1;
    context.beginPath();
    context.moveTo(x - dy / length * 9 * scale, y + dx / length * 9 * scale);
    context.lineTo(x + dy / length * 9 * scale, y - dx / length * 9 * scale);
    context.strokeStyle = palette.trunk;
    context.lineWidth = Math.max(1, 1.5 * scale);
    context.stroke();
  }
}

function drawGroundDetails(context, width, height, theme, route, scale, palette, primitives) {
  const placementCount = Math.max(20, Math.round(width / 45));
  for (let index = 0; index < placementCount; index += 1) {
    const x = width * ((index * .163 + .12) % 1);
    const y = height * ((index * .097 + .07) % 1);
    if (route.some(point => Math.hypot(point[0] * width - x, point[1] * height - y) < 38 * scale)) {
      continue;
    }
    primitives.oval(
      context,
      x,
      y,
      2.2 * scale,
      1.3 * scale,
      theme.id === 'snow' ? palette.panel : palette['leaf-dark']
    );
    primitives.oval(
      context,
      x + 5 * scale,
      y - 4 * scale,
      1.8 * scale,
      1.5 * scale,
      theme.id === 'snow' ? palette.panel : palette['leaf-hi']
    );
  }

  context.beginPath();
  context.moveTo(0, height * .94);
  context.bezierCurveTo(width * .2, height * .90, width * .7, height * .99, width, height * .93);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fillStyle = palette.shadow;
  context.globalAlpha = .22;
  context.fill();
  context.globalAlpha = 1;
}

function paletteForTheme(theme) {
  return {
    soft: theme.ridgeFar,
    'leaf-hi': theme.trees[1],
    'leaf-dark': theme.trees[2],
    water: theme.water,
    foam: theme.waterBank,
    rock: theme.ridgeNear,
    snow: theme.id === 'snow' ? '#ffffff' : '#eff4e9',
    sand: theme.road,
    trunk: theme.trunk,
    gold: theme.id === 'orchard' ? '#d9ac52' : theme.trees[1],
    panel: '#fffef7',
    shadow: 'rgba(55,80,61,.18)'
  };
}

export function drawAdventureMap(canvas, nodes, theme) {
  const prepared = prepareCanvas(canvas);
  if (!prepared || !nodes?.length) return;
  const { context, width, height } = prepared;
  const scale = clamp(width / 600, .72, 1.35);
  const palette = paletteForTheme(theme);
  const primitives = createMapPrimitives(palette);
  const points = nodes.map(node => [node.node.x / 100, node.node.y / 100]);
  const route = catmullRom(points);
  const water = waterSamples(width, height);

  context.clearRect(0, 0, width, height);
  drawTerrain(context, width, height, theme, palette, primitives);
  drawWater(context, width, height, water, scale, palette, theme);
  drawMountains(context, width, height, scale, palette, primitives);
  drawScenery(context, width, height, theme, scale, palette, primitives);

  strokeRoute(context, width, height, theme.roadEdge, 23 * scale, route);
  strokeRoute(context, width, height, theme.road, 17 * scale, route);
  drawBridge(context, route, findBridge(route, width, height, water), width, height, scale, palette);
  drawGroundDetails(context, width, height, theme, route, scale, palette, primitives);
}
