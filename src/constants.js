import iconLists from "virtual:icon-lists";

export const PRESET_SIZES = [12, 16, 20, 24, 32, 40, 48, 64];

export const ICON_LIBRARIES = {
  lucide: {
    name: "Lucide",
    desc: `${iconLists.lucide.length} icons`,
    fetchList: async () => iconLists.lucide,
    fetchSvg: async (n) => { const r = await fetch(`/icons/lucide/${n}.svg`); return r.text(); },
  },
  tabler: {
    name: "Tabler",
    desc: `${iconLists.tabler.length} icons`,
    fetchList: async () => iconLists.tabler,
    fetchSvg: async (n) => { const r = await fetch(`/icons/tabler/${n}.svg`); return r.text(); },
  },
  heroicons: {
    name: "Heroicons",
    desc: `${iconLists.heroicons.length} icons`,
    fetchList: async () => iconLists.heroicons,
    fetchSvg: async (n) => { const r = await fetch(`/icons/heroicons/${n}.svg`); return r.text(); },
  },
};
