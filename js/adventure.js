import { worldThemeForUnit } from './world-themes.js';

export const MAP_WIDTH = 460;
export const MIN_MAP_HEIGHT = 500;

const REFERENCE_ROUTE = [
  [.16, .84], [.43, .84], [.68, .78], [.84, .63],
  [.58, .59], [.30, .64], [.16, .47], [.38, .35],
  [.64, .38], [.83, .25], [.56, .20], [.29, .20]
];

const GAME_TASKS = {
  runner: count => `${count} 道选路题`,
  listen: count => `${count} 道听音题`,
  assemble: count => `${count} 道拼装题`,
  memory: count => `${count} 对记忆卡牌`,
  beat: count => `${count} 道诗词填空`,
  battle: count => `两队各 ${count} 题`
};

const ITEMS_PER_GAME = {
  runner: 8,
  listen: 8,
  assemble: 6,
  memory: 6,
  beat: 4,
  battle: 5
};

function chunk(list, size) {
  const result = [];
  for (let index = 0; index < list.length; index += size) {
    result.push(list.slice(index, index + size));
  }
  return result;
}

function normalizeLesson(lesson, unitId, unitIndex, lessonIndex) {
  const source = lesson && typeof lesson === 'object' ? lesson : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const id = typeof source.id === 'string' && source.id
    ? source.id
    : `${unitId}-l${lessonIndex + 1}`;
  return {
    id,
    unitId,
    unitIndex,
    lessonIndex,
    title: source.title || `第 ${lessonIndex + 1} 组`,
    items,
    questions
  };
}

function normalizeUnit(unit, unitIndex) {
  const source = unit && typeof unit === 'object' ? unit : {};
  const unitId = typeof source.id === 'string' && source.id ? source.id : `u${unitIndex + 1}`;
  const explicitLessons = Array.isArray(source.lessons) ? source.lessons : null;
  const items = Array.isArray(source.items) ? source.items : [];
  const lessons = explicitLessons
    ? explicitLessons.map((lesson, index) => normalizeLesson(lesson, unitId, unitIndex, index))
    : chunk(items, 6).map((group, index) => normalizeLesson(
      { id: `${unitId}-l${index + 1}`, title: `第 ${index + 1} 组`, items: group },
      unitId,
      unitIndex,
      index
    ));
  return {
    id: unitId,
    index: unitIndex,
    title: source.title || `第 ${unitIndex + 1} 单元`,
    note: source.note || '',
    lessons
  };
}

export function normalizeUnits(pack) {
  if (!pack) return [];
  if (Array.isArray(pack.units) && pack.units.length) {
    return pack.units
      .map((unit, index) => normalizeUnit(unit, index))
      .filter(unit => unit.lessons.length);
  }
  if (Array.isArray(pack.poems) && pack.poems.length) {
    return pack.poems
      .map((poem, index) => normalizeUnit({
        id: poem.id,
        title: `${poem.title} · ${poem.author}`,
        lessons: chunk(poem.cloze || [], 2).map((questions, lessonIndex) => ({
          id: `${poem.id}-q${lessonIndex + 1}`,
          title: `第 ${lessonIndex + 1} 组填空`,
          questions: questions.map(question => ({
            ...question,
            poemId: poem.id,
            title: poem.title,
            author: poem.author,
            lineText: poem.lines[question.line]
          }))
        }))
      }, index))
      .filter(unit => unit.lessons.length);
  }
  if (Array.isArray(pack.items) && pack.items.length) {
    return [normalizeUnit({ id: 'u1', title: pack.name || '教材内容', items: pack.items }, 0)];
  }
  return [];
}

export function themeForUnit(unitIndex) {
  return worldThemeForUnit(unitIndex);
}

export function getAdventureUnits(gameId, pack) {
  return normalizeUnits(pack).map(unit => {
    const theme = themeForUnit(unit.index);
    const lessons = unit.lessons.map(lesson => ({
      ...lesson,
      number: 0,
      theme: theme.id,
      regionName: theme.name,
      terrain: theme.terrain,
      areas: theme.landmarks.slice(0, 3),
      taskLabel: (GAME_TASKS[gameId] || GAME_TASKS.runner)(
        Math.min(ITEMS_PER_GAME[gameId] || 6, Math.max(lesson.items.length, 1))
      )
    }));
    return {
      ...unit,
      theme,
      lessons,
      firstNumber: 0,
      lastNumber: 0
    };
  });
}

