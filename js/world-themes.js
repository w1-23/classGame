const sharedRoads = {
  road: 0xf1dfb7,
  roadEdge: 0xd4bd8d
};

export const WORLD_THEMES = [
  {
    id: 'forest',
    name: '森林',
    terrain: '草地 · 林间小径',
    map: {
      sky: '#DEEDCB',
      ground: '#DEEDCB',
      groundDeep: '#BFD7A5',
      ridgeFar: '#D1E3C0',
      ridgeNear: '#AFCD9C',
      road: '#FBEBBD',
      roadEdge: '#B9BC8C',
      water: '#93CBD4',
      waterBank: '#D7F3ED',
      sun: '#F6DFA0',
      accent: '#2F5D43',
      waterY: .6,
      waterAmp: .028,
      waterPhase: .2,
      treeStyle: 'round',
      trees: ['#58865B', '#8DB67B', '#366947'],
      trunk: '#8B6B4A',
      mountains: [
        { x: 10, y: 61, width: 30, height: 12 },
        { x: 58, y: 61, width: 35, height: 10 }
      ]
    },
    stages: [
      {
        sceneName: '阳光林地',
        detail: 'flowers',
        skyTop: 0xb9e4ef,
        skyBottom: 0xe8f4d9,
        sunTint: 0xffedaa,
        horizon: 0xd3edf0,
        ground: 0x93c777,
        hillFar: 0xb4d6aa,
        hillNear: 0x84bb75,
        treeTint: 0x8bc37b,
        bushTints: [0x8fc871, 0x75b469, 0x639e5b],
        ...sharedRoads
      },
      {
        sceneName: '密林小径',
        detail: 'grove',
        skyTop: 0xb8dde0,
        skyBottom: 0xe2efd4,
        sunTint: 0xffe9a4,
        horizon: 0xd5e8d2,
        ground: 0x86b777,
        hillFar: 0xaacb9d,
        hillNear: 0x77aa6b,
        treeTint: 0x7cb06d,
        bushTints: [0x7fb56d, 0x669a5e, 0x56864f],
        road: 0xeedbb2,
        roadEdge: 0xcdb787
      },
      {
        sceneName: '林间营地',
        detail: 'camp',
        skyTop: 0xeba96f,
        skyBottom: 0xf8e4b9,
        sunTint: 0xffc765,
        horizon: 0xf0d9af,
        ground: 0xa8ba70,
        hillFar: 0xd7c690,
        hillNear: 0xb0b46e,
        treeTint: 0xb4aa61,
        bushTints: [0xb2ae61, 0x999e57, 0x818c4e],
        ...sharedRoads
      }
    ]
  },
  {
    id: 'stream',
    name: '溪谷',
    terrain: '溪水 · 木栈道',
    map: {
      sky: '#D8EDE7',
      ground: '#DDEBCF',
      groundDeep: '#BBD6A3',
      ridgeFar: '#D3E8D4',
      ridgeNear: '#A9C99D',
      road: '#F9EABF',
      roadEdge: '#B5B98A',
      water: '#8CC8D5',
      waterBank: '#D9F2EC',
      sun: '#F2DEA3',
      accent: '#315D4B',
      waterY: .55,
      waterAmp: .045,
      waterPhase: .7,
      treeStyle: 'round',
      trees: ['#5C8C67', '#90B783', '#3D7150'],
      trunk: '#85694B',
      mountains: [
        { x: 12, y: 60, width: 28, height: 13 },
        { x: 64, y: 60, width: 38, height: 16 }
      ]
    },
    stages: [
      {
        sceneName: '溪边栈道',
        detail: 'river',
        skyTop: 0xacdce9,
        skyBottom: 0xdcefdc,
        sunTint: 0xffefbb,
        horizon: 0xc9e7ec,
        ground: 0x83b67c,
        hillFar: 0xa9d0b1,
        hillNear: 0x73ad81,
        treeTint: 0x75af8b,
        bushTints: [0x78b18a, 0x639e75, 0x578b65],
        ...sharedRoads
      },
      {
        sceneName: '木桥水湾',
        detail: 'river',
        skyTop: 0xa6d6e5,
        skyBottom: 0xd9efea,
        sunTint: 0xffe7aa,
        horizon: 0xbfe2e7,
        ground: 0x7fb58a,
        hillFar: 0x9bc8ad,
        hillNear: 0x6ba67c,
        treeTint: 0x6faa8c,
        bushTints: [0x6ea68a, 0x5a9077, 0x4c7e69],
        road: 0xeeddb5,
        roadEdge: 0xcbb78b
      },
      {
        sceneName: '瀑布营地',
        detail: 'waterfall',
        skyTop: 0xa8d8e7,
        skyBottom: 0xe2eed6,
        sunTint: 0xffe29f,
        horizon: 0xc7e4e5,
        ground: 0x88b77a,
        hillFar: 0xa5c9a1,
        hillNear: 0x78aa78,
        treeTint: 0x79ad80,
        bushTints: [0x79ad80, 0x63966c, 0x527f5e],
        road: 0xeeddb5,
        roadEdge: 0xcbb78b
      }
    ]
  },
  {
    id: 'mountain',
    name: '山谷',
    terrain: '岩壁 · 山谷石径',
    map: {
      sky: '#E9E1C8',
      ground: '#DDD1A6',
      groundDeep: '#C6B882',
      ridgeFar: '#E1D6B0',
      ridgeNear: '#C7B68A',
      road: '#F1E3BD',
      roadEdge: '#B7AA84',
      water: '#9FCBD5',
      waterBank: '#D8EEEB',
      sun: '#F2CC79',
      accent: '#6B4A22',
      waterY: .62,
      waterAmp: .022,
      waterPhase: .45,
      treeStyle: 'pine',
      trees: ['#7E9B64', '#A9BC82', '#607A4C'],
      trunk: '#7C6548',
      mountains: [
        { x: 12, y: 62, width: 35, height: 23 },
        { x: 52, y: 62, width: 43, height: 28 }
      ]
    },
    stages: [
      {
        sceneName: '石径山谷',
        detail: 'rocks',
        skyTop: 0xbadbea,
        skyBottom: 0xf2e3c5,
        sunTint: 0xffd37e,
        horizon: 0xefe1c4,
        ground: 0xdcc387,
        hillFar: 0xe1cfaa,
        hillNear: 0xc5ad79,
        treeTint: 0xc0ac73,
        bushTints: [0xbba36a, 0xa89059, 0x8e7b4d],
        road: 0xe7d3a6,
        roadEdge: 0xc9ab77
      },
      {
        sceneName: '岩壁小径',
        detail: 'rocks',
        skyTop: 0xb6d6e5,
        skyBottom: 0xeadbbd,
        sunTint: 0xffcb73,
        horizon: 0xe7d7b9,
        ground: 0xd2bc84,
        hillFar: 0xd7c396,
        hillNear: 0xbaa273,
        treeTint: 0xb7a16b,
        bushTints: [0xb19a63, 0x9a8555, 0x806f47],
        road: 0xe4cda0,
        roadEdge: 0xc3a371
      },
      {
        sceneName: '山巅风口',
        detail: 'rocks',
        skyTop: 0xb1d2df,
        skyBottom: 0xf0dfbd,
        sunTint: 0xffdf91,
        horizon: 0xead9b5,
        ground: 0xd8c38c,
        hillFar: 0xdac79a,
        hillNear: 0xbea779,
        treeTint: 0xbca873,
        bushTints: [0xb9a46b, 0x9f8b59, 0x847349],
        road: 0xe6d1a5,
        roadEdge: 0xc7a977
      }
    ]
  },
  {
    id: 'orchard',
    name: '果园',
    terrain: '果园 · 暖色田埂',
    map: {
      sky: '#F3E4B8',
      ground: '#D8D99B',
      groundDeep: '#BBC07E',
      ridgeFar: '#E5DBB2',
      ridgeNear: '#C7C98C',
      road: '#F8E7B7',
      roadEdge: '#BDB787',
      water: '#98C9D2',
      waterBank: '#DCF0EA',
      sun: '#F2C466',
      accent: '#66502B',
      waterY: .59,
      waterAmp: .026,
      waterPhase: 1.1,
      treeStyle: 'orchard',
      trees: ['#88A24F', '#B3C276', '#678240'],
      trunk: '#866A47',
      mountains: [
        { x: 9, y: 60, width: 30, height: 14 },
        { x: 63, y: 60, width: 37, height: 18 }
      ]
    },
    stages: [
      {
        sceneName: '秋日果园',
        detail: 'orchard',
        skyTop: 0x9bcee2,
        skyBottom: 0xf8e4b0,
        sunTint: 0xffd071,
        horizon: 0xf2dca9,
        ground: 0xc5bb76,
        hillFar: 0xd9c38d,
        hillNear: 0xb8a86d,
        treeTint: 0xaeb566,
        bushTints: [0xabb567, 0x8f9f5b, 0x77894e],
        road: 0xe7d3a6,
        roadEdge: 0xc9ab77
      },
      {
        sceneName: '果树林道',
        detail: 'orchard',
        skyTop: 0xa8d4e3,
        skyBottom: 0xf6dfad,
        sunTint: 0xffc967,
        horizon: 0xefd9a5,
        ground: 0xbfb873,
        hillFar: 0xd6c18b,
        hillNear: 0xb3a56b,
        treeTint: 0xaab166,
        bushTints: [0xa5af63, 0x8b9b57, 0x74854b],
        road: 0xe5d0a2,
        roadEdge: 0xc6a975
      },
      {
        sceneName: '丰收营地',
        detail: 'camp',
        skyTop: 0xe4b77b,
        skyBottom: 0xf6e4b6,
        sunTint: 0xffbd59,
        horizon: 0xf0d8a7,
        ground: 0xb4b977,
        hillFar: 0xd9c792,
        hillNear: 0xb7ad73,
        treeTint: 0xb0a65f,
        bushTints: [0xaeb060, 0x949b56, 0x7d854b],
        road: 0xead6aa,
        roadEdge: 0xc9ad7a
      }
    ]
  },
  {
    id: 'coast',
    name: '海岸',
    terrain: '海湾 · 沙岸木道',
    map: {
      sky: '#D0EAF0',
      ground: '#E7D8B3',
      groundDeep: '#CFC092',
      ridgeFar: '#D8E8D4',
      ridgeNear: '#B8D6C4',
      road: '#F8E9C1',
      roadEdge: '#B8AE8B',
      water: '#82C5DA',
      waterBank: '#CFF1F1',
      sun: '#FFE3A0',
      accent: '#315F68',
      waterY: .47,
      waterAmp: .024,
      waterPhase: .9,
      treeStyle: 'coast',
      trees: ['#80A86A', '#A9C98D', '#628C58'],
      trunk: '#8D714F',
      mountains: [
        { x: 8, y: 60, width: 24, height: 10 },
        { x: 66, y: 60, width: 30, height: 13 }
      ]
    },
    stages: [
      {
        sceneName: '晴空海湾',
        detail: 'coast',
        skyTop: 0x84c9e8,
        skyBottom: 0xd9f0f1,
        sunTint: 0xffe8a1,
        horizon: 0xcbe6ed,
        ground: 0xd6c28c,
        hillFar: 0xb8d3c5,
        hillNear: 0xa5c0aa,
        treeTint: 0xaab87d,
        bushTints: [0xa7b576, 0x8e9e62, 0x778852],
        road: 0xe7d3a6,
        roadEdge: 0xc9ab77
      },
      {
        sceneName: '海边栈桥',
        detail: 'coast',
        skyTop: 0x7fc5e4,
        skyBottom: 0xd5eef0,
        sunTint: 0xffe39a,
        horizon: 0xc2e1e8,
        ground: 0xd1bd88,
        hillFar: 0xb1cdbf,
        hillNear: 0x9cb9a3,
        treeTint: 0xa2b277,
        bushTints: [0xa0ae72, 0x87975e, 0x72834e],
        road: 0xe3cda0,
        roadEdge: 0xc4a674
      },
      {
        sceneName: '落日港湾',
        detail: 'coast',
        skyTop: 0xe6a777,
        skyBottom: 0xf7e0b4,
        sunTint: 0xffc264,
        horizon: 0xe8d0b4,
        ground: 0xd3bb84,
        hillFar: 0xcdbd9c,
        hillNear: 0xb2a583,
        treeTint: 0xaf9b67,
        bushTints: [0xab9965, 0x928257, 0x7a6d49],
        road: 0xe9d1a2,
        roadEdge: 0xc7a875
      }
    ]
  },
  {
    id: 'snow',
    name: '雪原',
    terrain: '积雪 · 松林雪径',
    map: {
      sky: '#E1ECF4',
      ground: '#EEF4F8',
      groundDeep: '#D5E3EC',
      ridgeFar: '#E2EDF5',
      ridgeNear: '#C5D9E5',
      road: '#F8FBFC',
      roadEdge: '#B9CCD8',
      water: '#B8DDEA',
      waterBank: '#E7F7FA',
      sun: '#F3F8FF',
      accent: '#2B4A68',
      waterY: .6,
      waterAmp: .022,
      waterPhase: .3,
      treeStyle: 'pine',
      trees: ['#88A8B4', '#B6CED8', '#6F919F'],
      trunk: '#7B6A58',
      mountains: [
        { x: 10, y: 60, width: 32, height: 23 },
        { x: 56, y: 60, width: 39, height: 28 }
      ]
    },
    stages: [
      {
        sceneName: '松林雪原',
        detail: 'snow',
        skyTop: 0xb8d6e8,
        skyBottom: 0xf2f8fb,
        sunTint: 0xf7fbff,
        horizon: 0xd7e6f2,
        ground: 0xe7eef5,
        hillFar: 0xdde8f1,
        hillNear: 0xc2d8e7,
        treeTint: 0xc4d7e4,
        bushTints: [0xd7e6ee, 0xc2d8e5, 0xadc9dc],
        road: 0xf4f7fb,
        roadEdge: 0xc3d2e0
      },
      {
        sceneName: '冰湖驿站',
        detail: 'ice',
        skyTop: 0xa9d4e8,
        skyBottom: 0xeaf8fb,
        sunTint: 0xeaf9ff,
        horizon: 0xd1e3ef,
        ground: 0xdce7ef,
        hillFar: 0xc7dce9,
        hillNear: 0xaecbd9,
        treeTint: 0xb8d0df,
        bushTints: [0xc9dce7, 0xb6cfdd, 0xa1c0d2],
        road: 0xf4f7fb,
        roadEdge: 0xc3d2e0
      },
      {
        sceneName: '星光营地',
        detail: 'stars',
        skyTop: 0x203154,
        skyBottom: 0x6682a0,
        sunTint: 0xfff3c9,
        horizon: 0xbfd3e4,
        ground: 0xd9e5ee,
        hillFar: 0xb9cddd,
        hillNear: 0x9fbcd0,
        treeTint: 0xa8c3d8,
        bushTints: [0xbdcedd, 0xa8bfd1, 0x92adc2],
        road: 0xf4f7fb,
        roadEdge: 0xc3d2e0
      }
    ]
  }
];

export function worldThemeForUnit(unitIndex) {
  const theme = WORLD_THEMES[unitIndex % WORLD_THEMES.length];
  return {
    ...theme,
    ...theme.map,
    map: theme.map,
    landmarks: theme.stages.map(stage => stage.sceneName)
  };
}
