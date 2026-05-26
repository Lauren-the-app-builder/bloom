// ---------- Gradient Library ----------
// 5 signature soft pastel gradients for workout card backgrounds.

export const SCENES = [
  { id: "blush-peach",   name: "Blush Peach",   gradient: "linear-gradient(135deg, #D8A8D4 0%, #F0B8C8 35%, #F8C8B0 70%, #FAD0B0 100%)" },
  { id: "sky-rose",      name: "Sky Rose",      gradient: "linear-gradient(180deg, #A8C8E8 0%, #D4C4E4 50%, #F4C8D4 100%)" },
  { id: "peach-lilac",   name: "Peach Lilac",   gradient: "linear-gradient(135deg, #FAD0B0 0%, #F8C0C8 35%, #E8B8D8 70%, #C8B0E0 100%)" },
  { id: "mint-blush",    name: "Mint Blush",    gradient: "linear-gradient(135deg, #B8E0D0 0%, #D4D4E8 35%, #E8C8D8 70%, #F4B8C8 100%)" },
  { id: "lavender-gold", name: "Lavender Gold", gradient: "linear-gradient(135deg, #C8B0E0 0%, #E0B8D4 35%, #F0C8B8 70%, #F8D8A0 100%)" },
];

export function getScene(id) {
  return SCENES.find(s => s.id === id) || SCENES[0];
}

export function defaultSceneFor(name) {
  if (!name) return "blush-peach";
  const n = name.toLowerCase();
  if (n.includes("glute")) return "blush-peach";
  if (n.includes("shoulder") || n.includes("press") || n.includes("push") || n.includes("chest")) return "sky-rose";
  if (n.includes("pull") || n.includes("back") || n.includes("row")) return "lavender-gold";
  if (n.includes("leg") || n.includes("squat") || n.includes("quad")) return "peach-lilac";
  if (n.includes("rest") || n.includes("recovery")) return "mint-blush";
  return "blush-peach";
}

// Renders a div with the gradient as its background, fills parent.
export function SceneSvg({ id, style = {} }) {
  const scene = getScene(id);
  return (
    <div style={{ width: "100%", height: "100%", background: scene.gradient, ...style }} />
  );
}