export function getAdventureLevels(gameId, pack) {
  const units = getAdventureUnits(gameId, pack);
  const levels = [];
  units.forEach(unit => {
    unit.firstNumber = levels.length + 1;
    unit.lessons.forEach(lesson => {
      lesson.number = levels.length + 1;
      levels.push(lesson);
    });
    unit.lastNumber = levels.length;
  });
  return { units, levels };
}

export function getAdventureLevel(gameId, pack, levelId) {
  return getAdventureLevels(gameId, pack).levels.find(level => level.id === levelId) || null;
}

export function getNextLevelId(levels, levelId) {
  const index = levels.findIndex(level => level.id === levelId);
  return index >= 0 && index < levels.length - 1 ? levels[index + 1].id : null;
}

export function getPreviousLevelId(levels, levelId) {
  const index = levels.findIndex(level => level.id === levelId);
  return index > 0 ? levels[index - 1].id : null;
}

export function layoutUnitLessons(lessons) {
  const count = lessons.length;
  if (count >= 4 && count <= REFERENCE_ROUTE.length) {
    const nodes = lessons.map((lesson, index) => {
      const sourceIndex = count === 1
        ? 0
        : Math.round(index * (REFERENCE_ROUTE.length - 1) / (count - 1));
      const point = REFERENCE_ROUTE[sourceIndex];
      return {
        ...lesson,
        node: {
          x: point[0] * 100,
          y: point[1] * 100,
          left: point[0] * 100,
          top: point[1] * 100
        }
      };
    });
    return { height: Math.max(540, Math.min(680, 470 + count * 9)), nodes };
  }
  const rows = Math.max(1, Math.ceil(count / 2));
  const height = Math.max(MIN_MAP_HEIGHT, rows * 82 + 150);
  const columns = [[22, 78], [18, 74], [27, 82]];
  const shortRoute = count === 1
    ? [[50, 72]]
    : count === 2
      ? [[28, 82], [72, 34]]
      : count === 3
        ? [[22, 88], [50, 57], [80, 25]]
        : null;
  const nodes = lessons.map((lesson, index) => {
    const row = Math.floor(index / 2);
    const position = index % 2;
    const rowColumns = columns[row % columns.length];
    const column = row % 2 === 0 ? rowColumns[position] : rowColumns[1 - position];
    const y = rows === 1
      ? 78
      : 88 - (row * 72) / Math.max(1, rows - 1);
    const point = shortRoute?.[index];
    return {
      ...lesson,
      node: {
        x: point?.[0] ?? column,
        y: point?.[1] ?? y,
        left: point?.[0] ?? column,
        top: point?.[1] ?? y
      }
    };
  });
  return { height, nodes };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

export function buildRoutePath(nodeList, mapHeight = MIN_MAP_HEIGHT) {
  if (!nodeList || nodeList.length < 2) return '';
  const points = nodeList.map(node => ({
    x: (node.node.x / 100) * MAP_WIDTH,
    y: (node.node.y / 100) * mapHeight
  }));
  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6
    };
    const control2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6
    };
    path += ` C ${round(control1.x)} ${round(control1.y)}, ${round(control2.x)} ${round(control2.y)}, ${round(next.x)} ${round(next.y)}`;
  }
  return path;
}

export function iconForGame(gameId) {
  return {
    runner: 'assets/kenney/characters/adventurer-run1.png',
    listen: 'assets/kenney/characters/adventurer-talk.png',
    assemble: 'assets/kenney/ui/icon-checkmark.png',
    memory: 'assets/kenney/platformer/flag_green_a.png',
    beat: 'assets/kenney/platformer/flag_yellow_a.png',
    battle: 'assets/kenney/platformer/flag_blue_b.png'
  }[gameId] || 'assets/kenney/ui/star.png';
}

